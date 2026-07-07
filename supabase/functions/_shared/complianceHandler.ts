import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AGREEMENT_VERSION,
  agreementsForRole,
  DRIVER_AGREEMENTS,
  RESTAURANT_AGREEMENTS,
} from "./complianceAgreements.ts";
import { computeComplianceStatus, normalizeRole, VALID_ROLES } from "./complianceAuthz.ts";
import { encryptTaxPayload, maskTaxId } from "./taxCrypto.ts";
import { getStripeApiKey } from "./stripeEnv.ts";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function resolveApprovalAction(action: string) {
  if (action === "approve") return { approvalStatus: "approved", reviewStatus: "approved", active: true };
  if (action === "reject") return { approvalStatus: "rejected", reviewStatus: "rejected", active: false };
  if (action === "request_info") return { approvalStatus: "documents_missing", reviewStatus: "pending", active: false };
  if (action === "suspend") return { approvalStatus: "suspended", reviewStatus: "suspended", active: false };
  throwErr("Invalid action");
}

async function applyUserApproval(
  db: SupabaseClient,
  admin: Record<string, unknown>,
  userId: string,
  action: string,
  notes?: string | null
) {
  const { approvalStatus, reviewStatus, active } = resolveApprovalAction(action);
  const { data: user } = await db.from("users").select("*").eq("user_id", userId).maybeSingle();
  if (!user) throwErr("User not found", 404);

  const role = String(user.role || "");
  const entityType = role === "delivery" ? "driver" : role === "vendor" ? "restaurant" : "user";

  await db.from("users").update({
    approval_status: approvalStatus,
    active,
    suspended_at: approvalStatus === "suspended" ? new Date().toISOString() : null,
  }).eq("user_id", userId);

  if (role === "delivery") {
    await db.from("drivers").update({
      approval_status: approvalStatus,
      active,
      suspended_at: approvalStatus === "suspended" ? new Date().toISOString() : null,
    }).eq("user_id", userId);
  }

  if (role === "vendor") {
    await db.from("restaurants").update({
      approval_status: approvalStatus,
      approved: approvalStatus === "approved",
      active: approvalStatus === "approved",
    }).eq("owner_id", userId);
  }

  await db.from("compliance_reviews").update({
    status: reviewStatus,
    approval_status: approvalStatus,
    reviewed_by: admin.user_id,
    reviewed_at: new Date().toISOString(),
    notes: notes || null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).in("status", ["pending", "review"]);

  await writeAuditLog(db, {
    event_type: "approval_changed",
    actor_id: String(admin.user_id),
    user_id: userId,
    entity_type: entityType,
    entity_id: userId,
    message: `Admin ${action} for ${role} ${user.email}`,
    metadata: { action, approval_status: approvalStatus, notes },
  });

  return { status: reviewStatus, approval_status: approvalStatus, user_id: userId, role };
}

export async function writeAuditLog(
  db: SupabaseClient,
  entry: {
    event_type: string;
    user_id?: string;
    actor_id?: string;
    entity_type?: string;
    entity_id?: string;
    severity?: string;
    message?: string;
    metadata?: Record<string, unknown>;
    ip_address?: string;
    user_agent?: string;
  }
) {
  await db.from("audit_logs").insert({
    log_id: uid("aud"),
    event_type: entry.event_type,
    user_id: entry.user_id ?? null,
    actor_id: entry.actor_id ?? null,
    entity_type: entry.entity_type ?? null,
    entity_id: entry.entity_id ?? null,
    severity: entry.severity ?? "info",
    message: entry.message ?? null,
    metadata: entry.metadata ?? {},
    ip_address: entry.ip_address ?? null,
    user_agent: entry.user_agent ?? null,
  });
}

async function loadComplianceContext(db: SupabaseClient, user: Record<string, unknown>) {
  const role = normalizeRole(String(user.role || "customer"));
  const userId = String(user.user_id);

  const { data: acceptances } = await db
    .from("agreement_acceptances")
    .select("agreement_type")
    .eq("user_id", userId);

  const acceptedTypes = (acceptances || []).map((a) => a.agreement_type as string);

  let driver = null;
  let restaurant = null;
  let restaurantOnboarding = null;

  if (role === "delivery") {
    const { data } = await db.from("drivers").select("*").eq("user_id", userId).maybeSingle();
    driver = data;
  }
  if (role === "vendor") {
    const [{ data: rest }, { data: onboarding }] = await Promise.all([
      db.from("restaurants").select("*").eq("owner_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("restaurant_onboarding").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    restaurant = rest;
    restaurantOnboarding = onboarding;
  }

  return computeComplianceStatus({
    role,
    user: user as never,
    driver,
    restaurant,
    restaurantOnboarding,
    acceptedTypes,
  });
}

function parseClientMeta(body: Record<string, unknown>) {
  return {
    ip_address: (body.ip_address as string) || null,
    device: (body.device as string) || null,
    browser: (body.browser as string) || null,
    user_agent: (body.user_agent as string) || null,
  };
}

export async function handleComplianceRequest(
  db: SupabaseClient,
  opts: {
    path: string;
    method: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
    user: Record<string, unknown> | null;
    requireAuth: () => Record<string, unknown>;
    requireRole: (...roles: string[]) => Record<string, unknown>;
  }
): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = opts;
  const requireAuth = opts.requireAuth;
  const requireRole = opts.requireRole;

  if (path === "/auth/compliance-status" && method === "GET") {
    const u = requireAuth();
    const status = await loadComplianceContext(db, u);
    return status;
  }

  if (path === "/agreements/me" && method === "GET") {
    const u = requireAuth();
    const role = normalizeRole(String(u.role));
    const defs = agreementsForRole(role);
    const { data: accepted } = await db
      .from("agreement_acceptances")
      .select("*")
      .eq("user_id", u.user_id);
    const byType = new Map((accepted || []).map((a) => [a.agreement_type, a]));
    return defs.map((d) => ({
      ...d,
      accepted: Boolean(byType.get(d.type)),
      acceptance: byType.get(d.type) || null,
    }));
  }

  if (path === "/agreements/definitions" && method === "GET") {
    const u = requireAuth();
    const role = normalizeRole(String(u.role));
    return { role, agreements: agreementsForRole(role), version: AGREEMENT_VERSION };
  }

  if (path === "/agreements/accept" && method === "POST") {
    const u = requireAuth();
    const role = normalizeRole(String(u.role));
    if (!["delivery", "vendor"].includes(role)) throwErr("Agreements not required for this role");

    const agreementType = String(body.agreement_type || "");
    const defs = agreementsForRole(role);
    const def = defs.find((d) => d.type === agreementType);
    if (!def) throwErr("Unknown agreement type");

    const typedName = String(body.typed_name || "").trim();
    const consent = Boolean(body.consent_checkbox);
    if (def.kind === "signature" && !typedName) throwErr("Typed legal name required");
    if (!consent) throwErr("Consent checkbox required");

    const meta = parseClientMeta(body);
    const acceptanceId = uid("agr");
    const row = {
      acceptance_id: acceptanceId,
      user_id: u.user_id,
      role_context: role,
      agreement_type: agreementType,
      agreement_version: AGREEMENT_VERSION,
      signature: typedName || def.title,
      typed_name: typedName || null,
      consent_checkbox: consent,
      ...meta,
    };

    const { error } = await db.from("agreement_acceptances").upsert(row, {
      onConflict: "user_id,agreement_type,agreement_version",
    });
    if (error) throwErr(error.message, 500);

    await syncAgreementComplete(db, u, role);
    await writeAuditLog(db, {
      event_type: "agreement_accepted",
      user_id: String(u.user_id),
      entity_type: "agreement",
      entity_id: acceptanceId,
      message: `Accepted ${agreementType}`,
      metadata: { agreement_type: agreementType, version: AGREEMENT_VERSION },
      ip_address: meta.ip_address ?? undefined,
      user_agent: meta.user_agent ?? undefined,
    });

    return { acceptance_id: acceptanceId, agreement_type: agreementType };
  }

  if (path === "/agreements/batch-accept" && method === "POST") {
    const u = requireAuth();
    const items = Array.isArray(body.agreements) ? body.agreements : [];
    const results = [];
    for (const item of items) {
      const res = await handleComplianceRequest(db, {
        ...opts,
        path: "/agreements/accept",
        method: "POST",
        body: { ...body, ...(item as Record<string, unknown>) },
        user: u,
        requireAuth: () => u,
        requireRole,
      });
      results.push(res);
    }
    const status = await loadComplianceContext(db, u);
    return { results, compliance: status };
  }

  if (path === "/auth/role" && method === "POST") {
    const u = requireAuth();
    const role = normalizeRole(String(body.role || ""));
    if (!VALID_ROLES.includes(role as never)) throwErr("Invalid role");
    if (u.role === "admin") throwErr("Admin role cannot be changed");

    const updates: Record<string, unknown> = {
      role,
      onboarding_role: role,
    };

    if (role === "delivery" || role === "vendor") {
      updates.approval_status = "pending";
      updates.agreement_complete = false;
      updates.active = true;
    } else {
      updates.approval_status = "approved";
      updates.agreement_complete = true;
    }

    const { data, error } = await db
      .from("users")
      .update(updates)
      .eq("user_id", u.user_id)
      .select()
      .single();
    if (error) throwErr(error.message, 500);

    if (role === "delivery") {
      const { data: existing } = await db.from("drivers").select("driver_id").eq("user_id", u.user_id).maybeSingle();
      if (!existing) {
        await db.from("drivers").insert({
          driver_id: uid("drv"),
          user_id: u.user_id,
          approval_status: "pending",
          agreement_complete: false,
          availability: false,
          workload: 0,
        });
      } else {
        await db.from("drivers").update({
          approval_status: "pending",
          agreement_complete: false,
        }).eq("user_id", u.user_id);
      }
      await db.from("compliance_reviews").insert({
        review_id: uid("rev"),
        user_id: u.user_id,
        entity_type: "driver",
        entity_id: String(u.user_id),
        status: "pending",
        approval_status: "review",
      });
    }

    if (role === "vendor") {
      await db.from("compliance_reviews").insert({
        review_id: uid("rev"),
        user_id: u.user_id,
        entity_type: "restaurant",
        entity_id: String(u.user_id),
        status: "pending",
        approval_status: "verification",
      });
    }

    await writeAuditLog(db, {
      event_type: "role_changed",
      user_id: String(u.user_id),
      message: `Role set to ${role}`,
      metadata: { role },
    });

    return data;
  }

  if (path === "/admin/compliance/reviews" && method === "GET") {
    requireRole("admin");
    const { data: reviews } = await db
      .from("compliance_reviews")
      .select("*")
      .in("status", ["pending"])
      .order("created_at", { ascending: false });

    const userIds = [...new Set((reviews || []).map((r) => r.user_id))];
    const { data: users } = userIds.length
      ? await db.from("users").select("user_id,email,name,picture,role,approval_status,agreement_complete,created_at").in("user_id", userIds)
      : { data: [] };

    const userMap = new Map((users || []).map((u) => [u.user_id, u]));
    return (reviews || []).map((r) => ({
      ...r,
      user: userMap.get(r.user_id) || null,
    }));
  }

  if (path === "/admin/approvals/pending" && method === "GET") {
    requireRole("admin");
    const { data: users } = await db
      .from("users")
      .select("*")
      .in("role", ["delivery", "vendor"])
      .in("approval_status", ["pending", "review", "verification", "documents_missing"])
      .order("created_at", { ascending: false });

    const enriched = [];
    for (const u of users || []) {
      let extra: Record<string, unknown> = {};
      if (u.role === "delivery") {
        const { data: driver } = await db.from("drivers").select("*").eq("user_id", u.user_id).maybeSingle();
        extra = { driver };
      }
      if (u.role === "vendor") {
        const { data: restaurant } = await db
          .from("restaurants")
          .select("restaurant_id,name,cuisine,address,approved,approval_status")
          .eq("owner_id", u.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        extra = { restaurant };
      }
      const { data: review } = await db
        .from("compliance_reviews")
        .select("review_id,status,approval_status,created_at")
        .eq("user_id", u.user_id)
        .in("status", ["pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      enriched.push({ ...u, ...extra, review });
    }
    return enriched;
  }

  const userApprovalMatch = path.match(/^\/admin\/approvals\/users\/([^/]+)\/action$/);
  if (userApprovalMatch && method === "POST") {
    const admin = requireRole("admin");
    const userId = userApprovalMatch[1];
    const action = String(body.action || "");
    return applyUserApproval(db, admin, userId, action, body.notes as string | undefined);
  }

  const reviewAction = path.match(/^\/admin\/compliance\/reviews\/([^/]+)\/action$/);
  if (reviewAction && method === "POST") {
    const admin = requireRole("admin");
    const reviewId = reviewAction[1];
    const action = String(body.action || "");
    const { data: review } = await db.from("compliance_reviews").select("*").eq("review_id", reviewId).maybeSingle();
    if (!review) throwErr("Review not found", 404);
    return applyUserApproval(db, admin, review.user_id, action, body.notes as string | undefined);
  }

  if (path === "/admin/compliance/drivers" && method === "GET") {
    requireRole("admin");
    const { data } = await db.from("drivers").select("*, users(email, name)").order("updated_at", { ascending: false });
    return data || [];
  }

  if (path === "/admin/compliance/restaurants" && method === "GET") {
    requireRole("admin");
    const { data } = await db
      .from("restaurants")
      .select("*")
      .order("created_at", { ascending: false });
    return data || [];
  }

  if (path === "/admin/compliance/dashboard" && method === "GET") {
    requireRole("admin");
    const [{ data: pendingUsers }, { data: acceptances }, { data: driverDocs }, { data: bgChecks }] = await Promise.all([
      db.from("users").select("user_id,role,approval_status,agreement_complete").in("role", ["delivery", "vendor"]).in("approval_status", ["pending", "review", "verification", "documents_missing"]),
      db.from("agreement_acceptances").select("acceptance_id"),
      db.from("driver_documents").select("document_id,status,expires_at,document_type"),
      db.from("background_checks").select("check_id,status"),
    ]);
    const expiredDocs = (driverDocs || []).filter((d) => d.expires_at && new Date(d.expires_at) < new Date());
    const pendingBg = (bgChecks || []).filter((b) => b.status === "pending");
    const missingAgreements = (pendingUsers || []).filter((u) => !u.agreement_complete);
    const totalPartners = (pendingUsers || []).length;
    const compliant = totalPartners === 0 ? 100 : Math.round(((totalPartners - missingAgreements.length) / Math.max(totalPartners, 1)) * 100);
    return {
      stats: {
        pending_approvals: totalPartners,
        missing_agreements: missingAgreements.length,
        expired_documents: expiredDocs.length,
        pending_background_checks: pendingBg.length,
        total_signatures: acceptances?.length || 0,
        compliance_percentage: compliant,
      },
      pending_users: pendingUsers || [],
    };
  }

  const dossierMatch = path.match(/^\/admin\/compliance\/users\/([^/]+)\/dossier$/);
  if (dossierMatch && method === "GET") {
    requireRole("admin");
    const userId = dossierMatch[1];
    const { data: user } = await db.from("users").select("*").eq("user_id", userId).maybeSingle();
    if (!user) throwErr("User not found", 404);

    const role = normalizeRole(String(user.role));
    const [{ data: agreements }, { data: driverDocs }, { data: restDocs }, { data: onboarding }, { data: restOnboarding }, { data: tax }, { data: bg }] = await Promise.all([
      db.from("agreement_acceptances").select("*").eq("user_id", userId).order("accepted_at", { ascending: false }),
      db.from("driver_documents").select("*").eq("user_id", userId).order("uploaded_at", { ascending: false }),
      role === "vendor"
        ? db.from("restaurant_documents").select("*").order("uploaded_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      role === "delivery" ? db.from("driver_onboarding").select("*").eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null }),
      role === "vendor" ? db.from("restaurant_onboarding").select("*").eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null }),
      db.from("tax_information").select("tax_id,legal_name,business_name,tax_classification,last_four,w9_signed_at,created_at,updated_at").eq("user_id", userId).maybeSingle(),
      db.from("background_checks").select("*").eq("user_id", userId).order("initiated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const catalog = agreementsForRole(role);
    const agreementDetails = catalog.map((def) => {
      const signed = (agreements || []).find((a) => a.agreement_type === def.type);
      return { ...def, signed: Boolean(signed), acceptance: signed || null };
    });

    let restaurantDocs = restDocs || [];
    if (role === "vendor") {
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", userId).maybeSingle();
      if (rest?.restaurant_id) {
        const { data: rd } = await db.from("restaurant_documents").select("*").eq("restaurant_id", rest.restaurant_id);
        restaurantDocs = rd || [];
      }
    }

    const { data: driver } = role === "delivery"
      ? await db.from("drivers").select("*").eq("user_id", userId).maybeSingle()
      : { data: null };

  return {
      user,
      driver,
      agreements: agreementDetails,
      signatures: agreements || [],
      documents: {
        driver: driverDocs || [],
        restaurant: restaurantDocs,
      },
      onboarding: onboarding || restOnboarding || null,
      tax: tax ? { ...tax, masked_id: tax.last_four ? `***-**-${tax.last_four}` : null } : null,
      background_check: bg || null,
    };
  }

  if (path === "/admin/compliance/agreements" && method === "GET") {
    requireRole("admin");
    const roleFilter = params.role;
    const q = db.from("agreement_acceptances").select("*").order("accepted_at", { ascending: false }).limit(500);
    const { data: rows } = await q;
    const userIds = [...new Set((rows || []).map((r) => r.user_id))];
    const { data: users } = userIds.length
      ? await db.from("users").select("user_id,email,name,role").in("user_id", userIds)
      : { data: [] };
    const userMap = new Map((users || []).map((u) => [u.user_id, u]));
    let result = (rows || []).map((r) => ({ ...r, user: userMap.get(r.user_id) }));
    if (roleFilter) result = result.filter((r) => r.user?.role === roleFilter);
    return result;
  }

  const bgActionMatch = path.match(/^\/admin\/compliance\/users\/([^/]+)\/background-check$/);
  if (bgActionMatch && method === "POST") {
    const admin = requireRole("admin");
    const userId = bgActionMatch[1];
    const status = String(body.status || "pending");
    const { data: existing } = await db.from("background_checks").select("check_id").eq("user_id", userId).order("initiated_at", { ascending: false }).limit(1).maybeSingle();
    const checkId = existing?.check_id || uid("bgc");
    await db.from("background_checks").upsert({
      check_id: checkId,
      user_id: userId,
      status,
      mvr_status: String(body.mvr_status || status),
      result_summary: body.notes || null,
      completed_at: ["approved", "rejected"].includes(status) ? new Date().toISOString() : null,
      reviewed_by: admin.user_id,
      notes: body.notes || null,
    });
    if (status === "approved") {
      await applyUserApproval(db, admin, userId, "approve", "Background check passed");
    } else if (status === "rejected") {
      await applyUserApproval(db, admin, userId, "reject", "Background check failed");
    }
    return { ok: true, status };
  }

  // ---- Document upload ----
  if (path === "/uploads/presign" && method === "POST") {
    const u = requireAuth();
    const documentType = String(body.document_type || "other");
    const fileName = String(body.file_name || "document");
    const contentType = String(body.content_type || "application/pdf");
    const entityType = String(body.entity_type || "driver");
    const storagePath = `${u.user_id}/${entityType}/${documentType}/${Date.now()}_${fileName}`;

    const { data: signed, error } = await db.storage
      .from("compliance-documents")
      .createSignedUploadUrl(storagePath);

    if (error) throwErr(error.message, 500);

    const documentId = uid("doc");
    const table = entityType === "restaurant" ? "restaurant_documents" : "driver_documents";
    const row: Record<string, unknown> = {
      document_id: documentId,
      document_type: documentType,
      file_key: storagePath,
      storage_path: storagePath,
      file_name: fileName,
      content_type: contentType,
      status: "uploading",
    };
    if (entityType === "restaurant") {
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).maybeSingle();
      if (!rest) throwErr("Create your restaurant profile first");
      row.restaurant_id = rest.restaurant_id;
    } else {
      row.user_id = u.user_id;
    }
    await db.from(table).insert(row);

    return { document_id: documentId, upload_url: signed?.signedUrl, storage_path: storagePath, token: signed?.token };
  }

  if (path === "/uploads/complete" && method === "POST") {
    const u = requireAuth();
    const documentId = String(body.document_id || "");
    const entityType = String(body.entity_type || "driver");
    const table = entityType === "restaurant" ? "restaurant_documents" : "driver_documents";
    const expiresAt = body.expires_at || null;
    const { data: doc } = await db.from(table).select("*").eq("document_id", documentId).maybeSingle();
    await db.from(table).update({ status: "pending_review", expires_at: expiresAt }).eq("document_id", documentId);
    if (entityType === "driver") {
      await db.from("drivers").update({ documents_complete: false }).eq("user_id", u.user_id);
    }
    if (entityType === "restaurant" && doc?.restaurant_id) {
      await syncRestaurantDocumentsComplete(db, String(doc.restaurant_id));
    }
    return { ok: true, document_id: documentId };
  }

  const docUrlMatch = path.match(/^\/admin\/compliance\/documents\/([^/]+)\/url$/);
  if (docUrlMatch && method === "GET") {
    requireRole("admin");
    const documentId = docUrlMatch[1];
    const entityType = params.entity_type || "driver";
    const table = entityType === "restaurant" ? "restaurant_documents" : "driver_documents";
    const { data: doc } = await db.from(table).select("*").eq("document_id", documentId).maybeSingle();
    if (!doc?.storage_path) throwErr("Document not found", 404);
    const { data: signed } = await db.storage.from("compliance-documents").createSignedUrl(doc.storage_path, 3600);
    return { url: signed?.signedUrl, document: doc };
  }

  if (path === "/onboarding/driver" && method === "GET") {
    const u = requireRole("delivery", "driver");
    const { data } = await db.from("driver_onboarding").select("*").eq("user_id", u.user_id).maybeSingle();
    return data || { user_id: u.user_id, current_step: 1, status: "incomplete" };
  }

  if (path === "/onboarding/driver" && method === "POST") {
    const u = requireRole("delivery", "driver");
    const step = Number(body.step || 1);
    const allowed = ["legal_name", "date_of_birth", "address_line1", "address_line2", "city", "state", "zip", "phone",
      "license_number", "license_expiration", "vehicle_make", "vehicle_model", "vehicle_year", "vehicle_color", "vehicle_plate", "status"];
    const payload: Record<string, unknown> = { user_id: u.user_id, current_step: step, updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (body[k] !== undefined) payload[k] = body[k];
    }
    const { data } = await db.from("driver_onboarding").upsert(payload, { onConflict: "user_id" }).select().single();
    return data;
  }

  if (path === "/onboarding/driver/tax" && method === "POST") {
    const u = requireRole("delivery", "driver");
    const taxId = uid("tax");
    const ssnOrEin = String(body.tax_id || "");
    const encrypted = encryptTaxPayload(JSON.stringify({ tax_id: ssnOrEin }));
    await db.from("tax_information").upsert({
      tax_id: taxId,
      user_id: u.user_id,
      entity_type: "driver",
      legal_name: String(body.legal_name || ""),
      business_name: body.business_name || null,
      tax_classification: String(body.tax_classification || "individual"),
      address_line1: body.address_line1 || null,
      city: body.city || null,
      state: body.state || null,
      zip: body.zip || null,
      encrypted_payload: encrypted,
      last_four: ssnOrEin.replace(/\D/g, "").slice(-4),
      w9_signed_at: new Date().toISOString(),
      w9_signature: body.signature || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    return { ok: true, masked_id: maskTaxId(ssnOrEin) };
  }

  // ---- Restaurant onboarding ----
  if (path === "/onboarding/restaurant" && method === "GET") {
    const u = requireRole("vendor", "restaurant");
    const { data } = await db.from("restaurant_onboarding").select("*").eq("user_id", u.user_id).maybeSingle();
    const { data: rest } = await db.from("restaurants").select("*").eq("owner_id", u.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return {
      ...(data || { user_id: u.user_id, current_step: 1, status: "incomplete" }),
      restaurant: rest,
      user_email: u.email,
    };
  }

  if (path === "/onboarding/restaurant" && method === "POST") {
    const u = requireRole("vendor", "restaurant");
    const step = Number(body.step || 1);
    const allowed = [
      "business_name", "owner_name", "owner_email", "business_address", "phone", "hours",
      "cuisine", "description", "logo_url", "photos", "sales_tax_id", "ein", "menu_draft", "status",
    ];
    const payload: Record<string, unknown> = {
      user_id: u.user_id,
      current_step: step,
      updated_at: new Date().toISOString(),
    };
    for (const k of allowed) {
      if (body[k] !== undefined) payload[k] = body[k];
    }

    const restaurantId = await upsertRestaurantFromOnboarding(db, u, body);
    if (restaurantId) payload.restaurant_id = restaurantId;

    if (step >= 7 && body.finalize) {
      payload.status = "pending_review";
      payload.completed_at = new Date().toISOString();
      const { data: existingReview } = await db.from("compliance_reviews").select("review_id").eq("user_id", u.user_id).in("status", ["pending"]).maybeSingle();
      if (existingReview?.review_id) {
        await db.from("compliance_reviews").update({
          approval_status: "verification",
          status: "pending",
          updated_at: new Date().toISOString(),
        }).eq("review_id", existingReview.review_id);
      } else {
        await db.from("compliance_reviews").insert({
          review_id: uid("rev"),
          user_id: u.user_id,
          entity_type: "restaurant",
          entity_id: restaurantId || String(u.user_id),
          status: "pending",
          approval_status: "verification",
        });
      }
      await db.from("users").update({ approval_status: "verification" }).eq("user_id", u.user_id);
      if (restaurantId) {
        await db.from("restaurants").update({ approval_status: "verification" }).eq("restaurant_id", restaurantId);
      }
    }

    const { data } = await db.from("restaurant_onboarding").upsert(payload, { onConflict: "user_id" }).select().single();
    if (restaurantId) await syncRestaurantDocumentsComplete(db, restaurantId);
    return data;
  }

  if (path === "/onboarding/restaurant/tax" && method === "POST") {
    const u = requireRole("vendor", "restaurant");
    const taxId = uid("tax");
    const ssnOrEin = String(body.tax_id || body.ein || "");
    const encrypted = encryptTaxPayload(JSON.stringify({ tax_id: ssnOrEin, ein: body.ein, sales_tax_id: body.sales_tax_id }));
    await db.from("tax_information").upsert({
      tax_id: taxId,
      user_id: u.user_id,
      entity_type: "vendor",
      legal_name: String(body.legal_name || body.business_name || ""),
      business_name: body.business_name || null,
      tax_classification: String(body.tax_classification || "business"),
      address_line1: body.address_line1 || body.business_address || null,
      city: body.city || null,
      state: body.state || null,
      zip: body.zip || null,
      encrypted_payload: encrypted,
      last_four: ssnOrEin.replace(/\D/g, "").slice(-4),
      w9_signed_at: new Date().toISOString(),
      w9_signature: body.signature || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    await db.from("restaurant_onboarding").upsert({
      user_id: u.user_id,
      sales_tax_id: body.sales_tax_id || null,
      ein: body.ein || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return { ok: true, masked_id: maskTaxId(ssnOrEin) };
  }

  if (path === "/onboarding/restaurant/stripe-connect" && method === "POST") {
    const u = requireRole("vendor", "restaurant");
    const stripeKey = getStripeApiKey();
    if (!stripeKey) throwErr("Stripe not configured", 503);

    const { data: onboarding } = await db.from("restaurant_onboarding").select("*").eq("user_id", u.user_id).maybeSingle();
    let accountId = onboarding?.stripe_connect_id as string | undefined;

    if (!accountId) {
      const params = new URLSearchParams({
        type: "express",
        country: "US",
        email: String(u.email || ""),
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
      });
      const acctRes = await fetch("https://api.stripe.com/v1/accounts", {
        method: "POST",
        headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const acct = await acctRes.json();
      if (!acctRes.ok) throwErr(acct.error?.message || "Stripe account creation failed", 502);
      accountId = acct.id;
      await db.from("restaurant_onboarding").upsert({
        user_id: u.user_id,
        stripe_connect_id: accountId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).maybeSingle();
      if (rest?.restaurant_id) {
        await db.from("restaurants").update({ stripe_connect_id: accountId }).eq("restaurant_id", rest.restaurant_id);
      }
    }

    const appUrl = String(body.return_url || process.env.NEXT_PUBLIC_APP_URL || "https://zoom-eats-delivery.vercel.app");
    const linkParams = new URLSearchParams({
      account: accountId!,
      refresh_url: `${appUrl}/restaurant/onboarding?step=6`,
      return_url: `${appUrl}/restaurant/onboarding?step=6&stripe=return`,
      type: "account_onboarding",
    });
    const linkRes = await fetch("https://api.stripe.com/v1/account_links", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: linkParams.toString(),
    });
    const link = await linkRes.json();
    if (!linkRes.ok) throwErr(link.error?.message || "Stripe link failed", 502);
    return { url: link.url, account_id: accountId };
  }

  if (path === "/onboarding/restaurant/stripe-connect/status" && method === "GET") {
    const u = requireRole("vendor", "restaurant");
    const stripeKey = getStripeApiKey();
    const { data: onboarding } = await db.from("restaurant_onboarding").select("*").eq("user_id", u.user_id).maybeSingle();
    const accountId = onboarding?.stripe_connect_id;
    if (!accountId || !stripeKey) {
      return { complete: false, account_id: accountId || null };
    }
    const acctRes = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const acct = await acctRes.json();
    const complete = Boolean(acct.charges_enabled && acct.payouts_enabled);
    if (complete) {
      await db.from("restaurant_onboarding").update({
        stripe_connect_complete: true,
        updated_at: new Date().toISOString(),
      }).eq("user_id", u.user_id);
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).maybeSingle();
      if (rest?.restaurant_id) {
        await db.from("restaurants").update({ stripe_connect_complete: true }).eq("restaurant_id", rest.restaurant_id);
      }
    }
    return { complete, account_id: accountId, charges_enabled: acct.charges_enabled, payouts_enabled: acct.payouts_enabled };
  }

  if (path === "/onboarding/restaurant/menu-enhance" && method === "POST") {
    const u = requireRole("vendor", "restaurant");
    const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).maybeSingle();
    if (!rest) throwErr("Create your restaurant profile first");

    const enhancementId = uid("enh");
    const originalPath = String(body.original_path || "");
    const enhancedPath = String(body.enhanced_path || "");
    const approved = Boolean(body.approved);

    await db.from("menu_photo_enhancements").insert({
      enhancement_id: enhancementId,
      restaurant_id: rest.restaurant_id,
      user_id: u.user_id,
      original_path: originalPath,
      enhanced_path: enhancedPath || null,
      status: enhancedPath ? "enhanced" : "pending",
      approved,
    });

    if (approved && body.menu_item) {
      const item = body.menu_item as Record<string, unknown>;
      await db.from("menu_items").insert({
        item_id: uid("item"),
        restaurant_id: rest.restaurant_id,
        name: item.name || "Menu item",
        description: item.description || "",
        price: item.price || 0,
        image_url: item.image_url || enhancedPath,
        category: item.category || "Mains",
        available: true,
      });
    }

    const menuDraft = Array.isArray(body.menu_draft) ? body.menu_draft : [];
    if (menuDraft.length) {
      await db.from("restaurant_onboarding").upsert({
        user_id: u.user_id,
        menu_draft: menuDraft,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    return { enhancement_id: enhancementId, approved };
  }

  if (path.startsWith("/uploads") && method === "GET") {
    return { message: "Use POST /uploads/presign" };
  }

  return null;
}

async function upsertRestaurantFromOnboarding(
  db: SupabaseClient,
  user: Record<string, unknown>,
  body: Record<string, unknown>
): Promise<string | null> {
  const userId = String(user.user_id);
  const { data: existing } = await db.from("restaurants").select("restaurant_id").eq("owner_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const restData: Record<string, unknown> = {
    name: body.business_name || body.name || "My Restaurant",
    description: body.description || "",
    cuisine: body.cuisine || "",
    address: body.business_address || body.address || "",
    image_url: body.logo_url || "",
    cover_url: body.logo_url || "",
    approval_status: "pending",
    approved: false,
    active: false,
  };

  if (existing?.restaurant_id) {
    await db.from("restaurants").update(restData).eq("restaurant_id", existing.restaurant_id);
    return existing.restaurant_id;
  }

  const restaurantId = uid("rest");
  await db.from("restaurants").insert({
    restaurant_id: restaurantId,
    owner_id: userId,
    rating: 4.5,
    delivery_time_min: 30,
    ...restData,
  });
  return restaurantId;
}

async function syncRestaurantDocumentsComplete(db: SupabaseClient, restaurantId: string) {
  const required = ["business_license", "health_permit"];
  const { data: docs } = await db.from("restaurant_documents").select("document_type, status").eq("restaurant_id", restaurantId);
  const uploaded = new Set(
    (docs || []).filter((d) => ["pending_review", "approved"].includes(String(d.status))).map((d) => d.document_type as string)
  );
  const complete = required.every((t) => uploaded.has(t));
  await db.from("restaurants").update({ documents_complete: complete }).eq("restaurant_id", restaurantId);
  return complete;
}

async function syncAgreementComplete(db: SupabaseClient, user: Record<string, unknown>, role: string) {
  const { data: accepted } = await db
    .from("agreement_acceptances")
    .select("agreement_type")
    .eq("user_id", user.user_id);
  const acceptedTypes = (accepted || []).map((a) => a.agreement_type as string);
  const status = computeComplianceStatus({ role, user: user as never, acceptedTypes });
  const complete = status.missing_agreements.length === 0;

  if (role === "delivery") {
    await db.from("drivers").update({ agreement_complete: complete }).eq("user_id", user.user_id);
    await db.from("users").update({ agreement_complete: complete }).eq("user_id", user.user_id);
    if (complete) {
      await db.from("compliance_reviews").update({
        approval_status: "review",
        status: "pending",
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.user_id).eq("entity_type", "driver");
    }
  }

  if (role === "vendor") {
    const { data: rest } = await db
      .from("restaurants")
      .select("restaurant_id")
      .eq("owner_id", user.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rest) {
      await db.from("restaurants").update({ agreement_complete: complete }).eq("restaurant_id", rest.restaurant_id);
    }
    await db.from("users").update({ agreement_complete: complete }).eq("user_id", user.user_id);
    if (complete) {
      await db.from("compliance_reviews").update({
        approval_status: "verification",
        status: "pending",
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.user_id).eq("entity_type", "restaurant");
    }
  }
}

export { DRIVER_AGREEMENTS, RESTAURANT_AGREEMENTS };

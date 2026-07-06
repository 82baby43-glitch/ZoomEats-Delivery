import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AGREEMENT_VERSION,
  agreementsForRole,
  DRIVER_AGREEMENTS,
  RESTAURANT_AGREEMENTS,
} from "../compliance/agreements";
import { computeComplianceStatus, normalizeRole, VALID_ROLES } from "../compliance/authz";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
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

  if (role === "delivery") {
    const { data } = await db.from("drivers").select("*").eq("user_id", userId).maybeSingle();
    driver = data;
  }
  if (role === "vendor") {
    const { data } = await db
      .from("restaurants")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    restaurant = data;
  }

  return computeComplianceStatus({
    role,
    user: user as never,
    driver,
    restaurant,
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
  const { path, method, body = {} } = opts;
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
    const { data } = await db
      .from("compliance_reviews")
      .select("*")
      .in("status", ["pending", "review"])
      .order("created_at", { ascending: false });
    return data || [];
  }

  const reviewAction = path.match(/^\/admin\/compliance\/reviews\/([^/]+)\/action$/);
  if (reviewAction && method === "POST") {
    const admin = requireRole("admin");
    const reviewId = reviewAction[1];
    const action = String(body.action || "");
    const { data: review } = await db.from("compliance_reviews").select("*").eq("review_id", reviewId).maybeSingle();
    if (!review) throwErr("Review not found", 404);

    let approvalStatus = "review";
    let reviewStatus = "pending";
    if (action === "approve") {
      approvalStatus = "approved";
      reviewStatus = "approved";
    } else if (action === "reject") {
      approvalStatus = "rejected";
      reviewStatus = "rejected";
    } else if (action === "request_info") {
      approvalStatus = "documents_missing";
      reviewStatus = "pending";
    } else if (action === "suspend") {
      approvalStatus = "suspended";
      reviewStatus = "suspended";
    } else {
      throwErr("Invalid action");
    }

    await db.from("compliance_reviews").update({
      status: reviewStatus,
      approval_status: approvalStatus,
      reviewed_by: admin.user_id,
      reviewed_at: new Date().toISOString(),
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    }).eq("review_id", reviewId);

    if (review.entity_type === "driver") {
      await db.from("drivers").update({
        approval_status: approvalStatus,
        active: approvalStatus === "approved",
        suspended_at: approvalStatus === "suspended" ? new Date().toISOString() : null,
      }).eq("user_id", review.user_id);
      await db.from("users").update({
        approval_status: approvalStatus,
        active: approvalStatus === "approved",
        suspended_at: approvalStatus === "suspended" ? new Date().toISOString() : null,
      }).eq("user_id", review.user_id);
    }

    if (review.entity_type === "restaurant") {
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", review.user_id).maybeSingle();
      if (rest) {
        await db.from("restaurants").update({
          approval_status: approvalStatus,
          approved: approvalStatus === "approved",
          active: approvalStatus === "approved",
        }).eq("restaurant_id", rest.restaurant_id);
      }
    }

    await writeAuditLog(db, {
      event_type: "approval_changed",
      actor_id: String(admin.user_id),
      user_id: review.user_id,
      entity_type: review.entity_type,
      entity_id: review.entity_id,
      message: `Compliance review ${action}`,
      metadata: { review_id: reviewId, action, approval_status: approvalStatus },
    });

    return { status: reviewStatus, approval_status: approvalStatus };
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

  if (path.startsWith("/uploads")) {
    return { url: "", key: "uploads/placeholder", message: "Upload storage pending configuration" };
  }

  return null;
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

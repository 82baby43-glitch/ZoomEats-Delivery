import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptTaxPayload, maskTaxId } from "./taxCrypto";

export const IRS_1099_THRESHOLD = 600;

export type ContractorTaxRow = {
  user_id: string;
  name: string;
  email: string;
  entity_type: string;
  role: string;
  legal_name: string;
  business_name: string | null;
  tax_classification: string | null;
  tin_type: string | null;
  tin_masked: string;
  tin_full: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  w9_signed_at: string | null;
  w9_on_file: boolean;
  total_payments: number;
  payment_count: number;
  requires_1099: boolean;
};

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function taxYearFromDate(d: Date) {
  return d.getUTCFullYear();
}

function getPayerInfo() {
  return {
    name: process.env.ZOOM_EATS_LEGAL_NAME || "ZoomEats Delivery LLC",
    tin: process.env.ZOOM_EATS_EIN || "",
    address: process.env.ZOOM_EATS_ADDRESS || "",
    city: process.env.ZOOM_EATS_CITY || "",
    state: process.env.ZOOM_EATS_STATE || "",
    zip: process.env.ZOOM_EATS_ZIP || "",
  };
}

function decryptTaxId(encryptedPayload: string): string {
  try {
    const parsed = JSON.parse(decryptTaxPayload(encryptedPayload)) as { tax_id?: string; ein?: string };
    return parsed.tax_id || parsed.ein || "";
  } catch {
    return "";
  }
}

export async function syncWalletPaymentsToContractor(db: SupabaseClient, taxYear?: number) {
  const year = taxYear || taxYearFromDate(new Date());
  const start = `${year}-01-01T00:00:00.000Z`;
  const end = `${year + 1}-01-01T00:00:00.000Z`;

  const { data: wallets } = await db.from("wallets").select("wallet_id, owner_user_id");
  if (!wallets?.length) return { synced: 0 };

  let synced = 0;
  for (const wallet of wallets) {
    const { data: txs } = await db
      .from("wallet_transactions")
      .select("*")
      .eq("wallet_id", wallet.wallet_id)
      .gte("created_at", start)
      .lt("created_at", end);

    for (const tx of txs || []) {
      const amount = Number(tx.amount || 0);
      if (amount <= 0) continue;
      const ref = String(tx.transaction_id || tx.id || `${wallet.wallet_id}_${tx.created_at}`);
      const { data: existing } = await db
        .from("contractor_payments")
        .select("payment_id")
        .eq("reference_id", ref)
        .maybeSingle();
      if (existing) continue;

      const { data: user } = await db.from("users").select("role").eq("user_id", wallet.owner_user_id).maybeSingle();
      const role = String(user?.role || "");
      const entityType = role === "delivery" ? "driver" : role === "vendor" ? "restaurant" : null;
      if (!entityType) continue;

      await db.from("contractor_payments").insert({
        payment_id: uid("cpay"),
        user_id: wallet.owner_user_id,
        entity_type: entityType,
        amount: Math.round(amount * 100) / 100,
        payment_type: String(tx.type || tx.kind || "wallet_credit"),
        tax_year: year,
        paid_at: tx.created_at || new Date().toISOString(),
        reference_id: ref,
        description: tx.description || "Wallet credit",
        metadata: { source: "wallet_transactions" },
      });
      synced += 1;
    }
  }
  return { synced };
}

export async function buildContractorTaxRows(
  db: SupabaseClient,
  taxYear: number,
  opts: { includeFullTin?: boolean } = {}
): Promise<ContractorTaxRow[]> {
  const start = `${taxYear}-01-01T00:00:00.000Z`;
  const end = `${taxYear + 1}-01-01T00:00:00.000Z`;

  const [{ data: payments }, { data: taxRows }, { data: users }] = await Promise.all([
    db.from("contractor_payments").select("*").eq("tax_year", taxYear),
    db.from("tax_information").select("*"),
    db.from("users").select("user_id,name,email,role").in("role", ["delivery", "vendor"]),
  ]);

  const paymentsByUser = new Map<string, { total: number; count: number }>();
  for (const p of payments || []) {
    const cur = paymentsByUser.get(p.user_id as string) || { total: 0, count: 0 };
    cur.total += Number(p.amount || 0);
    cur.count += 1;
    paymentsByUser.set(p.user_id as string, cur);
  }

  const taxByUser = new Map((taxRows || []).map((t) => [t.user_id, t]));
  const userMap = new Map((users || []).map((u) => [u.user_id, u]));

  const allUserIds = new Set([
    ...(payments || []).map((p) => p.user_id as string),
    ...(taxRows || []).map((t) => t.user_id as string),
  ]);

  const rows: ContractorTaxRow[] = [];
  for (const userId of allUserIds) {
    const user = userMap.get(userId);
    const tax = taxByUser.get(userId);
    const pay = paymentsByUser.get(userId) || { total: 0, count: 0 };
    const role = String(user?.role || tax?.entity_type || "");
    const entityType = role === "delivery" ? "driver" : "restaurant";

    let tinFull: string | null = null;
    let tinMasked = tax?.last_four ? `***-**-${tax.last_four}` : "—";
    if (tax?.encrypted_payload && opts.includeFullTin) {
      tinFull = decryptTaxId(tax.encrypted_payload as string);
      tinMasked = maskTaxId(tinFull);
    }

    const total = Math.round(pay.total * 100) / 100;
    rows.push({
      user_id: userId,
      name: (user?.name as string) || (tax?.legal_name as string) || "—",
      email: (user?.email as string) || "—",
      entity_type: entityType,
      role,
      legal_name: (tax?.legal_name as string) || (user?.name as string) || "—",
      business_name: (tax?.business_name as string) || null,
      tax_classification: (tax?.tax_classification as string) || null,
      tin_type: (tax?.tin_type as string) || null,
      tin_masked: tinMasked,
      tin_full: opts.includeFullTin ? tinFull : null,
      address_line1: (tax?.address_line1 as string) || null,
      address_line2: (tax?.address_line2 as string) || null,
      city: (tax?.city as string) || null,
      state: (tax?.state as string) || null,
      zip: (tax?.zip as string) || null,
      w9_signed_at: (tax?.w9_signed_at as string) || null,
      w9_on_file: Boolean(tax?.w9_signed_at || tax?.w9_document_path),
      total_payments: total,
      payment_count: pay.count,
      requires_1099: total >= IRS_1099_THRESHOLD,
    });
  }

  return rows.sort((a, b) => b.total_payments - a.total_payments);
}

export async function buildUserTaxDashboard(db: SupabaseClient, userId: string, taxYear?: number) {
  const year = taxYear || taxYearFromDate(new Date());
  const { data: tax } = await db.from("tax_information").select("*").eq("user_id", userId).maybeSingle();
  const { data: payments } = await db
    .from("contractor_payments")
    .select("*")
    .eq("user_id", userId)
    .eq("tax_year", year)
    .order("paid_at", { ascending: false });

  const total = Math.round((payments || []).reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100;

  return {
    tax_year: year,
    w9: tax
      ? {
          legal_name: tax.legal_name,
          business_name: tax.business_name,
          tax_classification: tax.tax_classification,
          tin_masked: tax.last_four ? `***-**-${tax.last_four}` : null,
          w9_signed_at: tax.w9_signed_at,
          status: tax.status,
          on_file: Boolean(tax.w9_signed_at || tax.w9_document_path),
        }
      : null,
    payments: payments || [],
    total_payments: total,
    requires_1099: total >= IRS_1099_THRESHOLD,
    threshold: IRS_1099_THRESHOLD,
  };
}

export async function buildAdminTaxDashboard(db: SupabaseClient, taxYear: number) {
  await syncWalletPaymentsToContractor(db, taxYear);
  const contractors = await buildContractorTaxRows(db, taxYear, { includeFullTin: false });
  const requiring1099 = contractors.filter((c) => c.requires_1099);
  const missingW9 = contractors.filter((c) => c.requires_1099 && !c.w9_on_file);
  const totalPayments = contractors.reduce((s, c) => s + c.total_payments, 0);

  return {
    tax_year: taxYear,
    stats: {
      contractor_count: contractors.length,
      total_payments: Math.round(totalPayments * 100) / 100,
      requires_1099_count: requiring1099.length,
      missing_w9_count: missingW9.length,
      w9_on_file_count: contractors.filter((c) => c.w9_on_file).length,
      threshold: IRS_1099_THRESHOLD,
    },
    contractors,
    requiring_1099: requiring1099,
    missing_w9: missingW9,
  };
}

export function generate1099NecCsv(taxYear: number, rows: ContractorTaxRow[]) {
  const payer = getPayerInfo();
  const headers = [
    "FORM_TYPE",
    "TAX_YEAR",
    "PAYER_NAME",
    "PAYER_TIN",
    "RECIPIENT_NAME",
    "RECIPIENT_BUSINESS_NAME",
    "RECIPIENT_TIN",
    "RECIPIENT_TIN_TYPE",
    "RECIPIENT_ADDRESS",
    "RECIPIENT_CITY",
    "RECIPIENT_STATE",
    "RECIPIENT_ZIP",
    "BOX1_NONEMPLOYEE_COMPENSATION",
    "ENTITY_TYPE",
    "W9_ON_FILE",
  ];
  const lines = [headers.join(",")];
  const eligible = rows.filter((r) => r.requires_1099);

  for (const r of eligible) {
    lines.push([
      "1099-NEC",
      taxYear,
      csvEscape(payer.name),
      csvEscape(payer.tin),
      csvEscape(r.legal_name),
      csvEscape(r.business_name || ""),
      csvEscape(r.tin_full || r.tin_masked),
      csvEscape(r.tin_type || "SSN/EIN"),
      csvEscape(r.address_line1 || ""),
      csvEscape(r.city || ""),
      csvEscape(r.state || ""),
      csvEscape(r.zip || ""),
      r.total_payments.toFixed(2),
      r.entity_type,
      r.w9_on_file ? "Y" : "N",
    ].join(","));
  }
  return lines.join("\n");
}

export function generateIrsReadyCsv(taxYear: number, rows: ContractorTaxRow[]) {
  const payer = getPayerInfo();
  const headers = [
    "RecordType",
    "PaymentYear",
    "PayerTaxpayerIdNumber",
    "PayerName",
    "PayerAddress",
    "PayerCity",
    "PayerState",
    "PayerZip",
    "PayeeTaxpayerIdNumber",
    "PayeeName",
    "PayeeAddress",
    "PayeeCity",
    "PayeeState",
    "PayeeZip",
    "NonemployeeCompensation",
    "Form1099NEC",
  ];
  const lines = [headers.join(",")];
  const eligible = rows.filter((r) => r.requires_1099);

  for (const r of eligible) {
    lines.push([
      "B",
      taxYear,
      csvEscape(payer.tin),
      csvEscape(payer.name),
      csvEscape(payer.address),
      csvEscape(payer.city),
      csvEscape(payer.state),
      csvEscape(payer.zip),
      csvEscape(r.tin_full || ""),
      csvEscape(r.legal_name),
      csvEscape([r.address_line1, r.address_line2].filter(Boolean).join(" ")),
      csvEscape(r.city || ""),
      csvEscape(r.state || ""),
      csvEscape(r.zip || ""),
      r.total_payments.toFixed(2),
      "Y",
    ].join(","));
  }

  lines.unshift([
    "A",
    taxYear,
    csvEscape(payer.tin),
    csvEscape(payer.name),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    eligible.reduce((s, r) => s + r.total_payments, 0).toFixed(2),
    "",
  ].join(","));

  return lines.join("\n");
}

export async function saveYearEndReport(
  db: SupabaseClient,
  taxYear: number,
  adminUserId: string,
  contractors: ContractorTaxRow[]
) {
  const requiring1099 = contractors.filter((c) => c.requires_1099);
  const reportId = uid("tyr");
  await db.from("tax_year_reports").insert({
    report_id: reportId,
    tax_year: taxYear,
    generated_by: adminUserId,
    contractor_count: contractors.length,
    total_payments: contractors.reduce((s, c) => s + c.total_payments, 0),
    report_1099_count: requiring1099.length,
    metadata: {
      requiring_1099: requiring1099.map((c) => c.user_id),
      generated_at: new Date().toISOString(),
    },
  });
  return reportId;
}

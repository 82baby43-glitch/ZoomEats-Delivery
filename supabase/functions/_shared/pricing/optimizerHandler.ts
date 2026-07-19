import type { SupabaseClient } from "@supabase/supabase-js";
import { enhanceReportWithAi, generatePricingOptimizerReport } from "./optimizer.ts";

type AdminCtx = {
  path: string;
  method: string;
  body: Record<string, unknown>;
  params?: Record<string, string>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
  anthropicKey?: string;
};

export async function handlePricingOptimizerRequest(
  db: SupabaseClient,
  ctx: AdminCtx
): Promise<unknown | null> {
  const { path, method, body, params } = ctx;

  if (!path.startsWith("/admin/pricing/optimizer")) return null;
  ctx.requireRole("admin");

  if (path === "/admin/pricing/optimizer" && method === "GET") {
    const days = Number(params?.days ?? body.days ?? 30);
    const report = await generatePricingOptimizerReport(db, days);
    if (ctx.anthropicKey) {
      const ai = await enhanceReportWithAi(report, ctx.anthropicKey);
      if (ai) report.ai_summary = ai;
    }
    return report;
  }

  if (path === "/admin/pricing/optimizer/apply" && method === "POST") {
    const recommendationId = String(body.recommendation_id || "");
    const ruleType = String(body.rule_type || "");
    const value = body.value != null ? Number(body.value) : null;
    const percentage = body.percentage != null ? Number(body.percentage) : null;

    if (!ruleType) {
      throw Object.assign(new Error("rule_type required"), { status: 400 });
    }

    const patch: Record<string, unknown> = {
      rule_name: String(body.rule_name || ruleType),
      rule_type: ruleType,
      value: value ?? 0,
      percentage,
      active: true,
    };

    await db.from("pricing_rules").update({ active: false }).eq("rule_type", ruleType).eq("active", true);
    const { data, error } = await db.from("pricing_rules").insert({
      ...patch,
      effective_date: new Date().toISOString(),
    }).select().single();

    if (error) throw new Error(error.message);

    await db.from("pricing_audit_logs").insert({
      action: "optimizer_applied",
      new_value: { recommendation_id: recommendationId, ...patch },
      changed_by: "admin",
      reason: "AI pricing optimizer recommendation",
    });

    return { applied: true, rule: data };
  }

  return null;
}

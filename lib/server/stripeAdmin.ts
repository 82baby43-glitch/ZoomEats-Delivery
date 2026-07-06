import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getStripeConfigSummary,
  verifyStripeConnection,
} from "./stripeAdminClient";

type AdminCtx = {
  path: string;
  method: string;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

function maskSessionId(value?: string | null): string | null {
  if (!value) return null;
  if (value.length <= 14) return value;
  return `${value.slice(0, 10)}…${value.slice(-4)}`;
}

async function safeQuery<T>(fn: () => PromiseLike<{ data: T | null }>): Promise<T | null> {
  try {
    const { data } = await fn();
    return data;
  } catch {
    return null;
  }
}

async function buildStripeOverview(db: SupabaseClient) {
  const config = getStripeConfigSummary();
  const auth = config.configured ? await verifyStripeConnection() : { ok: false, error: "not_configured" };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStart = today.toISOString();

  const [
    recentOrders,
    recentTransactions,
    paidOrders,
    todaysPaid,
    pendingCount,
    failedTransactions,
    recentEvents,
    recentErrors,
  ] = await Promise.all([
    safeQuery(async () =>
      db
        .from("orders")
        .select("order_id,customer_name,restaurant_name,total,payment_status,status,stripe_session_id,created_at")
        .order("created_at", { ascending: false })
        .limit(50)
    ),
    safeQuery(async () =>
      db.from("payment_transactions").select("*").order("created_at", { ascending: false }).limit(50)
    ),
    safeQuery(async () => db.from("orders").select("total").eq("payment_status", "paid")),
    safeQuery(async () =>
      db.from("orders").select("total").eq("payment_status", "paid").gte("created_at", todayStart)
    ),
    (async () => {
      try {
        const { count } = await db
          .from("orders")
          .select("order_id", { count: "exact", head: true })
          .in("payment_status", ["pending", "initiated", "requires_payment", "processing"]);
        return count ?? 0;
      } catch {
        return 0;
      }
    })(),
    safeQuery(async () =>
      db
        .from("payment_transactions")
        .select("*")
        .not("payment_status", "in", "(paid,initiated)")
        .order("created_at", { ascending: false })
        .limit(20)
    ),
    safeQuery(async () =>
      db
        .from("stripe_event_log")
        .select("event_id,event_type,type,session_id,payment_intent_id,processed_at")
        .order("processed_at", { ascending: false })
        .limit(20)
    ),
    safeQuery(async () =>
      db
        .from("payment_error_logs")
        .select("id,event_id,order_id,session_id,error_message,source,created_at")
        .order("created_at", { ascending: false })
        .limit(20)
    ),
  ]);

  const paidList = paidOrders || [];
  const todayList = todaysPaid || [];
  const totalRevenue = paidList.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const todayRevenue = todayList.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const txByOrder = Object.fromEntries((recentTransactions || []).map((tx) => [tx.order_id, tx]));

  const orders = (recentOrders || []).map((order) => {
    const tx = txByOrder[order.order_id];
    return {
      order_id: order.order_id,
      customer_name: order.customer_name,
      restaurant_name: order.restaurant_name,
      total: order.total,
      payment_status: order.payment_status,
      order_status: order.status,
      session_id: maskSessionId(order.stripe_session_id || tx?.session_id),
      created_at: order.created_at,
    };
  });

  const transactions = (recentTransactions || []).map((tx) => ({
    session_id: maskSessionId(tx.session_id),
    order_id: tx.order_id,
    amount: tx.amount,
    currency: tx.currency || "usd",
    payment_status: tx.payment_status,
    created_at: tx.created_at,
  }));

  return {
    ...config,
    auth,
    stats: {
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_paid_orders: paidList.length,
      today_revenue: Math.round(todayRevenue * 100) / 100,
      today_paid_orders: todayList.length,
      pending_payments: pendingCount,
      failed_transactions: (failedTransactions || []).length,
    },
    orders,
    transactions,
    webhook_events: (recentEvents || []).map((e) => ({
      event_id: e.event_id,
      type: e.event_type || e.type,
      session_id: maskSessionId(e.session_id as string | undefined),
      payment_intent_id: maskSessionId(e.payment_intent_id as string | undefined),
      processed_at: e.processed_at,
    })),
    payment_errors: recentErrors || [],
    links: {
      dashboard: "https://dashboard.stripe.com",
      payments: "https://dashboard.stripe.com/payments",
      webhooks: "https://dashboard.stripe.com/webhooks",
      docs: "https://docs.stripe.com",
    },
  };
}

export async function handleStripeAdminRequest(
  db: SupabaseClient,
  ctx: AdminCtx
): Promise<unknown | null> {
  const { path, method, requireRole } = ctx;
  if (!path.startsWith("/admin/stripe")) return null;

  requireRole("admin");

  if (path === "/admin/stripe" && method === "GET") {
    return buildStripeOverview(db);
  }

  if (path === "/admin/stripe/test" && method === "POST") {
    return verifyStripeConnection();
  }

  return null;
}

#!/usr/bin/env node
/**
 * Point zoomeats.net + www.zoomeats.net at Vercel via Cloudflare DNS.
 *
 * Usage:
 *   export CLOUDFLARE_API_TOKEN=...   # Zone:DNS:Edit for zoomeats.net
 *   node scripts/configure-cloudflare-zoomeats-net.mjs
 */
const ZONE_NAME = "zoomeats.net";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;

const RECORDS = [
  { type: "A", name: "@", content: "76.76.21.21", proxied: false, comment: "Vercel apex" },
  { type: "CNAME", name: "www", content: "cname.vercel-dns.com", proxied: false, comment: "Vercel customer www" },
  { type: "CNAME", name: "driver", content: "cname.vercel-dns.com", proxied: false, comment: "Vercel driver PWA" },
  { type: "CNAME", name: "restaurant", content: "cname.vercel-dns.com", proxied: false, comment: "Vercel restaurant PWA" },
];

async function cf(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.errors?.map((e) => e.message).join("; ") || `Cloudflare ${res.status}`);
  }
  return data;
}

async function upsertRecord(zoneId, spec) {
  const list = await cf(
    `/zones/${zoneId}/dns_records?type=${spec.type}&name=${encodeURIComponent(
      spec.name === "@" ? ZONE_NAME : `${spec.name}.${ZONE_NAME}`
    )}`
  );
  const existing = (list.result || []).find(
    (r) => r.name === (spec.name === "@" ? ZONE_NAME : `${spec.name}.${ZONE_NAME}`)
  );
  const body = {
    type: spec.type,
    name: spec.name,
    content: spec.content,
    proxied: spec.proxied,
    ttl: 1,
    comment: spec.comment,
  };
  if (existing) {
    if (existing.content === spec.content && existing.proxied === spec.proxied) {
      console.log(`✅ ${spec.type} ${spec.name} already correct (${spec.content})`);
      return;
    }
    await cf(`/zones/${zoneId}/dns_records/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) });
    console.log(`✅ Updated ${spec.type} ${spec.name} → ${spec.content}`);
    return;
  }
  await cf(`/zones/${zoneId}/dns_records`, { method: "POST", body: JSON.stringify(body) });
  console.log(`✅ Created ${spec.type} ${spec.name} → ${spec.content}`);
}

async function main() {
  if (!TOKEN) {
    console.error("Missing CLOUDFLARE_API_TOKEN (needs Zone.DNS Edit for zoomeats.net)");
    process.exit(1);
  }

  const zones = await cf(`/zones?name=${ZONE_NAME}`);
  const zone = zones.result?.[0];
  if (!zone) throw new Error(`Zone not found: ${ZONE_NAME}`);

  console.log(`Cloudflare zone: ${zone.name} (${zone.id})`);
  for (const record of RECORDS) {
    await upsertRecord(zone.id, record);
  }

  console.log("\nDone. DNS may take 5–15 minutes to propagate.");
  console.log("Vercel project: zoom-eats-delivery");
  console.log("Customer:  https://www.zoomeats.net");
  console.log("Driver:    https://driver.zoomeats.net");
  console.log("Restaurant: https://restaurant.zoomeats.net");
  console.log("Apex redirects: https://zoomeats.net → www.zoomeats.net");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

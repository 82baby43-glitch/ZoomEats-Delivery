const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.zoomeats.net";

export function LocalBusinessJsonLd({ restaurants = [] }) {
  const items = restaurants.slice(0, 20).map((r) => ({
    "@type": "Restaurant",
    name: r.name,
    servesCuisine: r.cuisine,
    address: r.address ? { "@type": "PostalAddress", streetAddress: r.address } : undefined,
    url: `${SITE_URL}/r/${r.restaurant_id}`,
  }));

  const json = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "ZoomEats",
        url: SITE_URL,
        logo: `${SITE_URL}/icons/icon-512.png`,
        description: "Food delivery in Columbia, Missouri — local restaurants delivered fast.",
        areaServed: {
          "@type": "City",
          name: "Columbia",
          containedInPlace: { "@type": "State", name: "Missouri" },
        },
      },
      {
        "@type": "WebSite",
        name: "ZoomEats",
        url: SITE_URL,
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      ...items,
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

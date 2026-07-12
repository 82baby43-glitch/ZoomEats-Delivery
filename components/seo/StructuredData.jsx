export function LocalBusinessJsonLd({ restaurants = [] }) {
  const items = restaurants.slice(0, 20).map((r) => ({
    "@type": "Restaurant",
    name: r.name,
    servesCuisine: r.cuisine,
    address: r.address ? { "@type": "PostalAddress", streetAddress: r.address } : undefined,
    url: `https://zoomeats.com/r/${r.restaurant_id}`,
  }));

  const json = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "ZoomEats",
        url: "https://zoomeats.com",
        logo: "https://zoomeats.com/icons/icon-512.png",
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
        url: "https://zoomeats.com",
        potentialAction: {
          "@type": "SearchAction",
          target: "https://zoomeats.com/?q={search_term_string}",
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

/** Resolve restaurant cover/image URLs from OSM tags. */

export function resolveOsmPhotoUrl(tags: Record<string, string>): string | null {
  const image = (tags.image || "").trim();
  if (image && /^https?:\/\//i.test(image)) return image;

  const commons = (tags.wikimedia_commons || tags["wikimedia:commons"] || "").trim();
  if (commons) {
    const file = commons.replace(/^File:/i, "").trim();
    if (file) {
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=800`;
    }
  }

  return null;
}

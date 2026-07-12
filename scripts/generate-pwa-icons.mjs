#!/usr/bin/env node
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.join(process.cwd(), "public", "icons");
await mkdir(outDir, { recursive: true });

function svg(size) {
  const r = Math.round(size * 0.22);
  const font = Math.round(size * 0.42);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#B6F127"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="${font}" fill="#0A0A0A">Z</text>
</svg>`);
}

for (const size of [192, 512]) {
  const file = path.join(outDir, `icon-${size}.png`);
  await sharp(svg(size)).png().toFile(file);
  console.log("wrote", file);
}

const maskable = path.join(outDir, "icon-maskable-512.png");
await sharp(svg(512)).extend({ top: 64, bottom: 64, left: 64, right: 64, background: "#B6F127" }).png().toFile(maskable);
console.log("wrote", maskable);

const splash = path.join(process.cwd(), "public", "splash.svg");
await writeFile(splash, `<svg xmlns="http://www.w3.org/2000/svg" width="1170" height="2532" viewBox="0 0 1170 2532">
  <rect width="1170" height="2532" fill="#0A0A0A"/>
  <rect x="485" y="1116" width="200" height="200" rx="44" fill="#B6F127"/>
  <text x="585" y="1236" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="96" fill="#0A0A0A">Z</text>
  <text x="585" y="1380" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="64" fill="#F5F5F5">ZoomEats</text>
</svg>`);
console.log("wrote", splash);

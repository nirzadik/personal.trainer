#!/usr/bin/env node
/**
 * Build the publishable Artifact page: dist/personal-trainer.html
 *
 * Takes app/index.html (dev entry) and:
 *   - drops the dev-only viewport meta (the platform skeleton provides it)
 *   - inlines the stylesheet(s) linked from ./src/ (bundled with esbuild so @import works)
 *   - replaces <script type="module" src="./src/main.js"> with the bundled module inline
 *   - strips doctype/html/head/body tags (the platform wraps the page)
 * Keeps <title>, the claude:viewport-fit-sides meta, Google Fonts links and the #app shell.
 *
 * Usage: node tools/build.mjs [--out dist/personal-trainer.html] [--minify]
 */
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outArg = args.indexOf("--out");
const OUT = resolve(APP, outArg >= 0 ? args[outArg + 1] : "dist/personal-trainer.html");
const MINIFY = args.includes("--minify");

async function bundleJs(entry) {
  const r = await build({
    entryPoints: [resolve(APP, entry)],
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: MINIFY,
    write: false,
    legalComments: "none",
    logLevel: "warning",
  });
  return r.outputFiles[0].text;
}

async function bundleCss(entry) {
  const r = await build({
    entryPoints: [resolve(APP, entry)],
    bundle: true,
    minify: MINIFY,
    write: false,
    logLevel: "warning",
    loader: { ".css": "css" },
  });
  return r.outputFiles[0].text;
}

const html = await readFile(resolve(APP, "index.html"), "utf8");
let out = html
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<!doctype[^>]*>/i, "")
  .replace(/<\/?(html|head|body)\b[^>]*>/gi, "")
  .replace(/<meta\s+name=["']viewport["'][^>]*>/gi, "")
  .replace(/<meta\s+charset[^>]*>/gi, "");

// Inline local stylesheets.
const cssLinks = [...out.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["'](\.\/src\/[^"']+)["'][^>]*>/gi)];
for (const m of cssLinks) {
  const css = await bundleCss(m[1]);
  out = out.replace(m[0], () => `<style>\n${css}</style>`);
}

// Inline the module entry.
const scripts = [...out.matchAll(/<script\s+[^>]*type=["']module["'][^>]*src=["'](\.\/src\/[^"']+)["'][^>]*>\s*<\/script>/gi)];
if (!scripts.length) throw new Error("build: no <script type=module src=./src/...> found in index.html");
for (const m of scripts) {
  const js = (await bundleJs(m[1])).replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
  out = out.replace(m[0], () => `<script type="module">\n${js}</script>`);
}

// Title must be within the first 8 KB; keep it first.
const title = out.match(/<title>[\s\S]*?<\/title>/i);
if (!title) throw new Error("build: index.html needs a <title>");
out = title[0] + "\n" + out.replace(title[0], "").trim() + "\n";

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, out);
const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
console.log(`built ${OUT} (${kb} KB)`);

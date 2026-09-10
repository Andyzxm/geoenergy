#!/usr/bin/env node
/**
 * Validate the Geoenergy dataset catalog.
 *
 * Structural checks always run. Reachability checks (`--net`) probe each remote
 * entry with a metadata request rather than a download, so the whole catalog is
 * checked in seconds: an ArcGIS layer answers `?f=json`, a file answers a HEAD.
 * Relative URLs are data you publish next to the app, so they are reported as
 * local rather than failed.
 *
 * Usage: node scripts/check-geoenergy-catalog.mjs [--net]
 */
import { readFile } from "node:fs/promises";
import process from "node:process";

const CATALOG_PATH = "apps/geolibre-desktop/public/geoenergy/catalog.json";
const KINDS = new Set([
  "arcgis-feature",
  "arcgis-map-service",
  "geojson",
  "vector",
  "pmtiles",
  "cog",
  "xyz",
]);
const TIMEOUT_MS = 20_000;

const problems = [];
const notes = [];

const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
if (!Array.isArray(catalog.groups)) {
  console.error(`${CATALOG_PATH}: missing a "groups" array.`);
  process.exit(1);
}

const seen = new Set();
const entries = [];
for (const group of catalog.groups) {
  if (!group.id || !group.label) problems.push(`group ${JSON.stringify(group.id)}: needs id and label.`);
  for (const dataset of group.datasets ?? []) {
    const where = `${group.id}/${dataset.id ?? "(no id)"}`;
    if (!dataset.id) problems.push(`${where}: missing id.`);
    else if (seen.has(dataset.id)) problems.push(`${where}: duplicate id.`);
    else seen.add(dataset.id);
    if (!dataset.title) problems.push(`${where}: missing title.`);
    if (!KINDS.has(dataset.kind)) problems.push(`${where}: unknown kind ${JSON.stringify(dataset.kind)}.`);
    if (!dataset.url) problems.push(`${where}: missing url.`);
    if (dataset.bounds && (!Array.isArray(dataset.bounds) || dataset.bounds.length !== 4)) {
      problems.push(`${where}: bounds must be [west, south, east, north].`);
    }
    if (dataset.kind === "arcgis-feature" && !/\/FeatureServer\/\d+$/i.test(dataset.url ?? "")) {
      problems.push(`${where}: an arcgis-feature url must end in /FeatureServer/<layer>.`);
    }
    entries.push({ where, dataset });
  }
}

if (process.argv.includes("--net")) {
  const results = await Promise.all(
    entries.map(async ({ where, dataset }) => {
      const url = dataset.url ?? "";
      if (!/^https?:\/\//i.test(url)) return `local   ${where} → ${url}`;
      const probe = dataset.kind.startsWith("arcgis")
        ? `${url}${url.includes("?") ? "&" : "?"}f=json`
        : url;
      try {
        const response = await fetch(probe, {
          method: dataset.kind.startsWith("arcgis") ? "GET" : "HEAD",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
          problems.push(`${where}: HTTP ${response.status} from ${probe}`);
          return `FAIL    ${where} (${response.status})`;
        }
        if (dataset.kind.startsWith("arcgis")) {
          const body = await response.json();
          // ArcGIS answers 200 with an {"error": ...} envelope for a missing or
          // token-gated layer, so status alone does not prove the layer is there.
          if (body.error) {
            problems.push(`${where}: ArcGIS error ${body.error.code}: ${body.error.message}`);
            return `FAIL    ${where} (${body.error.code})`;
          }
          const name = body.name ?? "(unnamed)";
          const type = body.geometryType ?? body.type ?? "";
          return `ok      ${where} → ${name} ${type}`;
        }
        return `ok      ${where}`;
      } catch (error) {
        problems.push(`${where}: ${error.message}`);
        return `FAIL    ${where} (${error.message})`;
      }
    }),
  );
  notes.push(...results);
}

for (const note of notes) console.log(note);
console.log(`\n${entries.length} datasets in ${catalog.groups.length} groups.`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("Catalog is valid.");

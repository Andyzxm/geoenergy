# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Geoenergy: a browser map for U.S. energy data, forked from
[GeoLibre](https://github.com/opengeos/GeoLibre) and narrowed to that subject.
Upstream's desktop (Tauri), mobile, Jupyter, R, FastAPI sidecar, collaboration
and tile workers, and store packaging are all **removed**. What remains is the
web app and the packages it needs.

npm workspaces: `apps/geoenergy` (the app) and `packages/*`
(`@geolibre/core`, `map`, `ui`, `processing`, `plugins`, `embed`, `collab-core`).
Node 22+, npm (the repo tracks `package-lock.json`).

## Commands

```bash
npm run dev              # http://localhost:5173
npm run build            # production build -> apps/geoenergy/dist/
npm run lint
npm run test:frontend    # node --test over tests/*.test.ts
npm run check:catalog    # dataset catalog structure
npm run check:catalog:net  # also probes every remote service
npm run ci               # lint + build + tests + catalog, same as CI
```

## Architecture

Store-driven, one-way. `@geolibre/core` holds the Zustand store, domain types,
and the `.geolibre.json` project schema. Data enters through Add Data, the
catalog plugin, or drag-and-drop; non-renderable vector files are converted by
DuckDB-WASM Spatial; everything becomes a `GeoLibreLayer` record; `MapCanvas`
subscribes and `MapController.syncLayers` reconciles MapLibre. **Never mutate
MapLibre from UI** — change store state and let sync apply it. deck.gl handles
raster, point clouds, and 3D.

## What this fork adds

- `packages/plugins/src/plugins/geoenergy-catalog.ts` — the Energy Data panel.
  Loads catalog entries by kind: `arcgis-feature`, `arcgis-map-service`,
  `overpass` (live OpenStreetMap query bounded to the view), `geojson`,
  `vector` (GeoParquet/FlatGeobuf via DuckDB), `pmtiles`, `cog`, `xyz`.
  Also loads the catalog's `defaultLayers` once per session, and renders the
  analysis section that tells users where the tools live.
- `apps/geoenergy/public/geoenergy/catalog.json` — the catalog itself. Data, not
  code: a dataset can be added to a deployed site without a rebuild.
- `scripts/check-geoenergy-catalog.mjs` — validator.
- Copper accent and dark default (`packages/ui/src/globals.css`,
  `lib/theme-schemes.ts`, `hooks/useThemeMode.ts`), the `GeoenergyMark` glyph,
  and `public/admin-profile.json`, which trims the interface to the Intermediate
  tier of `lib/ui-profile.ts`.

Read `docs/geoenergy-catalog.md` before touching the catalog or the plugin.

## Conventions

- Branch and open a PR; do not commit to `main` directly.
- UI strings are translatable (`src/i18n/locales/en.json` is the source of
  truth). Only the strings a visitor actually reads were rewritten for this
  fork; the deep dialogs keep upstream's wording so merges stay cheap.
- The UI mirrors for right-to-left locales: use logical utilities
  (`ms-`/`me-`/`ps-`/`pe-`/`border-s`) and logical CSS properties, never `left`
  and `right`.
- MapLibre control styling fixes go in `apps/geoenergy/src/index.css`, never in
  `node_modules`.
- `backend/geolibre_server/geolibre_server/vector_ops.py` is the one file kept
  from the removed sidecar: the build copies it into the bundle for the Pyodide
  vector engine, so the client-side Vector tools work without a server.
- Merging upstream: `git fetch upstream && git merge upstream/main`. Expect
  conflicts only in the handful of files this fork touches; the removed
  subsystems come back as delete/modify conflicts, resolved by keeping the
  delete.

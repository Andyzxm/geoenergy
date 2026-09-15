# The Geoenergy dataset catalog

Geoenergy is a fork of [GeoLibre](https://github.com/opengeos/GeoLibre) narrowed
to U.S. energy data. The map, the layer model, and the analysis tools are
GeoLibre's; what this fork adds is a curated catalog of energy datasets and a
profile that hides the parts of the interface an energy user does not need.

## Where the pieces live

| Path | Purpose |
| --- | --- |
| `apps/geoenergy/public/geoenergy/catalog.json` | The dataset catalog. Edit this to add or remove datasets — no rebuild needed for a served site. |
| `packages/plugins/src/plugins/geoenergy-catalog.ts` | The panel that renders the catalog and loads a dataset onto the map. |
| `apps/geoenergy/public/admin-profile.json` | The deployment profile that trims the interface. |
| `scripts/check-geoenergy-catalog.mjs` | Validator: structure always, reachability with `--net`. |

The catalog is fetched at panel open, relative to the document base, so the same
build works at a domain root and under a GitHub Pages project path.

## Catalog format

```json
{
  "version": 1,
  "title": "Geoenergy Data Library",
  "groups": [
    {
      "id": "generation",
      "label": "Generation",
      "description": "Optional, shown under the group heading.",
      "accent": "hsl(24 88% 50%)",
      "datasets": [
        {
          "id": "eia-power-plants",
          "title": "U.S. Power Plants",
          "description": "One or two sentences. This text is searched.",
          "kind": "arcgis-feature",
          "url": "https://…/FeatureServer/0",
          "source": "EIA",
          "infoUrl": "https://atlas.eia.gov/",
          "vintage": "2024",
          "tags": ["generation", "capacity"],
          "bounds": [-179.0, 17.0, -65.0, 72.0],
          "maxFeatures": 6000
        }
      ]
    }
  ]
}
```

`id`, `title`, `kind`, and `url` are required; everything else is optional.
`tags` are searched along with the title and description.

A group's `accent` is any CSS color. It draws the dot beside the group heading
and the rule on the inline-start edge of every card in that group, so a new group
without one still renders correctly, just without the color coding.

### Dataset kinds

| Kind | URL points at | Loader |
| --- | --- | --- |
| `arcgis-feature` | a numbered `FeatureServer/<n>` | Loads by viewport as a GeoJSON layer, so the full styling, attribute table, and identify surface applies. `maxFeatures` caps each viewport query. |
| `arcgis-map-service` | a `MapServer` | Rendered image tiles — right for a service too large or too styled to pull as features. |
| `geojson` | a `.geojson` file | Fetched whole and added as a vector layer. Keep these small. |
| `vector` | GeoParquet, FlatGeobuf, or zipped Shapefile | Streamed through DuckDB-WASM. The right kind for your own published data. |
| `pmtiles` | a `.pmtiles` archive | Tiled vector or raster; the scalable option for a nationwide layer. |
| `cog` | a Cloud-Optimized GeoTIFF | Read directly in the browser, with band and colormap controls. |
| `xyz` | an `{z}/{x}/{y}` template | A plain raster tile service. |

A relative `url` (`data/…`) resolves against the deployed site, which is how you
ship your own files: put them in `apps/geoenergy/public/data/` and they
are published with the app.

## Adding your own data

1. Convert to GeoParquet (or PMTiles for anything nationwide and dense):

   ```bash
   python -c "import geopandas; geopandas.read_file('outages.gpkg').to_parquet('apps/geoenergy/public/data/eaglei_county_outages.parquet')"
   ```

2. Add an entry to the `reliability` group in `catalog.json` with
   `"kind": "vector"` and the relative path.
3. Validate and preview:

   ```bash
   node scripts/check-geoenergy-catalog.mjs --net
   npm run dev
   ```

Files over roughly 100 MB do not belong in the repository. Host those as release
assets, on Source Cooperative, or in any bucket that sends CORS headers, and
point the entry at the absolute URL.

## Validating

```bash
node scripts/check-geoenergy-catalog.mjs        # structure: ids, kinds, required fields
node scripts/check-geoenergy-catalog.mjs --net  # also probes every remote entry
```

The `--net` pass asks each ArcGIS layer for its `?f=json` metadata rather than
downloading features, so a full catalog check takes seconds. It fails on an
ArcGIS error envelope too, which is how a layer that has been withdrawn or moved
behind a token shows up — that happens to federal energy services more often
than it should, so run it before a talk or a demo.

## Trimming the interface

`admin-profile.json` is read at startup from the site root. The fork ships:

```json
{ "enabled": true, "level": "intermediate", "lock": false }
```

`level` hides every data source, plugin, and menu item tiered `advanced` in
`apps/geoenergy/src/lib/ui-profile.ts`. Two tiers are changed there for
this edition: the Geoenergy catalog is `basic` so it is always visible, and the
time slider is `intermediate` because the outage datasets are time series.

Set `"lock": true` to make the Interface settings read-only for visitors. See
[UI Profiles](ui-profiles.md) for the full field list, and
[Deployment Capabilities](deployment-capabilities.md) to restrict what a
deployment is permitted to do rather than what it shows.

## Staying current with upstream

The fork touches five upstream files, deliberately few:

- `packages/plugins/src/index.ts` — one export block appended at the end.
- `apps/geoenergy/src/hooks/usePlugins.ts` — one import, one line in `registerAll`.
- `apps/geoenergy/src/lib/ui-profile.ts` — two tier entries.
- `apps/geoenergy/index.html` — title and description.
- `.github/workflows/geoenergy-pages.yml` — new file, upstream's `pages.yml` untouched.

Everything else is new files. Merging upstream should stay a matter of resolving
those five.

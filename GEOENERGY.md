# Geoenergy

A browser-based library of U.S. energy datasets — generation, transmission,
fuels, and outage reliability — built as a fork of
[GeoLibre](https://github.com/opengeos/GeoLibre) (MIT, Qiusheng Wu).

GeoLibre supplies the map, the layer model, the cloud-native format support, and
the analysis tools. Geoenergy narrows it to one subject: a curated energy
dataset catalog that opens on load, and an interface trimmed to what an energy
user needs.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build -w geolibre-desktop
npm run check:catalog        # validate the dataset catalog
npm run check:catalog:net    # also probe every remote service
```

`.github/workflows/geoenergy-pages.yml` builds the web app and publishes it to
GitHub Pages on every push to `main`. Enable Pages for the repository with
"GitHub Actions" as the source, and the site appears at
`https://<user>.github.io/<repo>/`.

## What this fork changes

New files:

- `packages/plugins/src/plugins/geoenergy-catalog.ts` — the Energy Data panel.
- `apps/geolibre-desktop/src/components/layout/GeoenergyMark.tsx` — the brand glyph.
- `apps/geolibre-desktop/public/geoenergy/catalog.json` — the dataset catalog.
- `scripts/check-geoenergy-catalog.mjs` — the catalog validator.
- `docs/geoenergy-catalog.md` — how to add datasets and trim the interface.
- `.github/workflows/geoenergy-pages.yml` — the fork's deploy.

Upstream files touched, deliberately few, so merges stay cheap:

- `packages/plugins/src/index.ts` — one export block.
- `apps/geolibre-desktop/src/hooks/usePlugins.ts` — register the plugin, plus a
  once-per-session activation helper.
- `apps/geolibre-desktop/src/components/layout/DesktopShell.tsx` — call that
  helper on mount.
- `apps/geolibre-desktop/src/lib/ui-profile.ts` — two complexity tiers.
- `apps/geolibre-desktop/public/admin-profile.json` — was `null`, now trims the
  interface to the Intermediate tier.
- `apps/geolibre-desktop/index.html`, `TopToolbar.tsx` — title, wordmark, mark.
- `packages/ui/src/globals.css` — copper is the base accent; GeoLibre's blue
  becomes the `[data-theme="blue"]` preset.
- `apps/geolibre-desktop/src/lib/theme-schemes.ts` — registers `copper` and makes
  it the default scheme.
- `apps/geolibre-desktop/src/hooks/useThemeMode.ts` — dark by default.
- `apps/geolibre-desktop/src/i18n/locales/en.json` — one label for the new scheme.
- `mkdocs.yml`, `package.json` — one nav entry, two scripts.

## Look and feel

Four changes separate Geoenergy visually from stock GeoLibre:

- **Copper accent.** `hsl(24 88% 40%)` in light, `hsl(28 90% 52%)` in dark. The
  light value is deliberately darker than the copper it started from: at 45%
  lightness white label text hits only 3.77:1, and the smallest label on a
  primary button is 11px, so 40% is what clears WCAG AA at 4.65:1. In dark mode
  the fill carries near-black brown text at 5.38:1, and the focus ring clears
  6.76:1 on the app canvas.
- **Dark by default.** `?theme=light` and the toolbar toggle both still work.
- **A brand mark.** A bolt in a hexagon, inline SVG inheriting `currentColor`,
  replacing lucide's map glyph.
- **Color-coded catalog groups.** Each group in `catalog.json` carries an
  `accent`, drawn as a heading dot and a rule on the inline-start edge of each
  card.

GeoLibre's blue is still one click away in Settings → Appearance, alongside the
other stock schemes.

## The catalog

Nine datasets in four groups ship by default: EIA power plants (points and
hexbins), coal mines, EIA transmission lines, HIFLD substations, natural gas,
crude oil, and petroleum product pipelines, plus a placeholder for county-level
EAGLE-I outage summaries.

Every remote entry was checked against its live service. Federal energy services
move and occasionally disappear behind tokens, so run
`npm run check:catalog:net` before relying on the catalog in a talk or a demo.

See [docs/geoenergy-catalog.md](docs/geoenergy-catalog.md) to add your own data.

## Credit and license

Geoenergy is derivative work under GeoLibre's MIT license, which is preserved in
`LICENSE`. Help → About still names GeoLibre. Data belongs to its publishers —
EIA, HIFLD, and ORNL — and each catalog entry links to its source.

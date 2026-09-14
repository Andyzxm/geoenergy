import type { FeatureCollection } from "geojson";
import type { GeoLibreAppAPI, GeoLibrePlugin } from "../types";
import { addArcGISLayer } from "./arcgis-layer";
import { addVectorLayerFromUrl } from "./maplibre-vector";
import { addPMTilesLayerFromUrl } from "./maplibre-components";
import { addRasterToMap } from "./maplibre-raster";

export const GEOENERGY_CATALOG_PLUGIN_ID = "geoenergy-catalog";
const PANEL_ID = GEOENERGY_CATALOG_PLUGIN_ID;

// A catalog fetch is a small JSON document from the app's own origin, so it gets
// the ordinary search timeout rather than the long download ceiling the dataset
// loaders below run under.
const CATALOG_TIMEOUT_MS = 20_000;

/**
 * How a catalog entry reaches the map. Each value maps to one loader in
 * {@link addDataset}; adding a kind means adding a branch there and documenting
 * it in `docs/geoenergy-catalog.md`.
 */
export type GeoenergyDatasetKind =
  | "arcgis-feature"
  | "arcgis-map-service"
  | "geojson"
  | "vector"
  | "pmtiles"
  | "cog"
  | "xyz";

export interface GeoenergyDataset {
  id: string;
  title: string;
  description?: string;
  kind: GeoenergyDatasetKind;
  /** Service or file URL. For `arcgis-feature`, the numbered FeatureServer layer. */
  url: string;
  /** Shown as a small badge on the card and passed to raster/tile attribution. */
  source?: string;
  /** Link to the dataset's landing page, opened in a new tab. */
  infoUrl?: string;
  /** Free-text search terms in addition to the title and description. */
  tags?: string[];
  /** `[west, south, east, north]` used to frame the map when the loader cannot. */
  bounds?: [number, number, number, number];
  /** Per-viewport feature cap for `arcgis-feature`; guards a nationwide layer. */
  maxFeatures?: number;
  /** Vintage or update cadence, rendered under the title. */
  vintage?: string;
}

export interface GeoenergyGroup {
  id: string;
  label: string;
  description?: string;
  /**
   * CSS color for this group's rule and heading dot. Any CSS color works; the
   * catalog ships `color-mix()`-free literals so the value can also be used in
   * a border shorthand. Omit it and the group renders with the plain border.
   */
  accent?: string;
  datasets: GeoenergyDataset[];
}

export interface GeoenergyCatalog {
  version: number;
  title?: string;
  groups: GeoenergyGroup[];
}

export interface GeoenergyCatalogLabels {
  hint: string;
  searchPlaceholder: string;
  loading: string;
  loadError: string;
  empty: string;
  noResults: string;
  add: string;
  info: string;
  adding: (title: string) => string;
  added: (title: string) => string;
  addError: (title: string) => string;
  counted: (shown: number, total: number) => string;
}

export const DEFAULT_GEOENERGY_CATALOG_LABELS: GeoenergyCatalogLabels = {
  hint: "Browse curated U.S. energy datasets and add them to the map.",
  searchPlaceholder: "Search datasets",
  loading: "Loading catalog…",
  loadError: "Could not load the dataset catalog.",
  empty: "The catalog has no datasets yet.",
  noResults: "No datasets match that search.",
  add: "Add to map",
  info: "Source",
  adding: (title) => `Adding ${title}…`,
  added: (title) => `Added ${title}.`,
  addError: (title) => `Could not add ${title}.`,
  counted: (shown, total) => `Showing ${shown} of ${total} datasets.`,
};

let labels: GeoenergyCatalogLabels = { ...DEFAULT_GEOENERGY_CATALOG_LABELS };

export function setGeoenergyCatalogLabels(next: Partial<GeoenergyCatalogLabels>): void {
  labels = { ...labels, ...next };
  if (panelContainer) {
    disposePanel?.();
    disposePanel = buildPanel(panelContainer);
  }
}

// Resolved against document.baseURI so the same build works at a domain root and
// under a project path on GitHub Pages (/<repo>/), where an absolute "/geoenergy"
// would 404.
let catalogUrl = "geoenergy/catalog.json";

export function setGeoenergyCatalogUrl(url: string): void {
  catalogUrl = url;
  cachedCatalog = null;
}

// The panel is raw DOM inside a plugin container, so every element carries its
// own theme-token styling; these mirror the sibling catalog panels (ArcGIS Hub,
// Open Data Catalogs) so the edition looks of a piece with the host.
const CARD_STYLE =
  "border:1px solid hsl(var(--border));border-radius:6px;padding:8px;margin-bottom:8px;" +
  "background:hsl(var(--background));";
const PRIMARY_BUTTON_STYLE =
  "padding:3px 9px;font-size:11px;border:1px solid hsl(var(--primary));border-radius:5px;" +
  "cursor:pointer;background:hsl(var(--primary));color:hsl(var(--primary-foreground));";
const LINK_STYLE = "font-size:11px;color:hsl(var(--muted-foreground));text-decoration:underline;";
const BADGE_STYLE =
  "font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid hsl(var(--border));" +
  "color:hsl(var(--muted-foreground));";

let appRef: GeoLibreAppAPI | null = null;
let panelContainer: HTMLElement | null = null;
let disposePanel: (() => void) | null = null;
let unregisterPanel: (() => void) | null = null;
let cachedCatalog: GeoenergyCatalog | null = null;
let catalogController: AbortController | null = null;

function boundedSignal(signal: AbortSignal, timeoutMs = CATALOG_TIMEOUT_MS): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
}

/**
 * Read the catalog document, once per session unless the URL changes.
 *
 * A malformed catalog is a deployment mistake rather than a user error, so it
 * throws with the offending field named instead of silently rendering an empty
 * panel.
 */
export async function fetchGeoenergyCatalog(signal: AbortSignal): Promise<GeoenergyCatalog> {
  if (cachedCatalog) return cachedCatalog;
  const url = new URL(catalogUrl, document.baseURI).toString();
  const response = await fetch(url, { signal: boundedSignal(signal) });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
  const text = await response.text();
  // A misconfigured host answers 200 with its index.html for an unknown path,
  // which would otherwise surface as a bare JSON SyntaxError.
  if (/^\s*</.test(text)) {
    throw new Error("The catalog URL returned HTML instead of JSON.");
  }
  const parsed = JSON.parse(text) as GeoenergyCatalog;
  if (!Array.isArray(parsed?.groups)) {
    throw new Error("The catalog is missing a `groups` array.");
  }
  cachedCatalog = parsed;
  return parsed;
}

/** Add one catalog entry to the map, dispatching on its `kind`. */
export async function addDataset(app: GeoLibreAppAPI, dataset: GeoenergyDataset): Promise<void> {
  switch (dataset.kind) {
    case "arcgis-feature": {
      await addArcGISLayer(app, {
        layerType: "feature",
        sourceType: "url",
        url: dataset.url,
        name: dataset.title,
        ...(dataset.maxFeatures ? { maxFeatures: dataset.maxFeatures } : {}),
      });
      return;
    }
    case "arcgis-map-service": {
      await addArcGISLayer(app, {
        layerType: "map-service",
        sourceType: "url",
        url: dataset.url,
        name: dataset.title,
      });
      return;
    }
    case "geojson": {
      const response = await fetch(dataset.url);
      if (!response.ok) throw new Error(`GeoJSON request failed (${response.status}).`);
      const data = (await response.json()) as FeatureCollection;
      if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
        throw new Error("The URL is not a GeoJSON FeatureCollection.");
      }
      // deactivate() nulls appRef, which can land while a large download is in
      // flight; bail rather than adding a layer to a torn-down host.
      if (!appRef) return;
      app.addGeoJsonLayer(dataset.title, data, dataset.url);
      if (dataset.bounds) app.fitBounds?.(dataset.bounds);
      return;
    }
    case "vector": {
      // GeoParquet, FlatGeobuf, and zipped Shapefile all go through the host's
      // DuckDB-backed vector loader, which streams rather than downloading whole.
      const added = await addVectorLayerFromUrl(app, dataset.url, {
        name: dataset.title,
        fitBounds: true,
      });
      if (!added) throw new Error("The vector loader did not create a layer.");
      return;
    }
    case "pmtiles": {
      const added = await addPMTilesLayerFromUrl(app, dataset.url, { fit: true });
      if (!added) throw new Error("The PMTiles loader did not create a layer.");
      return;
    }
    case "cog": {
      await addRasterToMap(app, dataset.url, { name: dataset.title, zoomTo: true });
      return;
    }
    case "xyz": {
      const id = app.addTileLayer?.(dataset.title, dataset.url, {
        ...(dataset.source ? { attribution: dataset.source } : {}),
        ...(dataset.bounds ? { bounds: dataset.bounds } : {}),
      });
      if (!id) throw new Error("This host cannot add tile layers.");
      if (dataset.bounds) app.fitBounds?.(dataset.bounds);
      return;
    }
    default: {
      // Exhaustive: a new kind added to the union without a branch fails the build.
      const unreachable: never = dataset.kind;
      throw new Error(`Unsupported dataset kind: ${String(unreachable)}`);
    }
  }
}

function matches(dataset: GeoenergyDataset, query: string): boolean {
  if (!query) return true;
  const haystack = [dataset.title, dataset.description ?? "", (dataset.tags ?? []).join(" ")]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.style.cssText = style;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildCard(
  dataset: GeoenergyDataset,
  status: HTMLElement,
  accent?: string,
): HTMLElement {
  const card = element("div", CARD_STYLE);
  if (accent) {
    // Logical property, not border-left: the host mirrors its whole UI for
    // right-to-left locales, and a physical edge would strand the rule on the
    // wrong side of the card there.
    card.style.borderInlineStartWidth = "3px";
    card.style.borderInlineStartColor = accent;
  }

  const title = element("div", "font-size:12px;font-weight:600;margin-bottom:2px;", dataset.title);
  card.append(title);

  const meta = element("div", "display:flex;gap:6px;align-items:center;margin-bottom:4px;");
  if (dataset.source) meta.append(element("span", BADGE_STYLE, dataset.source));
  if (dataset.vintage) {
    meta.append(element("span", "font-size:10px;color:hsl(var(--muted-foreground));", dataset.vintage));
  }
  if (meta.childElementCount) card.append(meta);

  if (dataset.description) {
    card.append(
      element(
        "div",
        "font-size:11px;color:hsl(var(--muted-foreground));margin-bottom:6px;line-height:1.35;",
        dataset.description,
      ),
    );
  }

  const actions = element("div", "display:flex;gap:8px;align-items:center;");
  const add = element("button", PRIMARY_BUTTON_STYLE, labels.add) as HTMLButtonElement;
  add.type = "button";
  add.addEventListener("click", () => {
    const app = appRef;
    if (!app) return;
    add.disabled = true;
    add.style.opacity = "0.5";
    status.textContent = labels.adding(dataset.title);
    void addDataset(app, dataset)
      .then(() => {
        status.textContent = labels.added(dataset.title);
      })
      .catch((error: unknown) => {
        console.error(`Could not add ${dataset.id}.`, error);
        status.textContent = labels.addError(dataset.title);
      })
      .finally(() => {
        add.disabled = false;
        add.style.opacity = "1";
      });
  });
  actions.append(add);

  if (dataset.infoUrl) {
    const link = element("a", LINK_STYLE, labels.info) as HTMLAnchorElement;
    link.href = dataset.infoUrl;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    actions.append(link);
  }
  card.append(actions);
  return card;
}

function buildPanel(container: HTMLElement): () => void {
  container.replaceChildren();
  const root = element("div", "display:flex;flex-direction:column;gap:8px;padding:8px;");

  root.append(
    element("div", "font-size:11px;color:hsl(var(--muted-foreground));line-height:1.4;", labels.hint),
  );

  const search = element(
    "input",
    "width:100%;padding:4px 8px;font-size:12px;border:1px solid hsl(var(--border));" +
      "border-radius:5px;background:hsl(var(--background));color:hsl(var(--foreground));",
  ) as HTMLInputElement;
  search.type = "search";
  search.placeholder = labels.searchPlaceholder;
  root.append(search);

  const status = element("div", "font-size:11px;color:hsl(var(--muted-foreground));", labels.loading);
  root.append(status);

  const list = element("div", "overflow-y:auto;");
  root.append(list);
  container.append(root);

  const controller = new AbortController();
  catalogController = controller;
  let catalog: GeoenergyCatalog | null = null;

  const render = () => {
    if (!catalog) return;
    const query = search.value.trim();
    list.replaceChildren();
    let shown = 0;
    let total = 0;
    for (const group of catalog.groups) {
      total += group.datasets.length;
      const hits = group.datasets.filter((dataset) => matches(dataset, query));
      if (!hits.length) continue;
      shown += hits.length;
      const heading = element(
        "div",
        "display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;" +
          "text-transform:uppercase;letter-spacing:0.04em;" +
          "color:hsl(var(--muted-foreground));margin:10px 0 6px;",
      );
      if (group.accent) {
        const dot = element("span", "width:7px;height:7px;border-radius:2px;flex:0 0 auto;");
        dot.style.background = group.accent;
        heading.append(dot);
      }
      heading.append(element("span", "", group.label));
      list.append(heading);
      for (const dataset of hits) list.append(buildCard(dataset, status, group.accent));
    }
    if (!total) status.textContent = labels.empty;
    else if (!shown) status.textContent = labels.noResults;
    else status.textContent = labels.counted(shown, total);
  };

  const onInput = () => render();
  search.addEventListener("input", onInput);

  void fetchGeoenergyCatalog(controller.signal)
    .then((loaded) => {
      if (controller.signal.aborted) return;
      catalog = loaded;
      render();
    })
    .catch((error: unknown) => {
      if ((error as Error).name === "AbortError") return;
      console.error("Could not load the Geoenergy catalog.", error);
      status.textContent = labels.loadError;
    });

  return () => {
    controller.abort();
    if (catalogController === controller) catalogController = null;
    search.removeEventListener("input", onInput);
    container.replaceChildren();
  };
}

export const geoenergyCatalogPlugin: GeoLibrePlugin = {
  id: GEOENERGY_CATALOG_PLUGIN_ID,
  name: "Energy Data",
  version: "0.1.0",
  engines: ["maplibre", "cesium"],
  activate: (app) => {
    appRef = app;
    unregisterPanel =
      app.registerRightPanel?.({
        id: PANEL_ID,
        title: "Energy Data",
        dock: "replace-style",
        defaultWidth: 380,
        render: (container) => {
          panelContainer = container;
          disposePanel = buildPanel(container);
          return () => {
            disposePanel?.();
            disposePanel = null;
            panelContainer = null;
          };
        },
      }) ?? null;
    app.openRightPanel?.(PANEL_ID);
  },
  deactivate: (app) => {
    catalogController?.abort();
    catalogController = null;
    disposePanel?.();
    disposePanel = null;
    panelContainer = null;
    app.closeRightPanel?.(PANEL_ID);
    unregisterPanel?.();
    unregisterPanel = null;
    appRef = null;
  },
};

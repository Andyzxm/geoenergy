import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getInitialThemeMode } from "../apps/geoenergy/src/hooks/useThemeMode";

const originalWindow = (globalThis as { window?: unknown }).window;

/** Mock `window` with a search string and an OS dark-mode preference. */
function withWindow(search: string, prefersDark: boolean): void {
  (globalThis as { window?: unknown }).window = {
    location: { search },
    matchMedia: (query: string) => ({
      matches: query.includes("dark") ? prefersDark : false,
    }),
  };
}

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

// Geoenergy opens dark whatever the OS says, so these assertions differ from
// upstream GeoLibre's, where the OS preference wins. The `?theme=` override is
// unchanged, and remains the escape hatch for an embed or a light-only viewer.
describe("getInitialThemeMode", () => {
  it("defaults to dark regardless of the OS preference", () => {
    withWindow("", true);
    assert.equal(getInitialThemeMode(), "dark");
    withWindow("", false);
    assert.equal(getInitialThemeMode(), "dark");
  });

  it("honors ?theme=dark and ?theme=light over the default", () => {
    withWindow("?theme=dark", false);
    assert.equal(getInitialThemeMode(), "dark");
    withWindow("?theme=light", true);
    assert.equal(getInitialThemeMode(), "light");
  });

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    withWindow("?theme=DARK", false);
    assert.equal(getInitialThemeMode(), "dark");
    withWindow("?theme=%20Light%20", true);
    assert.equal(getInitialThemeMode(), "light");
  });

  it("ignores an unrecognized or empty theme value and stays dark", () => {
    withWindow("?theme=neon", false);
    assert.equal(getInitialThemeMode(), "dark");
    // A bare `?theme=` yields "", which is not a valid override either.
    withWindow("?theme=", false);
    assert.equal(getInitialThemeMode(), "dark");
  });

  it("returns dark when window is undefined (SSR)", () => {
    delete (globalThis as { window?: unknown }).window;
    assert.equal(getInitialThemeMode(), "dark");
  });
});

/**
 * The Geoenergy brand glyph: a bolt inside a hexagon.
 *
 * Drawn inline rather than pulled from lucide so the fork's mark is its own
 * asset and cannot drift when the icon set is bumped. It inherits `currentColor`
 * like every lucide icon in the toolbar, so it re-tints with the accent scheme
 * and works in both light and dark mode without a second file.
 */
export function GeoenergyMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      role="img"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Hexagon: the grid cell / node. */}
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7L12 2.5Z" />
      {/* Bolt, filled so the mark still reads at 16px where a stroked bolt
          collapses into the hexagon's outline. */}
      <path d="M12.8 7.2 8.9 13h2.7l-.4 3.8 3.9-5.8h-2.7l.4-3.8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

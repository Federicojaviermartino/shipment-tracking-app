import { clsx } from "clsx";

type AlertGlyphProps = {
  className?: string;
};

/**
 * Something went wrong or needs fixing before the user goes on. It is ink, drawn for a 12px
 * box like the status glyphs: red already means a shipment is late.
 */
export function AlertGlyph({ className }: AlertGlyphProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      width="12"
      height="12"
      className={clsx("shrink-0", className)}
    >
      <rect x="5" y="2" width="2" height="5" fill="currentColor" />
      <rect x="5" y="8" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

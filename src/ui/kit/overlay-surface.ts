/**
 * What every surface that floats above the page shares: the 8px radius, the hairline, the
 * one overlay shadow and the 200 ms entry. Menus, popovers, tooltips and the ask bar's
 * suggestions add their own padding and size.
 */
export const overlaySurface =
  "z-60 animate-enter rounded-lg border border-line bg-surface text-ink-900 shadow-overlay data-[side=top]:[--enter-from:-4px]";

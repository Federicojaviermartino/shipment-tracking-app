/**
 * Marks a region that stays in use while a drawer is open: a press on it does not close the
 * drawer. Spread it on the region's root and give that root `pointer-events-auto`, because a
 * modal dialog switches pointer events off for everything outside it.
 */
export const besideDrawer = { "data-beside-drawer": "" } as const;

export function isBesideDrawer(target: EventTarget | null) {
  return target instanceof Element && target.closest("[data-beside-drawer]") !== null;
}

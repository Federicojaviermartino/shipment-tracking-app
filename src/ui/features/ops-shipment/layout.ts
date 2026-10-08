/**
 * The two columns of the page, shared with its skeleton so that nothing moves when the data
 * arrives. Below 1024 the rail drops under the main column; up to 1279 it narrows to 340.
 */
export const LAYOUT = "mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_auto]";
export const MAIN = "flex min-w-0 flex-col gap-4";
export const RAIL = "flex flex-col gap-4 lg:w-85 xl:w-rail";

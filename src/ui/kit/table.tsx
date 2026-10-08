import { clsx } from "clsx";
import type { ComponentProps } from "react";

type TableProps = ComponentProps<"table"> & {
  /** Names the table for assistive technology; it is not displayed. */
  caption: string;
};

/**
 * A real table inside a card that scrolls sideways when the viewport is narrower than its
 * columns. Rows are two lines and 64px (`TableRow`, in its own module because it keeps
 * state); the header is 32px on the sunken tone.
 */
export function Table({ caption, className, children, ...props }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table
        {...props}
        className={clsx("w-full border-separate border-spacing-0 text-left text-sm", className)}
      >
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ className, ...props }: ComponentProps<"thead">) {
  return <thead {...props} className={clsx("bg-sunken", className)} />;
}

export function TableHeaderCell({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      {...props}
      className={clsx("h-8 px-4 text-label whitespace-nowrap", className)}
    />
  );
}

// The hairline above a row is the cell's own border, so the top padding gives up one pixel
// for it and the row stays on the 64px pitch.
const CELL = "border-t border-line px-4 align-top";

type TableCellProps = ComponentProps<"td"> & {
  /**
   * `th` makes the cell the header of its row. Use it for the cell that names the row (the
   * shipment), so that a reader moving down another column hears which row they are in.
   */
  as?: "td" | "th";
};

export function TableCell({ as: Cell = "td", className, ...props }: TableCellProps) {
  return (
    <Cell
      scope={Cell === "th" ? "row" : undefined}
      {...props}
      className={clsx(CELL, "pt-[11px] pb-3", Cell === "th" && "font-normal", className)}
    />
  );
}

/**
 * The cell of the row's one button. A 28px button is taller than a line of text, so the
 * cell lifts it by 4px: the button's label then sits on the first line of the other cells.
 */
export function TableActionCell({ className, ...props }: ComponentProps<"td">) {
  return <td {...props} className={clsx(CELL, "pt-[7px] pb-2", className)} />;
}

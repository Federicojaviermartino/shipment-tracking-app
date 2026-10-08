import { clsx } from "clsx";
import type { HTMLAttributes } from "react";
import { StatusBar } from "./status-bar";
import type { StatusKind } from "./status-glyph";

const DENSITY = {
  ops: "p-4",
  customer: "p-6",
} as const;

type CardVariant =
  | {
      /** `interactive` expects exactly one `link-stretched` link inside. */
      variant?: "static" | "interactive";
      status?: undefined;
    }
  | {
      /**
       * `flagged` adds the 3px status bar. The bar only repeats the status: the card's
       * content has to say it in words, with a `StatusPill` or in its title.
       */
      variant: "flagged";
      status: StatusKind;
    };

type CardProps = HTMLAttributes<HTMLElement> &
  CardVariant & {
    as?: "div" | "section" | "article" | "li";
    /** Padding 16 for operations, 24 for the customer portal. */
    density?: keyof typeof DENSITY;
  };

export function Card(props: CardProps) {
  const {
    as: Element = "div",
    variant = "static",
    status,
    density = "ops",
    className,
    children,
    ...rest
  } = props;

  return (
    <Element
      {...rest}
      className={clsx(
        "relative rounded-md border border-line bg-surface",
        DENSITY[density],
        variant === "interactive" &&
          "link-stretched-host transition-colors hover:border-line-strong hover:bg-canvas",
        status && "overflow-hidden",
        className,
      )}
    >
      {status && <StatusBar status={status} />}
      {children}
    </Element>
  );
}

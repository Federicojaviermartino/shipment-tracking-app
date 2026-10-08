import type { ReactNode } from "react";
import { IdentityChip } from "./identity-chip";

type PortalTopBarProps = {
  /** The wordmark inside a link to the customer's list. */
  home: ReactNode;
  /** The manufacturer whose portal this is: "Ibón Fluid Systems". */
  shipper: string;
  /** The customer account: "Aquabajío Ingeniería, S.A. de C.V.". */
  account: string;
  /** The signed-in person: "Mariana Olvera". */
  person: string;
};

/** The portal chrome, aligned with the centred column. The list is the home: no navigation. */
export function PortalTopBar({ home, shipper, account, person }: PortalTopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex h-topbar max-w-portal items-center gap-4 px-5 xl:px-8">
        <div className="shrink-0">{home}</div>
        <span aria-hidden="true" className="h-5 w-px bg-line" />
        <p className="min-w-0 truncate text-sm text-ink-600">{shipper} · shipment tracking</p>
        <IdentityChip name={person} perimeter={account} className="ml-auto" />
      </div>
    </header>
  );
}

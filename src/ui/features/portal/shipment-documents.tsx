"use client";

import { Download } from "lucide-react";
import type { PortalShipmentView } from "@/application/views";
import { dateValue } from "@/ui/format/when";
import { Button } from "@/ui/kit/button";
import { DateText } from "@/ui/kit/date-stamp";
import { RailCard } from "./rail-card";
import { saveDocumentPlaceholder } from "./save-document-placeholder";

type ShipmentDocumentsProps = {
  shipment: Pick<PortalShipmentView, "documents" | "orderRef" | "zone">;
};

/** The documents a customer may have, each with the day it was issued at the destination. */
export function ShipmentDocuments({ shipment }: ShipmentDocumentsProps) {
  const { documents, orderRef, zone } = shipment;

  return (
    <RailCard title="Documents">
      {documents.length === 0 ? (
        <p className="mt-3 text-ink-600">No documents yet.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {documents.map((document) => (
            <li key={document.fileName} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{document.label}</p>
                <p className="text-xs text-ink-600">
                  <DateText {...dateValue({ at: document.at, precision: "day", zone })} />
                </p>
              </div>
              <Button
                size="sm"
                icon={<Download aria-hidden="true" className="size-4" />}
                aria-label={`Download ${document.label}`}
                onClick={() => saveDocumentPlaceholder({ ...document, orderRef })}
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line pt-3 text-xs text-ink-600">
        Prototype: a download saves a placeholder text file, not the document.
      </p>
    </RailCard>
  );
}

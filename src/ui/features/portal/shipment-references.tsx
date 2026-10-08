import type { PortalShipmentView } from "@/application/views";
import { KeyValue, KeyValueList } from "@/ui/kit/key-value";
import { RailCard } from "./rail-card";

type ShipmentReferencesProps = {
  shipment: Pick<PortalShipmentView, "references" | "incotermLine">;
};

/** The identifiers an importer quotes to a broker, ending with who clears import. */
export function ShipmentReferences({ shipment }: ShipmentReferencesProps) {
  return (
    <RailCard title="References">
      <KeyValueList className="mt-3">
        {shipment.references.map((reference) => (
          <KeyValue key={reference.label} label={reference.label}>
            {reference.value}
          </KeyValue>
        ))}
        <KeyValue label="Incoterm">{shipment.incotermLine}</KeyValue>
      </KeyValueList>
    </RailCard>
  );
}

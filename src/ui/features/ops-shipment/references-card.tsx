import { useId } from "react";
import type { OpsShipmentView } from "@/application/views";
import { Card } from "@/ui/kit/card";
import { KeyValue, KeyValueList } from "@/ui/kit/key-value";

type ReferencesCardProps = {
  references: OpsShipmentView["references"];
};

/** Every number the shipment goes by, with whoever issued it: what an operator will ask for. */
export function ReferencesCard({ references }: ReferencesCardProps) {
  const titleId = useId();

  return (
    <Card as="section" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-lg font-semibold">
        References
      </h2>
      <KeyValueList className="mt-2">
        {references.map((reference) => (
          <KeyValue key={`${reference.label}:${reference.value}`} label={reference.label}>
            <span className="font-mono text-xs/5">{reference.value}</span>
            <span className="text-xs text-ink-600"> · {reference.holder}</span>
          </KeyValue>
        ))}
      </KeyValueList>
    </Card>
  );
}

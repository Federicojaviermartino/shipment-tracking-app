"use client";

import { clsx } from "clsx";
import { ChevronUp } from "lucide-react";
import { Fragment } from "react";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/ui/kit/menu";
import { demoControl, demoControlQuiet } from "./demo-control";

export type DemoPersona = {
  id: string;
  name: string;
  /** "Logistics Operations Lead". */
  title: string;
  /** What the persona may see, in words: "All sites, all accounts · 23 shipments". */
  perimeter: string;
  side: "operations" | "customer";
};

type PersonaMenuProps = {
  personas: readonly DemoPersona[];
  activeId: string;
  onChange: (id: string) => void;
};

const SIDES = [
  { side: "operations", label: "Operations" },
  { side: "customer", label: "Customer" },
] as const;

/** Switches the signed-in persona. It opens upward from the demo bar. */
export function PersonaMenu({ personas, activeId, onChange }: PersonaMenuProps) {
  const active = personas.find((persona) => persona.id === activeId);

  return (
    <Menu>
      <MenuTrigger className={clsx(demoControl, demoControlQuiet, "shrink-0 px-2")}>
        <span className="text-ink-400">Viewing as</span>
        {active?.name ?? "nobody"}
        <ChevronUp aria-hidden="true" className="size-3.5" />
      </MenuTrigger>
      <MenuContent side="top" className="w-88">
        <MenuRadioGroup value={activeId} onValueChange={onChange}>
          {SIDES.map(({ side, label }, index) => (
            <Fragment key={side}>
              {index > 0 && <MenuSeparator />}
              <MenuGroup label={label}>
                {personas
                  .filter((persona) => persona.side === side)
                  .map((persona) => (
                    <MenuRadioItem
                      key={persona.id}
                      value={persona.id}
                      description={
                        <>
                          {persona.title}
                          <br />
                          {persona.perimeter}
                        </>
                      }
                    >
                      {persona.name}
                    </MenuRadioItem>
                  ))}
              </MenuGroup>
            </Fragment>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

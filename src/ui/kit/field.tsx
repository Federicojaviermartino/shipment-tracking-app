"use client";

import { clsx } from "clsx";
import { type ComponentProps, createContext, type ReactNode, use, useId } from "react";
import { InlineMessage } from "./inline-message";

type FieldWiring = {
  id: string;
  describedBy?: string;
  invalid: boolean;
};

const FieldContext = createContext<FieldWiring | null>(null);

type FieldProps = {
  label: string;
  /** Keeps the label for assistive technology when the layout already names the field. */
  labelHidden?: boolean;
  /** Why the value cannot be accepted. Marks the control invalid and is read with it. */
  error?: string;
  className?: string;
  /** One `TextInput` or `TextArea`. */
  children: ReactNode;
};

/** Ties a label and an error message to the control inside it. */
export function Field({ label, labelHidden = false, error, className, children }: FieldProps) {
  const id = useId();
  const errorId = useId();
  const wiring = { id, describedBy: error ? errorId : undefined, invalid: Boolean(error) };

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={clsx(labelHidden ? "sr-only" : "mb-1 block text-xs font-medium text-ink-600")}
      >
        {label}
      </label>
      <FieldContext value={wiring}>{children}</FieldContext>
      {/* Always in the document: a live region is only announced when its content changes. */}
      <div id={errorId} aria-live="polite">
        {error && <InlineMessage className="mt-2">{error}</InlineMessage>}
      </div>
    </div>
  );
}

// An input border is line-strong; an invalid one turns ink and doubles, because red and
// amber already mean a shipment is late.
const CONTROL =
  "w-full rounded-sm border border-line-strong bg-surface px-2.5 text-sm text-ink-900 aria-invalid:border-ink-900 aria-invalid:inset-ring aria-invalid:inset-ring-ink-900";

function useFieldWiring() {
  const field = use(FieldContext);
  return {
    id: field?.id,
    "aria-describedby": field?.describedBy,
    "aria-invalid": field?.invalid || undefined,
  };
}

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input {...useFieldWiring()} {...props} className={clsx(CONTROL, "h-8", className)} />;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      {...useFieldWiring()}
      {...props}
      className={clsx(CONTROL, "block min-h-24 resize-y py-2 leading-5", className)}
    />
  );
}

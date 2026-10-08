"use client";

import { clsx } from "clsx";
import { Search, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { IconButton } from "@/ui/kit/icon-button";
import { overlaySurface } from "@/ui/kit/overlay-surface";
import { Spinner } from "@/ui/kit/spinner";

type AskBarProps = {
  value: string;
  onValueChange: (value: string) => void;
  /** Called with the trimmed text on Enter, or with a suggestion when one is picked. */
  onSubmit: (value: string) => void;
  /** Offered while the field is focused and empty, so that nobody faces a blank box. */
  suggestions?: readonly string[];
  /** The question is being read: a spinner takes the place of the search icon. */
  pending?: boolean;
  /** Whether "/" focuses this field. Only one field on a page should answer to it. */
  shortcut?: boolean;
  placeholder?: string;
  className?: string;
};

const TYPING_TARGETS = ["INPUT", "TEXTAREA", "SELECT"];

/**
 * The ask bar of the operations top bar: 480px wide, 640px while focused, and focused by
 * the "/" key from anywhere outside a text field. It is a combobox over the suggestions and
 * a plain search field otherwise.
 */
export function AskBar({
  value,
  onValueChange,
  onSubmit,
  suggestions = [],
  pending = false,
  shortcut = true,
  placeholder = 'Ask or search: "shipments to France this week running late"',
  className,
}: AskBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const open = focused && !dismissed && value.trim() === "" && suggestions.length > 0;
  const activeOption = open ? suggestions[activeIndex] : undefined;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    if (!shortcut) {
      return;
    }
    function focusOnSlash(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || TYPING_TARGETS.includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", focusOnSlash);
    return () => document.removeEventListener("keydown", focusOnSlash);
  }, [shortcut]);

  function choose(suggestion: string) {
    setActiveIndex(-1);
    onValueChange(suggestion);
    onSubmit(suggestion);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = value.trim();
    if (text) {
      onSubmit(text);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) {
        setDismissed(true);
        setActiveIndex(-1);
      } else if (value) {
        onValueChange("");
      } else {
        inputRef.current?.blur();
      }
      return;
    }
    if (!open) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeOption !== undefined) {
      event.preventDefault();
      choose(activeOption);
    }
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={clsx(
        "relative w-120 max-w-full transition-[width] duration-200 focus-within:w-160",
        className,
      )}
    >
      <label htmlFor={inputId} className="sr-only">
        Ask about your shipments
      </label>
      <div className="flex h-9 items-center gap-2 rounded-sm border border-line-strong bg-surface pr-1 pl-2.5 has-[input:focus-visible]:focus-outline">
        <span className="grid size-4 shrink-0 place-items-center text-ink-500">
          {pending ? <Spinner /> : <Search aria-hidden="true" className="size-4" />}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={activeOption === undefined ? undefined : optionId(activeIndex)}
          aria-autocomplete="list"
          aria-busy={pending || undefined}
          aria-keyshortcuts="/"
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            setActiveIndex(-1);
            onValueChange(event.target.value);
          }}
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          onBlur={() => {
            setFocused(false);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-hidden"
        />
        {value ? (
          <IconButton
            label="Clear"
            icon={<X />}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onValueChange("");
              inputRef.current?.focus();
            }}
          />
        ) : (
          shortcut &&
          !focused && (
            <kbd
              aria-hidden="true"
              className="mr-1.5 grid h-5 min-w-5 place-items-center rounded-sm border border-line px-1 font-mono text-2xs text-ink-500"
            >
              /
            </kbd>
          )
        )}
      </div>
      {open && (
        <div className={clsx(overlaySurface, "absolute inset-x-0 top-full mt-1.5 p-1")}>
          <p className="px-2 pt-2 pb-1 text-label">Try asking</p>
          <ul id={listId} role="listbox" aria-label="Suggested questions">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(suggestion)}
                // The active option has no focus of its own, so it draws the focus ring itself.
                className={clsx(
                  "cursor-default rounded-sm px-2 py-1.5 text-sm",
                  index === activeIndex && "bg-sunken focus-outline -outline-offset-2",
                )}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

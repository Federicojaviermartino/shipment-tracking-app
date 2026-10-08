import { useState } from "react";

/**
 * One flash for data that changed in place. `flashKey` names the latest change, for example
 * the key of the row's newest event: nothing happens on mount, and every later change of
 * the key flashes once more, on an element that stays mounted. Under reduced motion there
 * is no flash; `unseen` then stays true until `see` is called, which is when the caller
 * shows a bar instead.
 */
export function useFlash(flashKey: string | number | undefined) {
  const [lastKey, setLastKey] = useState(flashKey);
  const [flashes, setFlashes] = useState(0);
  // How many of them the reader has looked at. A count and not a flag, because React may
  // apply an acknowledgement after a later flash: it then still refers to its own flash.
  const [seen, setSeen] = useState(0);

  if (flashKey !== lastKey) {
    setLastKey(flashKey);
    if (flashKey !== undefined) {
      setFlashes(flashes + 1);
    }
  }

  // The same keyframes under two names: a change of name is what restarts a CSS animation.
  const animation =
    flashes === 0
      ? undefined
      : flashes % 2 === 1
        ? "motion-safe:animate-flash"
        : "motion-safe:animate-flash-again";

  return {
    animation,
    unseen: flashes > seen,
    see: () => setSeen(flashes),
  };
}

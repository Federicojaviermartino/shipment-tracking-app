/**
 * A model call takes time and a mock does not: the delay is added where the prototype is wired,
 * so that loading states are real in the app and tests wait for nothing.
 */
export function withLatency<Arguments extends unknown[], Result>(
  call: (...args: Arguments) => Promise<Result>,
  ms: number,
): (...args: Arguments) => Promise<Result> {
  if (ms <= 0) return call;
  return async (...args) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return call(...args);
  };
}

type SkipLinkProps = {
  /** The id of the page's main region. */
  target?: string;
};

/** The first tab stop of every page: jumps over the chrome to the content. */
export function SkipLink({ target = "main" }: SkipLinkProps) {
  return (
    <a
      href={`#${target}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-80 focus:rounded-sm focus:bg-ink-900 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
    >
      Skip to content
    </a>
  );
}

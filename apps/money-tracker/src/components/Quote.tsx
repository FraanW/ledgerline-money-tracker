import React from "react";

/**
 * Editorial pull-quote — classic italic serif (Playfair Display) for any quoted
 * line, with a decorative quotation mark. The "great classic blog" typography.
 */
export function Quote({ children, cite, size = "1.5em" }: { children: React.ReactNode; cite?: string; size?: string }) {
  return (
    <figure className="my-1">
      <blockquote
        className="relative pl-9 italic leading-snug text-text"
        style={{ fontFamily: "var(--ml-font-quote)", fontSize: size }}
      >
        <span
          aria-hidden
          className="absolute left-0 top-[-0.15em] not-italic text-accent"
          style={{ fontFamily: "var(--ml-font-quote)", fontSize: "2.4em", opacity: 0.55, lineHeight: 1 }}
        >
          &ldquo;
        </span>
        {children}
      </blockquote>
      {cite && (
        <figcaption className="mt-1 pl-9 text-[0.8em] not-italic text-text-muted">— {cite}</figcaption>
      )}
    </figure>
  );
}

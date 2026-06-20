import React from "react";

/** Placeholder content for app surfaces whose screens aren't wired to live data
 *  yet (they exist as Storybook designs). Token-driven so it themes per persona. */
export function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center p-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-raised text-accent text-[1.4em]">◷</span>
      <h1 className="mt-4 font-display text-[1.7em] font-bold text-text">{title}</h1>
      <p className="mt-2 text-[0.98em] leading-relaxed text-text-muted">
        {note ?? "This surface is designed and taking shape — it'll wire to live data next. For now, explore the Philosophies and the landing."}
      </p>
    </div>
  );
}

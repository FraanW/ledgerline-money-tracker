import Link from "next/link";
import { AppShell } from "../../components/AppShell";
import { Icon } from "../../components/Icon";
import { GROUPS, LENSES, lensesInGroup } from "./registry";

/** Tracking Philosophies — the index. One card per lens, grouped; click to open. */
export default function PhilosophiesIndex() {
  return (
    <AppShell active="philosophies">
      <div className="mx-auto max-w-5xl p-[calc(1.75rem*var(--ml-density))]">
        <header className="mb-8">
          <p className="text-[0.78em] font-semibold uppercase tracking-[0.2em] text-accent">Tracking Philosophies</p>
          <h1 className="mt-1 font-display text-[2.2em] font-bold leading-tight text-text">Read your money {LENSES.length} ways.</h1>
          <p className="mt-2 max-w-2xl text-[1em] text-text-muted">
            The same ledger, seen through famous money philosophies — each a living lens you can open, play with, and learn from. Pick one.
          </p>
        </header>

        {GROUPS.map((group) => (
          <section key={group} className="mb-9">
            <h2 className="mb-3 font-display text-[1.25em] font-bold text-text">{group}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lensesInGroup(group).map((l) => (
                <Link
                  key={l.slug}
                  href={`/philosophies/${l.slug}`}
                  className="group flex flex-col rounded-md border border-border bg-surface p-4 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
                  style={{ transitionDuration: "var(--ml-motion-base)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-[1.05em] font-bold text-text">{l.title}</span>
                    <span className="mt-0.5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5">
                      <Icon name="check" emoji="→" size={15} />
                    </span>
                  </div>
                  <span className="mt-0.5 text-[0.8em] text-text-muted">{l.author}</span>
                  <span className="mt-2 text-[0.9em] leading-snug text-text">{l.oneLiner}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}

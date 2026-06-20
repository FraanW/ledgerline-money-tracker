import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { Icon } from "../../../components/Icon";
import { LENSES, getLens } from "../registry";

export function generateStaticParams() {
  return LENSES.map((l) => ({ slug: l.slug }));
}

function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[0.72em] font-semibold uppercase tracking-wide text-accent">{label}</div>
      <p className="mt-1 text-[0.95em] leading-relaxed text-text-muted">{children}</p>
    </div>
  );
}

export default function LensPage({ params }: { params: { slug: string } }) {
  const lens = getLens(params.slug);
  if (!lens) notFound();

  const idx = LENSES.findIndex((l) => l.slug === lens.slug);
  const prev = idx > 0 ? LENSES[idx - 1] : undefined;
  const next = idx < LENSES.length - 1 ? LENSES[idx + 1] : undefined;
  const Lens = lens.Component;

  return (
    <AppShell active="philosophies">
      <div className="mx-auto max-w-3xl p-[calc(1.5rem*var(--ml-density))]">
        <Link href="/philosophies" className="inline-flex items-center gap-1.5 text-[0.85em] text-text-muted hover:text-accent">
          <Icon name="check" emoji="←" size={14} /> All philosophies
        </Link>

        <header className="mt-4 mb-6">
          <p className="text-[0.74em] font-semibold uppercase tracking-[0.2em] text-accent">{lens.group} · {lens.author}</p>
          <h1 className="mt-1 font-display text-[2em] font-bold leading-tight text-text">{lens.title}</h1>
          <p className="mt-2 text-[1.05em] text-text-muted">{lens.oneLiner}</p>
        </header>

        {/* the live, interactive lens */}
        <Lens />

        {/* the teaching panel */}
        <section className="mt-8 flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-5">
          <InfoBlock label="What it is">{lens.whatItIs}</InfoBlock>
          <InfoBlock label="Why it matters">{lens.whyItMatters}</InfoBlock>
          <InfoBlock label="How to read this view">{lens.howToRead}</InfoBlock>
        </section>

        {/* prev / next */}
        <nav className="mt-6 flex items-stretch justify-between gap-3">
          {prev ? (
            <Link href={`/philosophies/${prev.slug}`} className="flex-1 rounded-md border border-border p-3 text-left hover:border-accent">
              <div className="text-[0.7em] uppercase tracking-wide text-text-muted">← Previous</div>
              <div className="mt-0.5 text-[0.92em] font-medium text-text">{prev.title}</div>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {next ? (
            <Link href={`/philosophies/${next.slug}`} className="flex-1 rounded-md border border-border p-3 text-right hover:border-accent">
              <div className="text-[0.7em] uppercase tracking-wide text-text-muted">Next →</div>
              <div className="mt-0.5 text-[0.92em] font-medium text-text">{next.title}</div>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
        </nav>
      </div>
    </AppShell>
  );
}

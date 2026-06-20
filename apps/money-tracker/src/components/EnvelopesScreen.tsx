import React from "react";
import type { Envelope } from "@ledgerline/types";
import { Card, Badge, Button, MoneyText, Stat, ScreenShell } from "./primitives";
import { PageRemark } from "./PageRemark";

/**
 * THE hero screen. Monthly envelopes with balances; allocate/transfer
 * affordances; the never-negative constraint made visible (a spend that would
 * overdraw is blocked); rollover hint.
 *
 * Layout seam: `envelopeRenderer` lets a theme swap card-grid / list / progress
 * treatment without touching this component's structure (THEMING.md).
 */
export function EnvelopesScreen({
  envelopes,
  unallocated,
  period,
  envelopeRenderer,
}: {
  envelopes: Envelope[];
  unallocated: Envelope;
  period: string;
  envelopeRenderer?: (env: Envelope) => React.ReactNode;
}) {
  const totalBudgeted = envelopes.reduce((s, e) => s + e.balance.minor, 0);

  return (
    <ScreenShell
      title="Envelopes"
      subtitle={`Your budget for ${period}. Money lives in envelopes — you can only spend what's inside.`}
      actions={<Button>Allocate income</Button>}
    >
      <PageRemark screen="envelopes" />
      <Card className="p-[calc(1.25rem*var(--ml-density))]">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Stat label="Budgeted across envelopes" value={{ minor: totalBudgeted, currency: "INR" }} />
          <Stat label="Unallocated" value={unallocated.balance} tone="warning" />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-[calc(0.75rem*var(--ml-density))] sm:grid-cols-2">
        {envelopes.map((env) =>
          envelopeRenderer ? (
            <React.Fragment key={env.id}>{envelopeRenderer(env)}</React.Fragment>
          ) : (
            <DefaultEnvelopeCard key={env.id} env={env} />
          ),
        )}
      </div>

      {/* never-negative made visible: an attempted overdraw */}
      <Card className="border-negative p-[calc(1rem*var(--ml-density))]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.98em] font-medium text-text">BookMyShow · ₹980</p>
            <p className="text-[0.85em] text-negative">
              Blocked — “Fun” has ₹0. This spend can’t overdraw the envelope.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary">Move money in</Button>
            <Button variant="secondary">Send to Unallocated</Button>
          </div>
        </div>
      </Card>

      <p className="text-[0.85em] text-text-muted">
        Leftover balances roll over into next month automatically.
      </p>
    </ScreenShell>
  );
}

function DefaultEnvelopeCard({ env }: { env: Envelope }) {
  const empty = env.balance.minor === 0;
  return (
    <Card className="p-[calc(1rem*var(--ml-density))]">
      <div className="flex items-center justify-between">
        <span className="text-[1.02em] font-medium text-text">{env.name}</span>
        {empty ? <Badge tone="negative">empty</Badge> : <Badge tone="positive">funded</Badge>}
      </div>
      <div className="mt-2">
        <MoneyText value={env.balance} tone={empty ? "muted" : "default"} className="text-[1.5em] font-bold" />
        <span className="ml-1 text-[0.8em] text-text-muted">left</span>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary">Add</Button>
        <Button variant="secondary">Move</Button>
      </div>
    </Card>
  );
}

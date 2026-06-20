import React from "react";
import { formatMoney } from "@ledgerline/types";
import { flow, type FlowNode } from "../../mocks/vizData";
import { useViztip } from "./Tooltip";

const PALETTE = [
  "var(--ml-color-accent)",
  "var(--ml-color-accent-2)",
  "var(--ml-color-positive)",
  "var(--ml-color-warning)",
  "var(--ml-color-negative)",
  "var(--ml-color-text-muted)",
];

/**
 * Sankey-lite money flow: Income (left) fans out into envelopes + Unallocated
 * (right), ribbon width proportional to amount. The whole month's plan in one
 * picture. Pure SVG bezier ribbons, token-coloured.
 */
export function MoneyFlow({ width = 560, height = 360 }: { width?: number; height?: number }) {
  const income = flow.nodes.find((n) => n.kind === "income")!;
  const dests = flow.nodes.filter((n) => n.kind === "envelope" || n.id === "unallocated");
  const total = dests.reduce((s, d) => s + d.amountMinor, 0) || 1;

  const padY = 12;
  const usableH = height - padY * 2;
  const leftX = 8;
  const nodeW = 18;
  const rightX = width - nodeW - 8;

  // Income bar spans full usable height; destinations stack proportionally.
  let cursor = padY;
  const destLayout = dests.map((d, i) => {
    const h = Math.max(6, (d.amountMinor / total) * usableH - 4);
    const y = cursor;
    cursor += h + 4;
    return { node: d, y, h, color: PALETTE[i % PALETTE.length] };
  });

  // Income ribbon offsets stack down the income bar too.
  let inCursor = padY;
  const tip = useViztip();
  const pctOfIncome = (m: number) => (income.amountMinor > 0 ? Math.round((m / income.amountMinor) * 100) : 0);
  const explain = (node: FlowNode) => {
    const base = `${formatMoney({ minor: node.amountMinor, currency: "INR" })} · ${pctOfIncome(node.amountMinor)}% of income`;
    if (node.id === "unallocated") return `${base}. Income that wasn't budgeted into an envelope — the ribbon width is how much slipped through.`;
    return `${base}. Ribbon width = how much of your income flowed into ${node.label}.`;
  };

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative w-full overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Money flow">
        {/* ribbons */}
        {destLayout.map(({ node, y, h, color }) => {
          const sourceH = (node.amountMinor / total) * usableH;
          const sy = inCursor;
          inCursor += sourceH;
          const x0 = leftX + nodeW;
          const x1 = rightX;
          const mid = (x0 + x1) / 2;
          // ribbon as a filled path between two horizontal edges
          const topPath = `M ${x0} ${sy} C ${mid} ${sy}, ${mid} ${y}, ${x1} ${y}`;
          const botPath = `L ${x1} ${y + h} C ${mid} ${y + h}, ${mid} ${sy + sourceH}, ${x0} ${sy + sourceH} Z`;
          return (
            <path
              key={node.id}
              d={`${topPath} ${botPath}`}
              fill={color}
              opacity={0.32}
              style={{ transition: "opacity var(--ml-motion-base)", cursor: "pointer" }}
              onMouseEnter={tip.enter(node.label, explain(node))}
              onMouseLeave={tip.leave}
            />
          );
        })}

        {/* income node */}
        <rect x={leftX} y={padY} width={nodeW} height={usableH} rx={5} fill="var(--ml-color-text)" />
        <text x={leftX + nodeW + 6} y={padY + 14} fontSize="12" fontWeight={700} fill="var(--ml-color-text)">
          Income
        </text>
        <text x={leftX + nodeW + 6} y={padY + 30} fontSize="11" fill="var(--ml-color-text-muted)">
          {formatMoney({ minor: income.amountMinor, currency: "INR" })}
        </text>

        {/* destination nodes + labels */}
        {destLayout.map(({ node, y, h, color }) => (
          <g key={node.id}>
            <rect x={rightX} y={y} width={nodeW} height={h} rx={5} fill={color} />
            <text x={rightX - 6} y={y + Math.min(h, 14)} fontSize="11" fontWeight={600} textAnchor="end" fill="var(--ml-color-text)">
              {node.label}
            </text>
            {h > 22 && (
              <text x={rightX - 6} y={y + 26} fontSize="10" textAnchor="end" fill="var(--ml-color-text-muted)">
                {formatMoney({ minor: node.amountMinor, currency: "INR" })}
              </text>
            )}
          </g>
        ))}
      </svg>
      {tip.node}
    </div>
  );
}

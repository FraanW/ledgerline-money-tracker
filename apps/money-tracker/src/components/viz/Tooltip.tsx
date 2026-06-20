import React, { useRef, useState, useCallback } from "react";

/**
 * Shared hover-tooltip for the viz components — a token-styled card that follows
 * the cursor and carries BOTH the value and a plain-English explanation, so
 * every chart is self-documenting ("completely explainable").
 *
 * Usage:
 *   const tip = useViztip();
 *   <div ref={tip.ref} onMouseMove={tip.onMove} className="relative">
 *     <svg>... <rect onMouseEnter={tip.enter("Groceries", "₹2,480 · 28% — your biggest category")} onMouseLeave={tip.leave} /></svg>
 *     {tip.node}
 *   </div>
 */
export interface TipState {
  x: number;
  y: number;
  title: string;
  detail: string;
}

export function useViztip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const rel = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const enter = useCallback(
    (title: string, detail: string) => (e: React.MouseEvent) => {
      const { x, y } = rel(e);
      setTip({ title, detail, x, y });
    },
    [],
  );

  const onMove = useCallback((e: React.MouseEvent) => {
    setTip((t) => {
      if (!t) return t;
      const r = ref.current?.getBoundingClientRect();
      return { ...t, x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
    });
  }, []);

  const leave = useCallback(() => setTip(null), []);

  const width = ref.current?.clientWidth ?? 0;
  const flip = tip ? tip.x > width - 240 : false;

  const node = tip ? (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-50 max-w-[240px] rounded-md border border-border bg-surface-raised px-3 py-2 shadow-md"
      style={{
        left: tip.x + (flip ? -12 : 12),
        top: tip.y + 12,
        transform: flip ? "translateX(-100%)" : undefined,
      }}
    >
      <div className="text-[0.85em] font-bold text-text">{tip.title}</div>
      <div className="mt-0.5 text-[0.78em] leading-snug text-text-muted">{tip.detail}</div>
    </div>
  ) : null;

  return { ref, enter, leave, onMove, node };
}

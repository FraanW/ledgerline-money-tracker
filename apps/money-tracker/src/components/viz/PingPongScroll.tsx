"use client";

import React, { useEffect, useRef } from "react";

/**
 * Horizontal scroll container that, on small screens, gently auto-scrolls to
 * one end and back ("ping-pong") once on mount — a friendly signal that there's
 * more to see and the content can be swiped. Respects reduced-motion, and only
 * animates when the content actually overflows.
 */
export function PingPongScroll({
  children,
  className = "",
  maxWidthForHint = 768,
}: {
  children: React.ReactNode;
  className?: string;
  maxWidthForHint?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmall = window.innerWidth <= maxWidthForHint;
    const overflow = el.scrollWidth - el.clientWidth;
    if (reduce || !isSmall || overflow < 24) return;

    let cancelled = false;
    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    const animateTo = (target: number, dur: number) =>
      new Promise<void>((resolve) => {
        const start = el.scrollLeft;
        const t0 = performance.now();
        const tick = (now: number) => {
          if (cancelled) return resolve();
          const p = Math.min(1, (now - t0) / dur);
          el.scrollLeft = start + (target - start) * easeInOut(p);
          if (p < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      await wait(450);
      await animateTo(overflow, 1100); // glide to the far end
      await wait(250);
      await animateTo(0, 1100); // and back, to show both ends
    })();

    return () => {
      cancelled = true;
    };
  }, [maxWidthForHint]);

  return (
    <div ref={ref} className={`overflow-x-auto ${className}`} style={{ scrollbarWidth: "thin" }}>
      {children}
    </div>
  );
}

"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Persona Scroll Landing — hi-fi build wired from the Claude-Design handoff
 * (design_handoff_marketing_landing/). One bright page that scrolls through the
 * worlds: Hero (problem) → How it works → Gen Z → Millennial → Senior → Close.
 *
 * Self-themed marketing page (all three personas coexist), so it hardcodes
 * per-section palettes rather than consuming the global --ml-* provider. Real
 * portrait photography with a persona-tinted vignette, the brand seal logo, a
 * fixed nav that swaps light/dark over dark sections, and dependency-free
 * scroll reveals. Images live in /public/marketing (served via staticDirs).
 */

const A = "/marketing";

/* ── scroll-reveal (CSS-class based, matches the handoff .reveal/.in) ─────── */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setShown(true)),
      { threshold: 0.18 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

const veil = (color: string, fx: string, fy: string): React.CSSProperties =>
  ({ background: color, ["--veil" as string]: color, ["--fx" as string]: fx, ["--fy" as string]: fy } as React.CSSProperties);

const CSS = `
.ls{ font-family:'Spectral', Georgia, serif; --quote:'Playfair Display', Georgia, serif; }
.ls *{ box-sizing:border-box; }
.ls a{ text-decoration:none; color:inherit; }
.ls section{ position:relative; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:88px 24px; }
.ls .wrap{ width:100%; max-width:1120px; margin:0 auto; }
.ls .two{ display:grid; grid-template-columns:1fr 1fr; gap:48px; align-items:center; }
@media (max-width:860px){ .ls .two{ grid-template-columns:1fr; gap:32px; } .ls section{ padding:72px 20px; } }
.ls .eyebrow{ margin:0 0 12px; font-size:0.8rem; font-weight:600; text-transform:uppercase; letter-spacing:0.28em; }
.ls .display{ margin:0; line-height:1.05; font-weight:700; }
.ls .lead{ margin:20px 0 0; font-size:1.06rem; line-height:1.6; max-width:30rem; }
.ls .quote{ font-family:var(--quote); font-style:italic; line-height:1.25; border-left:2px solid; padding-left:18px; margin:22px 0 0; }
.ls .cta{ display:inline-flex; align-items:center; gap:8px; border:0; cursor:pointer; border-radius:999px; padding:14px 26px; font-family:'Spectral',serif; font-weight:600; font-size:0.98rem; transition:transform 140ms ease, box-shadow 200ms ease; }
.ls .cta:hover{ transform:translateY(-2px); }
.ls .reveal{ opacity:0; transform:translateY(28px); transition:opacity 700ms cubic-bezier(0.22,1,0.36,1), transform 700ms cubic-bezier(0.22,1,0.36,1); }
.ls .reveal.in{ opacity:1; transform:none; }
.ls .nav{ position:fixed; top:0; left:0; right:0; z-index:50; display:flex; align-items:center; justify-content:space-between; padding:16px 28px; backdrop-filter:blur(10px); background:rgba(246,244,238,0.72); border-bottom:1px solid rgba(21,36,29,0.08); transition:background 300ms ease, border-color 300ms ease; }
.ls .nav.dark{ background:rgba(10,11,13,0.6); border-bottom-color:rgba(255,255,255,0.08); }
.ls .brand{ display:flex; align-items:center; gap:9px; font-weight:700; font-size:1.05rem; transition:color 300ms ease; }
.ls .navlinks{ display:flex; align-items:center; gap:24px; font-size:0.9rem; }
@media (max-width:680px){ .ls .navlinks a.hideable{ display:none; } }
.ls .bleed{ padding:0; display:grid; grid-template-columns:53% 47%; min-height:100vh; align-items:stretch; }
.ls .bleed[data-side="right"]{ grid-template-columns:47% 53%; }
.ls .bleed-media{ position:relative; overflow:hidden; }
.ls .bleed[data-side="right"] .bleed-media{ order:2; }
.ls .bleed-media img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.ls .bleed-veil{ position:absolute; inset:0; z-index:2; pointer-events:none; background: radial-gradient(135% 105% at var(--fx,42%) var(--fy,40%), transparent 20%, color-mix(in srgb, var(--veil) 46%, transparent) 60%, var(--veil) 100%), linear-gradient(to var(--seam,right), transparent 52%, var(--veil) 96%); }
.ls .bleed[data-side="left"]{ --seam:right; }
.ls .bleed[data-side="right"]{ --seam:left; }
.ls .bleed-body{ display:flex; align-items:center; padding:64px clamp(32px,6vw,92px); position:relative; z-index:3; }
.ls .bleed[data-side="right"] .bleed-body{ order:1; }
.ls .bleed-body .inner{ max-width:470px; width:100%; display:flex; flex-direction:column; gap:18px; }
.ls .bleed-body .inner > *{ margin:0; }
@media (max-width:820px){
  .ls .bleed, .ls .bleed[data-side="right"]{ grid-template-columns:1fr; }
  .ls .bleed-media{ height:58vh; }
  .ls .bleed[data-side="right"] .bleed-media{ order:0; }
  .ls .bleed[data-side="right"] .bleed-body{ order:1; }
  .ls .bleed-body{ padding:40px 28px; }
  .ls .bleed-veil{ background: radial-gradient(120% 80% at 50% 38%, transparent 24%, color-mix(in srgb, var(--veil) 40%, transparent) 70%, var(--veil) 100%), linear-gradient(to bottom, transparent 60%, var(--veil) 98%); }
}
.ls .cue{ position:absolute; bottom:30px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:4px; animation:ls-bob 1.8s ease-in-out infinite; }
.ls .cue span{ font-size:11px; text-transform:uppercase; letter-spacing:0.25em; opacity:0.7; }
@keyframes ls-bob{ 0%,100%{ transform:translate(-50%,0); } 50%{ transform:translate(-50%,6px); } }
@media (prefers-reduced-motion: reduce){ .ls .reveal{ opacity:1; transform:none; } .ls .cue{ animation:none; } }
`;

const HERO_MASK =
  "linear-gradient(to right, transparent 0, #000 17%, #000 100%), linear-gradient(to bottom, transparent 0, #000 9%, #000 91%, transparent 100%)";

export function PersonaScrollLanding(): React.ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const [navDark, setNavDark] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const sections = Array.from(el.querySelectorAll<HTMLElement>(".ls-section"));
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (e.isIntersecting && e.intersectionRatio > 0.5) {
          setNavDark((e.target as HTMLElement).dataset.dark === "true");
        }
      }),
      { threshold: [0.5] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const brandColor = navDark ? "#f2f4f5" : "#15241d";
  const linkColor = navDark ? "#9aa3ad" : "#5c6a61";

  return (
    <div ref={root} className="ls">
      <style>{CSS}</style>

      {/* NAV */}
      <nav className={`nav ${navDark ? "dark" : ""}`}>
        <div className="brand" style={{ color: brandColor }}>
          <img src={`${A}/assets/logo-coin.png`} alt="Money Tracker seal" style={{ width: 34, height: 34, borderRadius: 999, display: "block" }} />
          Money Tracker
        </div>
        <div className="navlinks">
          <a className="hideable" href="#genz" style={{ color: linkColor }}>Gen Z</a>
          <a className="hideable" href="#millennial" style={{ color: linkColor }}>Millennial</a>
          <a className="hideable" href="#senior" style={{ color: linkColor }}>Senior</a>
          <a href="#hero" style={{ color: "#157a5f", fontWeight: 600 }}>Open the app →</a>
        </div>
      </nav>

      {/* 1 · HERO */}
      <section id="hero" className="ls-section" style={{ background: "#f6f4ee" }}>
        <div className="wrap two">
          <Reveal>
            <p className="eyebrow" style={{ color: "#157a5f" }}>for anyone who spends money digitally</p>
            <h1 className="display" style={{ color: "#15241d", fontSize: "clamp(2.4rem,5vw,3.6rem)" }}>
              Your money is everywhere.<br /><span style={{ color: "#157a5f" }}>So you can&apos;t see any of it.</span>
            </h1>
            <p className="lead" style={{ color: "#5c6a61" }}>
              Four accounts. A dozen apps. UPI taps you forgot by lunch. Budgets that never survive the month. Money Tracker pulls it into one place and gives every rupee a job — with a ledger that simply can&apos;t go wrong.
            </p>
            <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 18 }}>
              <a href="#how" className="cta" style={{ background: "#157a5f", color: "#fff" }}>See how it works</a>
              <svg viewBox="0 0 200 40" width="150" height="30" aria-hidden><path d="M2 20 q12 -18 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0" fill="none" stroke="#c6ff3a" strokeWidth="3" strokeLinecap="round" /></svg>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <img src={`${A}/portraits/hero-cut.png`} alt="Scattered rupee notes, coins and app icons funnelling into one envelope"
              style={{ display: "block", width: "100%", height: "auto", WebkitMaskImage: HERO_MASK, WebkitMaskComposite: "source-in", maskImage: HERO_MASK, maskComposite: "intersect" }} />
          </Reveal>
        </div>
        <a href="#how" className="cue" style={{ color: "#157a5f" }}>
          <span>scroll</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#157a5f" strokeWidth="2"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </section>

      {/* 1.5 · HOW IT WORKS */}
      <section id="how" className="ls-section" style={{ background: "#f6f4ee" }}>
        <div className="wrap">
          <Reveal>
            <div style={{ textAlign: "center", maxWidth: 660, margin: "0 auto" }}>
              <p className="eyebrow" style={{ color: "#157a5f" }}>track · envelope · stay in control</p>
              <h2 className="display" style={{ color: "#15241d", fontSize: "clamp(2rem,4.5vw,3rem)" }}>Give every rupee a job.</h2>
              <p className="lead" style={{ color: "#5c6a61", margin: "18px auto 0" }}>
                Money Tracker pulls everything into one honest view, sorts it into envelopes, and keeps a ledger that simply can&apos;t go negative. Here&apos;s the whole idea in three moves.
              </p>
            </div>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px,1fr))", gap: "40px 36px", marginTop: 60 }}>
            <Reveal>
              <div style={{ textAlign: "center" }}>
                <div style={{ height: 80, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <svg viewBox="0 0 132 96" width="108" height="78" fill="none" stroke="#157a5f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="8" y="20" width="38" height="24" rx="5" /><rect x="8" y="54" width="38" height="24" rx="5" />
                    <path d="M50 32 q28 2 34 16" /><path d="M50 66 q28 -2 34 -16" />
                    <rect x="84" y="36" width="42" height="26" rx="5" />
                    <path d="M94 49 l6 6 12 -15" stroke="#c6ff3a" /><path d="M66 8 q4 6 -1 11" stroke="#c6ff3a" />
                  </svg>
                </div>
                <p style={{ margin: "14px 0 4px", fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#c4892a" }}>Step 01</p>
                <h3 className="display" style={{ color: "#15241d", fontSize: "1.4rem" }}>One honest view</h3>
                <p className="lead" style={{ color: "#5c6a61", margin: "8px auto 0", maxWidth: 300, fontSize: "1rem" }}>Every account, card and wallet you spend from, pulled into one honest view — automatically, no spreadsheets.</p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div style={{ textAlign: "center" }}>
                <div style={{ height: 80, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <svg viewBox="0 0 120 96" width="104" height="78" aria-hidden>
                    <rect x="6" y="22" width="108" height="64" rx="8" fill="none" stroke="#157a5f" strokeWidth="3" />
                    <rect x="10" y="51" width="100" height="33" rx="6" fill="#157a5f" opacity="0.16" />
                    <path d="M6 26 L60 60 L114 26" fill="none" stroke="#157a5f" strokeWidth="3" strokeLinecap="round" />
                    <circle cx="40" cy="10" r="5" fill="#c6ff3a" /><circle cx="62" cy="6" r="4" fill="#157a5f" opacity="0.45" /><circle cx="82" cy="11" r="5" fill="#c6ff3a" />
                  </svg>
                </div>
                <p style={{ margin: "14px 0 4px", fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#c4892a" }}>Step 02</p>
                <h3 className="display" style={{ color: "#15241d", fontSize: "1.4rem" }}>Envelope your money</h3>
                <p className="lead" style={{ color: "#5c6a61", margin: "8px auto 0", maxWidth: 300, fontSize: "1rem" }}>Give every rupee a job. You can only spend what&apos;s inside an envelope, so the budget actually holds all month.</p>
              </div>
            </Reveal>
            <Reveal delay={240}>
              <div style={{ textAlign: "center" }}>
                <div style={{ height: 80, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <svg viewBox="0 0 120 96" width="104" height="78" aria-hidden>
                    <rect x="6" y="22" width="108" height="64" rx="8" fill="none" stroke="#157a5f" strokeWidth="3" />
                    <rect x="10" y="26" width="100" height="58" rx="6" fill="#157a5f" opacity="0.16" />
                    <path d="M6 26 L60 60 L114 26" fill="none" stroke="#157a5f" strokeWidth="3" strokeLinecap="round" />
                    <circle cx="93" cy="29" r="15" fill="#c6ff3a" />
                    <path d="M86 29 l5 5 9 -10" fill="none" stroke="#15241d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p style={{ margin: "14px 0 4px", fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#c4892a" }}>Step 03</p>
                <h3 className="display" style={{ color: "#15241d", fontSize: "1.4rem" }}>It never goes negative</h3>
                <p className="lead" style={{ color: "#5c6a61", margin: "8px auto 0", maxWidth: 300, fontSize: "1rem" }}>Try to overspend and it&apos;s caught — rerouted to Unallocated, never breaking the math. The number is always real.</p>
              </div>
            </Reveal>
          </div>

          <Reveal>
            <div style={{ textAlign: "center", marginTop: 52 }}>
              <p style={{ margin: "0 auto", maxWidth: 560, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontSize: "1.2rem", lineHeight: 1.4, color: "#15241d" }}>
                Then read your spending through famous money-philosophy <span style={{ color: "#157a5f" }}>lenses</span> — your money, your way.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 2 · GEN Z */}
      <section id="genz" className="ls-section bleed" data-side="left" data-dark="true" style={veil("#0a0b0d", "40%", "36%")}>
        <Reveal className="bleed-media">
          <img src={`${A}/portraits/genz.png`} alt="Gen Z — paying by UPI on a neon city street at night" style={{ objectPosition: "50% 16%" }} />
          <div className="bleed-veil" />
        </Reveal>
        <div className="bleed-body">
          <Reveal className="inner" delay={120}>
            <p className="eyebrow" style={{ color: "#c6ff3a", textTransform: "lowercase", letterSpacing: "0.08em" }}>for Gen Z</p>
            <h2 className="display" style={{ color: "#f2f4f5", fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: "clamp(2rem,4.5vw,3rem)" }}>
              Money that moves <span style={{ color: "#c6ff3a" }}>as fast as you do.</span>
            </h2>
            <blockquote className="quote" style={{ color: "#f2f4f5", borderColor: "#c6ff3a", fontSize: "1.3rem" }}>&quot;Vibe-check your money before it ghosts you.&quot;</blockquote>
            <p className="lead" style={{ color: "#9aa3ad" }}>Every UPI tap, caught and sorted automatically. A one-glance vibe score on whether you&apos;re winning the month. Loud, fast, and a little chaotic — on purpose.</p>
          </Reveal>
        </div>
      </section>

      {/* 3 · MILLENNIAL */}
      <section id="millennial" className="ls-section bleed" data-side="right" style={veil("#f6f4ee", "52%", "40%")}>
        <div className="bleed-body">
          <Reveal className="inner">
            <p className="eyebrow" style={{ color: "#157a5f" }}>for Millennials</p>
            <h2 className="display" style={{ color: "#15241d", fontSize: "clamp(2rem,4.5vw,3rem)" }}>
              Build the life, <span style={{ color: "#c4892a" }}>not just the budget.</span>
            </h2>
            <blockquote className="quote" style={{ color: "#15241d", borderColor: "#c4892a", fontSize: "1.35rem" }}>&quot;Money that quietly works while you live.&quot;</blockquote>
            <p className="lead" style={{ color: "#5c6a61" }}>The Goa trip, the SIP, the someday-home — each an envelope that fills itself. Calm, premium, and honest about where you stand. No guilt, just direction.</p>
          </Reveal>
        </div>
        <Reveal className="bleed-media" delay={120}>
          <img src={`${A}/portraits/millennial.png`} alt="Millennial — a calm UPI payment confirmed at home" style={{ objectPosition: "50% 24%" }} />
          <div className="bleed-veil" />
        </Reveal>
      </section>

      {/* 4 · SENIOR */}
      <section id="senior" className="ls-section bleed" data-side="left" style={veil("#ffffff", "44%", "32%")}>
        <Reveal className="bleed-media">
          <img src={`${A}/portraits/senior.png`} alt="Senior — a clear UPI bill payment confirmed at home" style={{ objectPosition: "50% 22%" }} />
          <div className="bleed-veil" />
        </Reveal>
        <div className="bleed-body">
          <Reveal className="inner" delay={120}>
            <p className="eyebrow" style={{ color: "#13456b", textTransform: "none", letterSpacing: 0 }}>for Seniors</p>
            <h2 className="display" style={{ color: "#0a0d12", fontFamily: "'Josefin Sans',sans-serif", fontSize: "clamp(2rem,4.5vw,3rem)" }}>
              See everything. <span style={{ color: "#0a7d3c" }}>Trust the math.</span>
            </h2>
            <blockquote className="quote" style={{ color: "#0a0d12", borderColor: "#13456b", fontSize: "1.35rem" }}>&quot;Everything in its place — and it always adds up.&quot;</blockquote>
            <p className="lead" style={{ color: "#34465a", fontFamily: "'Josefin Sans',sans-serif", fontSize: "1.1rem", lineHeight: 1.7 }}>Large, calm, and uncluttered. Pension in, bills handled, the rest clearly set aside. A ledger that never goes negative and never surprises you. Dignity, not dashboards.</p>
          </Reveal>
        </div>
      </section>

      {/* 5 · CLOSE */}
      <section id="close" className="ls-section" data-dark="true" style={{ background: "#15241d" }}>
        <div className="wrap" style={{ textAlign: "center" }}>
          <Reveal>
            <img src={`${A}/assets/logo-coin.png`} alt="Money Tracker seal" style={{ width: 124, height: 124, borderRadius: 999, display: "block", margin: "0 auto 24px", boxShadow: "0 0 0 1px rgba(198,255,58,0.18), 0 16px 50px rgba(0,0,0,0.5)" }} />
            <p className="eyebrow" style={{ color: "#c6ff3a" }}>track · envelope · benefit</p>
            <h2 className="display" style={{ color: "#f6f4ee", fontSize: "clamp(2.2rem,5vw,3.4rem)", maxWidth: "46rem", margin: "0 auto" }}>
              Your money, finally <span style={{ color: "#c6ff3a" }}>in its place.</span>
            </h2>
            <p className="lead" style={{ color: "#a7b3aa", marginLeft: "auto", marginRight: "auto" }}>Whoever you are, the deal is the same: we track every rupee, envelope it toward what matters, and keep the math honest — so the benefit is yours.</p>
          </Reveal>
          <Reveal delay={200}>
            <div style={{ marginTop: 38 }}>
              <a href="#hero" className="cta" style={{ background: "#c6ff3a", color: "#15241d", boxShadow: "0 0 0 1px rgba(198,255,58,0.3), 0 14px 50px rgba(198,255,58,0.18)" }}>Start tracking your money →</a>
              <p style={{ margin: "26px auto 0", maxWidth: 480, fontSize: "0.9rem", lineHeight: 1.5, color: "#a7b3aa", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "left" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c6ff3a" strokeWidth="1.7" style={{ flex: "none" }}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" strokeLinecap="round" /></svg>
                <span>In India? Skip the uploads entirely — connect every bank instantly through the Account Aggregator.</span>
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <footer style={{ background: "#15241d", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#a7b3aa", textAlign: "center", padding: 28, fontSize: "0.85rem", fontFamily: "'Spectral',serif" }}>
        Money Tracker · a Ledgerline surface · © 2026
      </footer>
    </div>
  );
}

export default PersonaScrollLanding;

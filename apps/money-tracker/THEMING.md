# Theming — the design-direction contract

Every persona / age-band design direction is a full `ThemeTokens` object
(`src/theme/tokens.ts`). Components style themselves **only** through the
token-backed CSS custom properties (`--ml-*`) these map to — never hardcoded
colors, radii, or spacing — so a new direction restyles by swapping token
values, not by editing components.

- `millennial` — the fully-resolved **reference** direction (clean, calm,
  data-forward).
- `genz`, `senior` — first-draft **starters** so the toolbar switch is
  demonstrably live. **Riker refines these into real design directions.**

## The token contract (define all of these per direction)

| Token group | CSS vars | Notes |
|---|---|---|
| Color / surface | `--ml-color-bg`, `--ml-color-surface`, `--ml-color-surface-raised`, `--ml-color-border`, `--ml-color-text`, `--ml-color-text-muted`, `--ml-color-accent`, `--ml-color-accent-contrast` | base palette |
| Semantic color | `--ml-color-positive` (credit / under-budget), `--ml-color-negative` (debit / blocked overdraw), `--ml-color-warning` (Unallocated growing) | meaning, not decoration |
| Radius | `--ml-radius-sm/-md/-lg` | Gen-Z rounder, Senior calmer |
| Density | `--ml-density` (scalar) | components multiply base spacing by this — Senior roomier (`1.25`), Gen-Z tighter (`0.9`) |
| Typography | `--ml-font-sans`, `--ml-font-size-base`, `--ml-scale-ratio`, `--ml-line-height`, `--ml-font-weight-normal/-medium/-bold` | Senior larger base + line-height |
| Shadow | `--ml-shadow-sm/-md` | |
| Motion | `--ml-motion-fast/-base`, `--ml-motion-ease` | Gen-Z springy, Senior gentle |

In Tailwind these are exposed as utilities (`bg-bg`, `bg-surface`,
`text-text`, `text-text-muted`, `text-accent`, `bg-accent`, `text-positive`,
`text-negative`, `text-warning`, `rounded-md`, `shadow-md`, `font-sans`, …).
Use them; never hardcode.

## Layout / IA seams (where a direction changes structure, not just color)

Tokens can't express layout differences. These components expose explicit
slots so a direction can change structure without a rewrite:

1. **`UploadScreen` → `dropzone` slot** — playful (Gen-Z) vs plain/large
   (Senior) upload treatment.
2. **`EnvelopesScreen` → `envelopeRenderer(env)` slot** — swap card-grid ↔
   list ↔ progress-ring per envelope without touching the screen.
3. **`SummaryScreen` → `breakdownRenderer(rows)` slot** — bars vs donut vs
   list for spend-by-category.
4. **Density** — `--ml-density` drives padding/gaps globally; Senior runs
   roomier, Gen-Z tighter, without per-component edits.

## How to add / refine a direction

1. Edit the `genz` / `senior` token object in `src/theme/tokens.ts` (fill in
   real values for every key above).
2. If the direction needs structural change, pass the relevant slot(s) above
   in that direction's stories.
3. Add per-direction stories if a screen's IA genuinely differs; otherwise the
   toolbar theme switch covers it.
4. Flip the Theme toolbar in Storybook to review side-by-side.

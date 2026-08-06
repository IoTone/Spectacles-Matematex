# Layout conformance harness

Diffs the Matematex layout walker against **KaTeX rendered in a real browser**,
per glyph, in em units.

## Why this oracle

The bridge's contract is "reproduce KaTeX's layout". So the reference is KaTeX
itself — not MathJax, which would flag legitimate KaTeX typographic conventions
as differences.

Two properties make the comparison unusually sharp:

1. **Same KaTeX build on both sides.** `reference/katex.mjs` is a byte copy of
   `Matematex/Assets/ProjectScripts/katex_bundle.ts`, which is itself
   `dist/katex.mjs` from katex@0.16.22 unmodified. Zero version skew.
2. **Same DOM on both sides.** Both the walker and the browser traverse the
   `.katex-html` tree KaTeX produced. Glyph correspondence is therefore exact —
   no fuzzy matching, no SSIM, no tolerance for engine differences. **Every
   delta is our bug.**

The browser contributes the one thing SpaceDOM cannot: CSS inline layout. That
is precisely where the Phase 6.5 spacing defects live.

## What it does and doesn't cover

Covers: inter-glyph spacing, baselines, sub/superscript placement, fraction
row alignment, size-class scaling.

Does **not** cover: Lens Studio Text 3D font substitution, `textScaleMultiplier`
/ `layoutWidthMargin` rendering fudges, radicals going through SpaceSVG, or the
visual-proof layer. Those still need on-device eyes. This complements
`phase6-visual-qa.md`; it does not replace it.

## Running

```bash
cd test/layout-conformance
npm install                      # playwright only, scoped to this dir

# 1. the formula list both sides render
npx ts-node --transpile-only dump-formulas.ts > reference/formulas.json

# 2. our walker, under plain node
npx ts-node --transpile-only dump-ours.ts > ours.json

# 3. the browser reference (serve + drive)
node serve.js &                  # http://localhost:8777/
node capture-reference.mjs       # writes reference.json

# 4. the diff
npx ts-node --transpile-only compare.ts
```

`compare.ts` exits non-zero on any FAIL, so it works as a CI gate.
Add `--json` for machine-readable output.

Two helpers that need **neither a browser nor `reference.json`**, so they suit a
fast pre-commit gate:

```bash
# every text node KaTeX produces must survive the walk (catches content loss)
npx ts-node --transpile-only check-structure.ts

# print the KaTeX DOM the walker dispatches on — classes, inline styles, nesting
npx ts-node --transpile-only dump-dom.ts --ids=56
npx ts-node --transpile-only dump-dom.ts --latex='\frac{a}{b}'
```

Scope with `--ids=`: `--ids=all` for all 80, `--ids=3,4,10` for specific ones.
Add `--extras` for construct coverage that isn't in the shipping book (matrices,
`cases`, `aligned` — see `EXTRA_FORMULAS` in `formulas.ts`), so measuring a new
construct never means editing user-facing content.
Default is the prototype set (see `formulas.ts`): the eight formulas Phase 6.5
flagged, plus #1 and #12 as controls.

`reference.json` **is committed** as the golden capture, so steps 1–2 and 4 run
with no browser and no playwright install. Step 3 is only needed when upgrading
KaTeX or changing the formula corpus.

## How the walker runs outside Lens Studio

`MatematexBridge.ts` holds the pure-TS walker and the scene renderer in one
file. `ls-stubs.ts` supplies inert globals (`@component`/`@input` decorators,
`BaseScriptComponent`, `MeshBuilder`, `vec3`/`vec4`) so importing the module
doesn't fail at class-definition time. The walker itself touches none of them —
`global.scene` is stubbed to throw, so if a future refactor moves scene-touching
code into the walker half, this harness fails loudly.

## Measurement details

- `emToWorld` is set to 1.0, so the walker's output is already in em.
- Positions are compared **relative to each formula's first glyph**, which
  cancels any global origin offset between the two schemes while preserving
  every inter-glyph gap.
- Horizontal comparison uses **pen positions**, not ink-box centres. A glyph's
  ink is not centred inside its advance, and KaTeX's Size1–4 fonts (large
  operators, scaled delimiters) have side bearings big enough that centre-to-
  centre comparison invents errors — an early version of this harness reported
  ~0.6–1.5em of drift on every `\sum` formula that turned out to be measurement
  bias. The browser reports the pen position from the same zero-width probe used
  for baselines; our side derives it as `x - advance/2`, which is exactly the
  walker's `cursorX`.
- Vertical comparison uses baselines, not box centres. `Range.getBoundingClientRect`
  returns the font's line box rather than tight ink bounds, so raw centres carry
  a font-size-dependent offset that would masquerade as a vertical defect. The
  page inserts a zero-size `vertical-align: baseline` inline-block probe next to
  each text node — its top edge sits exactly on the baseline. Our side inverts
  `emitText`'s fixed 0.43em x-height assumption to recover the same baseline.
- Fonts are explicitly awaited (`document.fonts.load`) before any measurement.
  Without that, every width is the fallback font's and the whole run is garbage.
- `reference/fonts/` holds KaTeX's 20 **woff2** files (296KB) and `katex.css` is
  compiled woff2-only, so the harness is self-contained — it does not reach into
  `external/KaTeX-0.16.22/` at run time. Verified byte-identical to the
  woff/ttf-inclusive build: zero glyph positions changed. Regenerate the CSS with:

  ```bash
  printf '$font-folder: "fonts";\n$use-woff: false;\n$use-ttf: false;\n@import "katex";\n' > /tmp/w.scss
  npx sass@1.69.5 --no-source-map \
    --load-path=external/KaTeX-0.16.22/src/styles /tmp/w.scss \
    test/layout-conformance/reference/katex.css
  ```

**Accuracy check:** upright glyph runs (e.g. the `sin` in `\sin A`) agree to
0.001em, and `maxDy` is ≤0.001em on every formula. The harness resolves well
below the smallest quantity of interest (a thin space is 0.167em).

## Findings — full run, all 80 formulas

### Current state (2026-08-04, after the fix pass)

**Book (80 formulas):**

| | PASS | WARN | FAIL | conformant |
|---|---:|---:|---:|---:|
| Before | 1 | 1 | 78 | **2%** |
| After | 60 | 3 | 17 | **79%** |

**Extras (8 matrix/environment cases, `EXTRA_FORMULAS`):** 2 PASS / 6 FAIL —
`matrix` 3×3 and `vmatrix` pass at 0.001em; the rest fail only on the enclosing
delimiter's advance, with correct cell layout inside.

Worst vertical error 0.002em. Zero structural mismatches.

> An earlier revision of this file reported 82%. That was measured against a
> reference in which KaTeX_Size2–4 had not loaded (see below). 79% is the number
> against a correct reference.

### What was fixed

| Fix | Effect |
|---|---|
| Nested-fraction content loss (`findRowFracLine`) | #56 emitted 3/9 glyphs, now 9/9 |
| Italic correction double-counted — `emitText` synthesised it on top of KaTeX's own inline `margin-right` | removed; `_italicMinGapEm` 0.12 → 0 |
| vlist row `margin-left` ignored — this is how KaTeX cancels italic correction for **subscripts** (superscripts keep it, per TeX) | #39 was the corpus's worst error at 1.850em |
| `SIZE_FACTORS` size2–size5 shifted one slot (scriptstyle rendered at 0.8, KaTeX uses 0.7) | verified against `KaTeX/src/Options.js` |
| Script `margin-right` (scriptspace, 0.05em) not advancing the parent | see the cancellation note below |
| `tightSpacings` never implemented — TeX drops bin/rel spacing in script styles | we injected 0.222em around every `-` inside `F_{n-1}` |
| `nulldelimiter` treated as skippable, but it is 0.12em wide (`$nulldelimiterspace`) | every fraction was 0.24em too narrow |
| `layoutWidthMargin` 1.18 → 1.0 | the 1.18 existed only to mask the missing nulldelimiters; `.frac-line` is `width: 100%` |
| `arraycolsep` (matrix column gutter) skipped — empty span with an inline `width:0.5em`, two per gutter | every matrix was 1em per column gap too narrow; `matrix` 3×3 went 2.001 → 0.001em |
| Harness: only 4 of 20 `@font-face`s were being loaded before measuring | KaTeX_Size2–4 fell back to a system serif, poisoning every `\int`/`\sum`/`\left(` |

**Two bugs were hiding each other.** At the old (too large) script scale, script
content overshot by almost exactly the 0.05em scriptspace that wasn't being
applied. Fixing either one alone made the corpus *worse*; only both together
helped. Worth remembering before "fixing" a number that looks right.

### The font-loading bug — and the wrong conclusion it caused

The page originally called `document.fonts.load` on a hand-listed four families
(Main, Math, Size1, AMS). **KaTeX_Size2–4 were never requested**, so every large
operator and scaled delimiter measured against a fallback serif. The tell was a
size3 `(` reporting a 0.334em advance — *narrower* than plain KaTeX_Main's
0.389em, which is impossible for a larger variant.

That broken reference caused a wrong verdict, recorded here because the wrong
verdict was itself documented as fact for a while: adding the KaTeX_Size1–4
metric tables appeared to make 13 of 14 failures worse, so it was reverted. Once
every `@font-face` is loaded, the browser reports **0.736em**, matching
`Size3-Regular`'s 0.73611em exactly. The metrics were right all along.

The page now loads every face the stylesheet declares and warns on any that fail.

**Lesson:** when a fix makes a measurement worse, suspect the measurement too —
not just the fix.

### Remaining failures

All involve a KaTeX_Size1–4 glyph. Size metrics are now applied for
`delimsizing`/`delim-size` (pmatrix 0.348 → 0.174em, bmatrix 0.252 → 0.126em) but
**deliberately not** for `.op-symbol.small-op`/`.large-op`: measured, that makes
`\sum` formulas worse (#68 0.360 → 0.471em), because in display mode a large
operator sits in an `op-limits` vlist where its glyph width drives limit-centring
rather than the cursor. The mapping is written and commented out in
`sizeFamilyFor` — turn it on after fixing the centring interaction.

### Failure rate by construct

Plain formulas are an order of magnitude better than any structured construct,
consistent with the core text path being sound and errors living in the
structural handlers.

### On the QA sheet's controls

#1 and #12 were left unmarked in `phase6-visual-qa.md` but both failed the
original run. The defect was systemic; it was simply less noticeable on short
formulas. Both now PASS.

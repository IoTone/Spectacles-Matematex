# Matematex Bridge — Porting Review

A snapshot of `MatematexBridge.ts`'s current coverage of KaTeX HTML output, what's partial, what's missing, and a prioritized improvement list. Companion to `matematex-design-spec.md`.

Last updated: 2026-08-04 (layout-conformance fix pass + matrix support).
> Corpus went from 2% to **79%** conformant against KaTeX-in-browser. Note: an
> earlier revision of this file claimed 82% — that was measured against a
> reference whose KaTeX_Size2–4 fonts had not loaded. 79% is the honest number.

> **Scope note.** This document covers the *KaTeX bridge* only. The visual-proof
> layer (`MatematexProof.ts`) is a separate renderer with its own findings —
> see "Key findings" in `matematex-design-spec.md` §7.

---

## 1. Currently supported

Each entry cites `MatematexBridge.ts` line numbers as anchors.

### Core text rendering (lines 216–369)
- Single chars and Unicode glyphs via `emitText()` using KaTeX's per-glyph font metrics (`getTextWidthEm`).
- Per-character positioning at world-units; baseline derived from a fixed x-height (0.43em) — not per-char height — to keep glyphs like `i` and `l` aligned with their neighbors.
- Italic state tracked via `mathnormal` / `mathit` classes. Italic correction is NOT synthesised per glyph — it arrives as KaTeX's own inline `margin-right`, and vlist rows carry the negative `margin-left` that cancels it for subscripts.

### Vertical lists — fractions, sub/superscripts, sqrt content (lines 466–614)
- `vlist-t` walked uniformly: each child's `top:` em offset translates to a `baselineY` shift; cursor resets to vlist start per child.
- Fraction bar detection via `findRowFracLine` — a bounded search that will not descend into a nested `vlist-t`, so a row containing another fraction is not mistaken for the bar. Emitted as a `MeshBuilder` quad spanning the numerator/denominator extent (`layoutWidthMargin` default 1.0, matching `.frac-line { width: 100% }`).
- Numerator/denominator centered within the wider child's bounds.
- Nested vlists (sub-of-sub, frac-of-sqrt, etc.) supported via recursion.

### Square roots (lines 238–244, 372–462)
- SVG element walking is *deferred*: setting `_pendingSVG` and returning early during `walk()`; processed at the end of the enclosing `walkVlistGroup` so we know the actual content width before sizing the radical.
- viewBox clipped to scaled content width; KaTeX's overbar-end coordinate (`H40000` for sqrtMain, `H400000` for Size variants — see Phase 6.1 fix) replaced with the clipped width via `\d{5,}` regex.
- Original viewBox height preserved so aspect ratio remains correct across `sqrtMain` / `sqrtMain2/3/4` variants.
- Content width measured from emitted text items' ink extents (center ± half-glyph), bypassing italic-gap accumulation in `cursorX`.

### Named operators (`.mop`, lines 287–298)
- Forces `ctx.italic = false` for the duration of the walk so multi-letter operators (`sin`, `cos`, `log`, `lim`) render upright.
- Restores prior italic state and applies any `marginRight`.

### Spacing primitives
- Inline `marginLeft` / `marginRight` / `paddingLeft` parsed from KaTeX's inline `style` attribute and applied to the cursor — on elements AND on vlist rows.
- `mspace` standalone spacing element.
- Inter-atom spacing matrix (`ATOM_SPACING_EM`) plus the script-style `TIGHT_ATOM_SPACING_EM` variant, both verbatim from `KaTeX/src/spacingData.js`.
- `nulldelimiter` advances 0.12em (`$nulldelimiterspace`) rather than being skipped.

### Sizing and font-size variants (lines 110–122, 266–276)
- KaTeX's 11 size classes (`size1` … `size11`) mapped to multipliers, verbatim from `KaTeX/src/Options.js` `sizeMultipliers` (0.5 … 2.488).
- `sizing` class scopes a scale multiplier across descendants and restores on exit.

### Renderer (`MatematexSceneRenderer`, lines 683–949)
- TextLayoutItem → cloned `Component.Text 3D` from a template (per memory: `copyComponent` of an editor-created template is the only reliable path).
- LineLayoutItem → `RenderMeshVisual` quad with the user-supplied unlit material.
- SVGLayoutItem → SpaceSVG mesh backend with per-color stroke/fill grouping.
- Optional `italicFont` swap per-item; `italicScaleAdjust` knob for italic width compensation.

### Validation (`MatematexValidator.ts`)
- 33 test cases across Tier 1 (validated structures), Tier 2 (should work), Tier 3 (degraded but non-crashing), and edge cases. All passing.
- Asserts parse success + `expectedMinItems` count. No visual-correctness assertions.

---

## 2. Partially supported / known issues

### ~~Mbin / mrel / mopen / mclose spacing~~ ✅ RESOLVED (was P0, systemic)
Phase 6.5 flagged the first 8 Geometry formulas as ⚠️ "spacing around fractions /
between letters and symbols." Root causes are now identified and fixed — they were
not one systemic margin bug but four separate ones (italic double-counting,
missing script-style `tightSpacings`, wrong size multipliers, missing
nulldelimiter/scriptspace widths). All 8 of those formulas now PASS the
conformance harness.

### ~~Italic handling~~ ✅ FIXED (was P0)
Two independent bugs, both now gone:
1. **`emitText` synthesised italic correction** on top of the `margin-right` KaTeX
   already puts on the glyph's own span — double-counting it. Removed;
   `_italicMinGapEm` dropped from 0.12 to 0 and is now documented as a pure
   rendering compensator with no layout justification.
2. **vlist row `margin-left` was ignored.** That margin is how KaTeX implements
   TeX's rule that italic correction shifts *superscripts* but not *subscripts*
   (`F_n` → `margin-left:-0.1389em` against F's `margin-right:0.1389em`). Rows are
   walked via `walkChildren`, which bypasses `walk()`'s margin handling, so every
   subscript sat one italic correction too far right — 1.850em accumulated on #39,
   the corpus's worst error at the time.

`_italicScaleAdjust` / `textScaleMultiplier` remain single global knobs that don't
adapt to the actual font. Unchanged, and still the right place to fix glyph
collision if it appears on device.

### ~~Script-style spacing~~ ✅ FIXED (NEW)
TeX drops the medium (bin) and thick (rel) spaces in script and scriptscript
styles; KaTeX implements this as `tightSpacings`, selected by the right-hand
atom's `mtight` class. We had no such table, so the walker injected a full
0.222em around every `-` inside a subscript like `F_{n-1}` where KaTeX emits no
glue at all. Table added verbatim from `KaTeX/src/spacingData.js`.

### ~~Size-class multipliers~~ ✅ FIXED (NEW)
`SIZE_FACTORS` had size2–size5 shifted one slot up, so scriptstyle rendered at
0.8 where KaTeX uses 0.7. Corrected against `KaTeX/src/Options.js`
`sizeMultipliers`.

**Caution, recorded because it cost a cycle:** this bug and the missing
scriptspace (below) were cancelling each other almost exactly. Fixing either
alone made the corpus measurably *worse*. Re-measure the whole corpus after each
change rather than trusting a single formula.

### ~~Scriptspace / nulldelimiter widths~~ ✅ FIXED (NEW)
- A sub/superscript row's trailing `margin-right` (0.05em scriptspace) was not
  advancing the parent.
- `nulldelimiter` was in the skip list, but katex.scss gives it
  `$nulldelimiterspace` = `1.2em/10` = 0.12em. Every fraction was 0.24em too
  narrow, which `layoutWidthMargin: 1.18` had been masking. That knob is now 1.0,
  matching `.frac-line { width: 100% }`.

### Fraction row centring — resolved as a symptom
The 0.09–0.19em asymmetry between numerator and denominator was the nulldelimiter
and margin bugs above, not a centring bug. No separate fix needed.

### Large operators and scaled delimiters (P1, partially fixed)
**Correction to a previous entry in this document.** An earlier pass concluded
that using KaTeX_Size1–4 metrics "made things strictly worse" and reverted it.
That conclusion was wrong: the conformance page was only explicitly loading four
font families, so KaTeX_Size2–4 measured against a fallback serif. The reference
itself was broken. A size3 `(` was being reported at a 0.334em advance — narrower
than plain KaTeX_Main's 0.389em, which is impossible for a larger variant.

With every `@font-face` loaded, the browser reports 0.736em, matching
`Size3-Regular`'s 0.73611em exactly. The metrics were right all along.

**Now applied** for `delimsizing.size1..4` / `delim-size1` / `delim-size4`:
pmatrix's delimiter error halved (0.348 → 0.174em), bmatrix 0.252 → 0.126em.

**Deliberately NOT applied** to `.op-symbol.small-op` / `.large-op`, even though
katex.scss maps them to Size1/Size2. Measured: it makes `\sum` formulas worse
(#68 0.360 → 0.471em). In display mode a large operator sits inside an
`op-limits` vlist, so its glyph width feeds our limit-*centring* rather than the
cursor directly, and a wider (correct) glyph shifts the centring the wrong way.
Fix the centring interaction first, then the metric can be turned on — the
mapping is already written and commented out in `sizeFamilyFor`.

### ~~`textColor` silently ignored on Text3D~~ ✅ FIXED (NEW)
`createText` tinted glyphs with `comp.textFill.color = color` inside a try/catch.
`Component.Text` (2D) has a `textFill`; **`Component.Text3D` does not** — its
colour lives on the *material*. The assignment threw, the catch swallowed it,
and every glyph kept the template material's colour. `@input textColor` had
never had any effect.

The tell was that sqrt radicals came out white while all the surrounding text
was green: radicals render as a `RenderMeshVisual` and take the
`mainPassOverrides` path, which does work.

Fixed with `applyTextColor()` — tries `textFill` first (2D Text), then falls
back to cloning the material once per distinct colour, cached on the source
material so the shared template isn't repainted. Applied in `createText`, the
book's splash/label lines, and `MatematexProof`'s labels, which had the same
copy-pasted trap and where it mattered most (proof labels are deliberately
multi-coloured).

### ~~Upright glyphs drawn in the wrong font~~ ✅ FIXED (NEW, root cause)
The template Text3D had **no font assigned**, so every non-italic glyph — digits,
operators, parens, delimiters — was drawn in Lens Studio's default face while
being spaced with KaTeX_Main metrics. Only italics ever got a KaTeX font.
`KaTeX_Main-Regular.ttf` was already in the project, just never wired.

This was the real cause of the collisions reported in visual QA (`2ab` running
together, `|x|` fouling its bars, superscripts touching their base) — not the
italic padding, which cannot explain a collision between an upright `2` and its
neighbour. Fixed with a `mainFont` input threaded through the renderer.

Two fudge factors existed only to mask it and are now unnecessary:
`layoutWidthMargin` 1.18 (removed earlier) and a brief `emToWorld` 5 → 5.9
(reverted). If glyph collisions ever return, check the font assignment before
reaching for either.

## 3. Not supported

### ~~Matrices and array environments~~ ✅ SUPPORTED (was "L / ≥1 week")
The estimate was wrong — KaTeX renders an array as **columns side by side, each a
vlist of stacked cells**, which is the exact primitive `walkVlistGroup` already
implemented for fractions and scripts. No 2D layout engine was needed.

The only missing piece was `.arraycolsep`, the column gutter: an empty span with
an inline `width: 0.5em` (KaTeX emits two per gutter) and no CSS width, so it was
being skipped. Every matrix came out exactly 1em per column gap too narrow.

Verified with 8 new conformance cases (`EXTRA_FORMULAS` in the harness):
`matrix` 3×3 and `vmatrix` 2×2 now PASS at **maxDx 0.001em**, and vertical
stacking was already exact (maxDy 0.000em). `pmatrix`/`bmatrix`/`cases` still
fail, but only by the enclosing delimiter's advance — the cell layout inside them
is correct. #66 has been restored from its matrix-free workaround to the real
`\det\begin{pmatrix}…\end{pmatrix}` form.

Still unsupported: column alignment specifiers beyond centring (`col-align-l/r`
are parsed as ordinary columns), and `\hline`.

### Accent marks (`\hat`, `\bar`, `\vec`, `\widetilde`, `\overline`, `\underline`)
- **Affected:** ~11 formulas that use `\mathbf{v}` (vector bold) — would also benefit from `\vec{v}` rendering.
- **Effort:** medium. Each accent maps to an SVG glyph; needs baseline-relative positioning over the accented base.

### Auto-scaling delimiters (`\left(`, `\right)`, `\Big`, `\bigg`)
- **Affected:** ~5 formulas with explicit `\left/\right`.
- **Today:** renders as fixed-size delimiter glyphs.
- **Effort:** medium. KaTeX provides `delimsizing` classes; would need glyph variant lookup.

### Bold / blackboard-bold / calligraphic font variants (`\mathbf`, `\mathbb`, `\mathcal`, `\mathfrak`)
- **Affected:** 11 `\mathbf` entries in MathBookData.
- **Today:** renders with the regular template font; no font swap.
- **Effort:** medium. Add additional `@input` font slots and a renderer dispatch on context.

### Text mode (`\text{...}`)
- Currently treated as math italic; should toggle to upright sans-serif text font.

### Color (`\color`, `\textcolor`)
- Renderer uses a single `textColor`; no per-glyph color override.

### Display vs. inline mode awareness
- KaTeX emits `displaystyle` and `textstyle` classes; the walker doesn't distinguish them. This affects big-operator limits placement, fraction sizing, and delimiter scaling.

---

## 4. Prioritized improvement list

| Priority | Feature | Status |
|---|---|---|
| **P0** | mbin/mrel/mopen/mclose spacing | ✅ Resolved — was four separate bugs, all fixed. 8/8 flagged formulas now PASS. |
| **P0** | Nested-fraction content loss + validator structural guard | ✅ Fixed (`findRowFracLine`, `countRenderableTextNodes`). |
| **P0** | Italic correction double-count; subscript vs superscript rule | ✅ Fixed. Was the corpus's largest error (1.850em). |
| **P0** | Script-style `tightSpacings`; size multipliers; scriptspace; nulldelimiter width | ✅ Fixed, all verified against KaTeX source. |
| **P0** | Layout conformance harness (all 80, per-glyph, em) | ✅ Built — `test/layout-conformance/`, golden committed, CI-ready. |
| **P1** | Scaled delimiters (KaTeX_Size1–4 advances) | ✅ Applied for `delimsizing` — pmatrix error halved. Earlier "reverted, made things worse" verdict was a harness font-loading bug, now fixed. |
| **P1** | Large operators (`\sum`/`\int`) inside `op-limits` vlists | ⏳ Open — Size metrics are correct but interact badly with limit-centring; mapping written and commented out in `sizeFamilyFor`. |
| **P0** | Matrices / array environments (`mtable`) | ✅ Supported — `arraycolsep` gutter was the only gap; #66 restored to real `pmatrix`. |
| **P1** | Big-op display-mode limits | ✅ `displayMode` input; `op-limits` vlist handled. |
| **P1** | Bold font support (`\mathbf`) | ✅ `WalkContext.bold`, `boldFont` input. |
| **P1** | Accent marks (`\vec`, `\hat`, `\bar`) | ✅ Walker reads `left:` for accent-body centring. |
| **P2** | Italic font auto-calibration | Open. `_italicMinGapEm` is now 0; if glyphs collide on device, calibrate `italicScaleAdjust` rather than re-padding. |
| **P2** | Visual QA traversal (Phase 6.5) | ⏳ Human pass still needed — the harness covers geometry only. |
| **P3** | Text mode (`\text{...}`), colour | Deferred. |

**Effort key:** S = ≤1 day; M = 2–4 days; L = ≥1 week.

---

## 5. Cross-cutting risks

1. **Margin source ambiguity (P0 prerequisite).** Don't know without empirical inspection whether KaTeX's mbin/mrel margins arrive on `style` attributes (which the walker reads) or only via stylesheet (which SpaceDOM ignores). One DOM dump answers it.

2. **Sqrt regex fragility.** `\d{5,}` works for current KaTeX versions. A future version emitting decimal coordinates (`H40000.5`) or scientific notation would silently break overbar clipping. Consider parsing the path programmatically for long-term robustness.

3. **Scene object scaling.** Each glyph is its own `Component.Text 3D` clone. A 60-char expression already creates ~60 SceneObjects; matrix support would multiply. No batching today. Add a scene-object cap and consider glyph batching once formulas grow.

4. **Validator coverage gap — partly closed.** `MatematexValidator` only checks parse
   success and item count, so it misses every spacing defect Phase 6.5 found. The
   **layout conformance harness** (`test/layout-conformance/`) now closes the geometry
   half: it diffs the walker against KaTeX rendered in a real browser, per glyph, in em,
   and exits non-zero on regression. It does *not* cover font substitution, SpaceSVG
   radicals, or the proof layer — those still need on-device eyes.

5. **Phase 7 (TikZ 3D extensions) overlap.** TikZ rendering needs 2D layout primitives (rows, columns, alignment) that overlap heavily with `mtable`. Worth scoping them together rather than building two layout engines.

---

## 6. Recommended sequencing

1. **Finish Phase 6.5 visual QA** (user in progress — `phase6-visual-qa.md`).
2. **P0.1 — DOM-dump investigation.** One session: instrument a failing-case render, log all `margin*` / `padding*` attributes, identify what's missing.
3. **P0.2 — Implement class-driven spacing rules.** Should land most ⚠️ → ✅ for Geometry rows 3–10 and propagate to other chapters.
4. **P1 batch (in priority order):** big-op limits, `\mathbf`, accents. Each is M-effort and independent.
5. **Defer matrix rendering** until P1 lands and we know more about Phase 7's 2D layout needs.
6. **UIKit migration (Phase 6.7)** runs in parallel — independent of bridge improvements.

---

## 7. Reference: file landmarks

| Concern | File:line |
|---|---|
| Top-level `walk()` dispatcher | `MatematexBridge.ts:216` |
| `emitText` — per-glyph emission | `MatematexBridge.ts:332` |
| `walkVlistGroup` — fractions / sub-sup / sqrt content | `MatematexBridge.ts:466` |
| Pending-SVG ink-extent measurement | `MatematexBridge.ts:545–569` |
| `emitSVGWithContentWidth` — sqrt clipping | `MatematexBridge.ts:372–462` |
| Sqrt overbar clip regex (Phase 6.1 fix) | `MatematexBridge.ts:445–447` |
| `MatematexSceneRenderer.render` — items → SceneObjects | `MatematexBridge.ts:617` |
| KaTeX font metrics table | `KaTeXFontMetrics.ts` |
| Validator | `MatematexValidator.ts` |
| 80 formulas with keywords | `MathBookData.ts` |
| Search index | `MathSearchIndex.ts` |


## Glyph scale vs the em grid — why the conformance harness could not see it

The layout advances the pen by `emToWorld` world units per em. A glyph must
DRAW at that same scale or it cannot fit the slot the pen leaves it. Nothing
tied those two numbers together, and the error was large:

| | drawn per em | vs emToWorld = 5.0 |
|---|---|---|
| upright (KaTeX_Main-Regular) | 6.327 w | 1.265x too big |
| italic (KaTeX_Math-Italic)   | 7.968 w | 1.594x too big |

Measured on device by comparing each glyph's rendered bounding box against its
true ink box read out of the TTF `glyf` table. The factor came out identical to
three decimals for every glyph of a font, which is what makes it a scale error
rather than a per-glyph layout bug.

At that scale the upright `2`'s INK (1.767 w) was already wider than its entire
advance (1.750 w) — no side bearing at all — and the italic `a`'s ink was 1.43x
its whole advance. Hence `2ab`, `b^2`, `|a|`, and denominators fouling the
fraction bar: every reported collision, one cause.

**The extra italic factor is not a fudge.** Lens Studio fits a font's `hhea`
ascent−descent span to the requested `size`. Those spans differ:

    KaTeX_Main-Regular   903 .. -272  =  1.1750 em
    KaTeX_Math-Italic    717 .. -218  =  0.9350 em   ratio 1.2567

which matches the measured 1.594 / 1.265 = 1.260. Because the cause is font
scaling, the correction is **uniform on both axes** — which is why superscripts
collided vertically too, and why an x-only correction would have been wrong.

Fix: `textScaleMultiplier` 5.0 → 3.951 (= 5 / 1.2654) and `italicScaleAdjust`
1.0 → 0.7957 (= 935 / 1175, straight out of the font headers). Re-measured
after: drawn-em is 5.00 for both fonts, every glyph's ink now sits inside its
advance.

### Why this was invisible for so long

The conformance harness compares **pen positions in em**. `emToWorld` cancels
out of that comparison entirely, so a formula could score PASS at 0.005 em —
as `|a+b| \le |a| + |b|` (#34) and the Law of Cosines (#2) both did — while
rendering with glyphs overlapping on the device. Layout fidelity and render
fidelity are separate properties and the harness only ever measured the first.

**Corrections to earlier conclusions in this document.** Two knobs were tuned to
compensate for this without knowing the cause, and both were wrong:

- `emToWorld` was raised 5 → 5.9, then reverted to 5.0 when the missing
  `mainFont` was found. The `mainFont` bug was real, but reverting removed a
  compensation that was doing something — the scale error was still there.
  Neither value was right, because `emToWorld` is not the knob: it sets how wide
  a formula is, and changing it to fix spacing just moves the overflow problem.
- `layoutWidthMargin` was set to 1.18 in the scene to stretch fraction bars out
  to glyphs that were 1.265x oversize. With the scale correct it returns to 1.0.

The general lesson is the one already recorded for the font-loading bug: a
measurement that cannot see a whole class of defect will report clean while that
defect is present. Before trusting a green harness, check what it measures.

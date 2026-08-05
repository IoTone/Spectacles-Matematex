# Matematex Bridge — Porting Review

A snapshot of `MatematexBridge.ts`'s current coverage of KaTeX HTML output, what's partial, what's missing, and a prioritized improvement list. Companion to `matematex-design-spec.md`.

Last updated: 2026-08-04 (after the layout-conformance fix pass: corpus went from 2% to 82% conformant against KaTeX-in-browser).

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

### Large operators and scaled delimiters (P1, open)
The 14 remaining conformance failures (all ≤0.330em) involve KaTeX_Size1–4
glyphs: `\int`, `\sum`, `\left(`, `\lVert`, `\binom`.

**Do not re-try the obvious fix.** Adding the Size1–4 metrics tables and
selecting them by class (`.large-op` → Size2, `.delimsizing.sizeN` → SizeN, per
katex.scss) was implemented and measured: it made 13 of the 14 strictly worse
(#38 0.110 → 0.631em) and was reverted. KaTeX evidently does not advance by the
Size-font metric width in these positions. The real mechanism is unidentified;
start by dumping a `\left(` subtree with `dump-dom.ts` and finding where the
advance actually comes from.

## 3. Not supported

### Matrices and array environments (`mtable`, `pmatrix`, `bmatrix`, `vmatrix`)
- **Affected:** 1 entry (#66 — uses entry-form workaround in v2). Linear Algebra chapter has 5+ entries that *would* benefit from real matrix layout.
- **Effort:** large. Needs a 2D row/column layout engine, delimiter scaling, and cell alignment.

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
| **P1** | Large operators / scaled delimiters (KaTeX_Size1–4 advances) | ⏳ Open — 14 failures, all ≤0.330em. Size-metrics fix TRIED AND REVERTED (made 13 worse); mechanism unidentified. |
| **P1** | Big-op display-mode limits | ✅ `displayMode` input; `op-limits` vlist handled. |
| **P1** | Bold font support (`\mathbf`) | ✅ `WalkContext.bold`, `boldFont` input. |
| **P1** | Accent marks (`\vec`, `\hat`, `\bar`) | ✅ Walker reads `left:` for accent-body centring. |
| **P1** | Matrix rendering (`mtable`, `pmatrix`) | Deferred — 2D layout, likely scoped with Phase 7 (TikZ). |
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

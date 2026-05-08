# Matematex Bridge — Porting Review

A snapshot of `MatematexBridge.ts`'s current coverage of KaTeX HTML output, what's partial, what's missing, and a prioritized improvement list. Companion to `matematex-design-spec.md`.

Last updated: 2026-04-30 (after Phase 6.1 sqrt overbar fix and Phase 6.2 v2 plan landing).

---

## 1. Currently supported

Each entry cites `MatematexBridge.ts` line numbers as anchors.

### Core text rendering (lines 216–369)
- Single chars and Unicode glyphs via `emitText()` using KaTeX's per-glyph font metrics (`getTextWidthEm`).
- Per-character positioning at world-units; baseline derived from a fixed x-height (0.43em) — not per-char height — to keep glyphs like `i` and `l` aligned with their neighbors.
- Italic state tracked via `mathnormal` / `mathit` classes; per-glyph italic correction applied between consecutive italic characters with a 0.12em minimum gap.

### Vertical lists — fractions, sub/superscripts, sqrt content (lines 466–614)
- `vlist-t` walked uniformly: each child's `top:` em offset translates to a `baselineY` shift; cursor resets to vlist start per child.
- Fraction bar detection via `frac-line` descendant; emitted as a `MeshBuilder` quad. Width post-adjusted to span actual numerator/denominator extent + `layoutWidthMargin` (default 1.18×).
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
- Inline `marginLeft` / `marginRight` / `paddingLeft` parsed from KaTeX's inline `style` attribute and applied to cursor (lines 249–256, 313–315).
- `mspace` standalone spacing element (lines 260–262).

### Sizing and font-size variants (lines 110–122, 266–276)
- KaTeX's 11 size classes (`size1` … `size11`) mapped to multipliers (0.5× … 2.488×).
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

### Mbin / mrel / mopen / mclose / minner / mpunct margins (P0, systemic)
- **Symptom:** Phase 6.5 visual QA shows the first 8 Geometry formulas (rows 3–10) all marked ⚠️ "spacing around fractions / between letters and symbols."
- **Cause:** the walker applies any *inline* `marginLeft` / `marginRight` KaTeX puts on these atoms (line 249–315) but does not apply KaTeX's *class-driven* spacing rules (e.g. thin space around `mbin` in script mode; wider in display). KaTeX usually emits inline margins for these, but some contexts rely on CSS rules SpaceDOM doesn't compute.
- **Likely scope:** affects ~20+ formulas to varying degrees; most visible around fractions and operators (`+`, `-`, `=`).
- **Investigation needed:** dump a failing-case DOM (e.g. `\frac{a+b}{c}`) and inspect what margins KaTeX actually attaches inline vs. via stylesheet.

### Italic font width mismatch (medium)
- **Symptom:** rendered italic glyphs are visibly narrower than KaTeX font metrics predict, leaving gaps between consecutive italic chars.
- **Mitigation today:** `_italicScaleAdjust` (default 1.0) and `textScaleMultiplier` (default 5.0) act as global compensators.
- **Limitation:** single-knob tuning — doesn't auto-adapt to the actual Lens Studio Text 3D italic font.

### Sqrt content-width calibration (medium, mostly resolved)
- **Symptom (pre-Phase 6.1):** overbar extending dramatically past content for complex expressions.
- **Status:** root cause was the regex/path-clip mismatch (sqrtMain used `H40000`, regex only matched `H400000`). Now fixed — `_sqrtWidthScale` default returned to 1.0.
- **Residual:** ink-extent measurement (lines 545–569) skips italic gaps, but for expressions ending in non-italic chars (digits, `^2`) the savings are zero — measurement still tracks `maxX`. Low-priority follow-up.

### Big-operator limits (`\sum_{i=1}^n`, `\int_0^1`) — partial
- **Today:** rendered as super/subscript regardless of display vs. inline mode.
- **Correct behavior:** display-mode limits sit *above/below* the operator, not as super/subscript.
- **Affected formulas:** ~13 (Σ, ∏, ∫ in MathBookData).

### Implicit-passthrough atom classes
- `mbin`, `mrel`, `mopen`, `mclose`, `minner`, `mpunct` have **no explicit handler**; they pass through `walkChildren` and emit text from descendants. Class-specific semantics (size variants, accent positioning, scaling delimiters) are not interpreted.

---

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

| Priority | Feature                                              | Affected formulas | Effort | Risk | Status |
|----------|------------------------------------------------------|-------------------|--------|------|--------|
| **P0**   | mbin/mrel/mopen/mclose spacing fix                   | ~20+ (8 confirmed)| M      | M    | ✅ Defensive class-driven inter-atom spacing matrix in `walkChildren`; injects KaTeX-spec gap minus what KaTeX already emitted via mspace/marginRight. |
| **P0**   | Visual QA defect catalog (Phase 6.5)                 | All 80            | S      | L    | ⏳ User in progress (`phase6-visual-qa.md`). |
| **P1**   | Big-op display-mode limits (Σ, ∏, ∫ above/below)     | ~13               | M      | L    | ✅ Added `displayMode: true` @input on BookOfMath. KaTeX now emits `op-limits` vlist; existing `walkVlistGroup` handles vertical stacking. |
| **P1**   | Bold font support (`\mathbf`)                        | 11                | M      | L    | ✅ `WalkContext.bold` flag, `mathbf`/`boldsymbol` detection, `@input boldFont` on BookOfMath + Bridge, renderer picks bold over italic when both fonts assigned. |
| **P1**   | Accent marks (`\vec`, `\hat`, `\bar`)                | 1 (`\hat{H}`)     | S      | L    | ✅ Walker now reads `left:` style and applies horizontal offset for accent-body centering. Existing vlist handler covers vertical stacking. |
| **P1**   | Matrix rendering (`mtable`, `pmatrix`)               | 5+                | L      | H    | Deferred — substantial 2D layout work, likely scoped with Phase 7 (TikZ). |
| **P2**   | Delimiter auto-sizing (`\left/\right`)               | ~5                | M      | M    | Glyph-variant lookup based on enclosed content height. |
| **P2**   | Italic font auto-calibration                          | All italic        | M      | M    | Measure rendered glyph width on first text item; back-solve `italicScaleAdjust`. |
| **P3**   | Text mode (`\text{...}`)                              | rare              | S      | L    | Add `\text` class handler; toggle italic + font. |
| **P3**   | Color (`\color`, `\textcolor`)                        | 0 today           | M      | L    | Future-proofing; deferred until needed. |

**Effort key:** S = ≤1 day; M = 2–4 days; L = ≥1 week.

---

## 5. Cross-cutting risks

1. **Margin source ambiguity (P0 prerequisite).** Don't know without empirical inspection whether KaTeX's mbin/mrel margins arrive on `style` attributes (which the walker reads) or only via stylesheet (which SpaceDOM ignores). One DOM dump answers it.

2. **Sqrt regex fragility.** `\d{5,}` works for current KaTeX versions. A future version emitting decimal coordinates (`H40000.5`) or scientific notation would silently break overbar clipping. Consider parsing the path programmatically for long-term robustness.

3. **Scene object scaling.** Each glyph is its own `Component.Text 3D` clone. A 60-char expression already creates ~60 SceneObjects; matrix support would multiply. No batching today. Add a scene-object cap and consider glyph batching once formulas grow.

4. **Validator coverage gap.** `MatematexValidator` only checks parse success and item count. It would miss the spacing defects Phase 6.5 is finding. Visual regression tests (mentioned in design spec §6.3 but not built) would close this.

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

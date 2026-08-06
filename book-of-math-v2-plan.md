# Book of Math — Implementation Plan v2

Updated plan for Phase 6 follow-on work: searchable index, Spectacles UIKit migration, voice/keyboard input, and Linear Algebra chapter.

## Research summary (what we now know)

**[specs-devs/context](https://github.com/specs-devs/context)** is Snap's curated AI-context repo (`docs/`, `frameworks/`, `packages/`, `samples/`). The directly relevant docs are:

- `docs/spectacles-frameworks/spectacles-ui-kit/components/{Button,Frame,ScrollWindow,TextInputField,Backplate,...}.mdx`
- `docs/spectacles-frameworks/spectacles-ui-kit/architecture.mdx` (BaseElement / Visual / VisualElement pattern)
- `docs/about-spectacles-features/apis/key-board.mdx` (`TextInputSystem`)
- `docs/about-spectacles-features/apis/asr-module.mdx` (`AsrModule` — VoiceML's replacement)
- `docs/about-spectacles-features/connected-lenses/*` (v2 roadmap reference)

**Concrete APIs we will wire in:**

- **XR Keyboard.** `require('LensStudio:TextInputModule')` → `global.textInputSystem.requestKeyboard(options)` with a `TextInputSystem.KeyboardOptions` carrying `keyboardType`, `returnKeyType`, `enablePreview`, and the callbacks `onTextChanged(text, range)`, `onReturnKeyPressed()`, `onKeyboardStateChanged(isOpen)`, `onError`. Requires Lens Studio 5.7.0 / Spectacles OS 5.060.
- **ASR (replaces VoiceML).** `const asrModule = require('LensStudio:AsrModule')`; `AsrModule.AsrTranscriptionOptions.create()` with `silenceUntilTerminationMs`, `mode` (`HighAccuracy|Balanced|HighSpeed`), `onTranscriptionUpdateEvent`, `onTranscriptionErrorEvent`; `asrModule.startTranscribing(options)` / `stopTranscribing()`. Requires LS 5.9.0 / OS 5.61.
- **UIKit components we will use:** `RectangleButton` (`SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton`) with `onTriggerUp/Down`, `onValueChanged`; `TextInputField` (auto-opens keyboard, `inputType: Default|Numeric|Password|Pin`, `OnTextChanged`/`OnKeyboardStateChanged` callback lists); `ScrollWindow` (`setWindowSize`, `setScrollDimensions`, `vertical`, `initialize()`); `Frame` (`innerSize`, `closeButton`, supports drag/resize); `Backplate`; `ToggleGroup` (chapter chips). All instantiated via `sceneObject.createComponent(X.getTypeName())` then `.initialize()`. Install via Lens Studio Asset Library → "Spectacles UI Kit". Theming and event model via the `VisualElement` base.

---

## 1. Search architecture

**Index structure — recommend a normalized tokenized inverted index (built once at `onAwake`).**

- For each formula, build a `searchString` from `name + chapter + curated keywords[]` (we add a small keyword array to `MathFormula` so e.g. "Pythagorean Theorem" indexes "right triangle, hypotenuse").
- Lowercase, strip non-alphanumerics, split on whitespace, stem trivially (drop trailing `s`).
- Store `Map<token, Set<formulaId>>` plus the original `searchString` for substring fallback.
- Query path: tokenize the query the same way → intersect token postings → if empty, fall back to substring match on `searchString` → rank by (a) chapter match, (b) name match, (c) keyword match, (d) substring position.

**Why not trigram or fuzzy:** ~80 entries makes anything fancier than this overkill, and trigram blows up memory on-device for no UX win. Substring fallback covers typos like "pythag".

**Inputs supported (priority order):**

1. **XR keyboard** (primary). UIKit `TextInputField` is the front-door; it auto-invokes the on-device keyboard via `TextInputSystem`. We listen on its `OnTextChanged` callback list, debounce ~150 ms, re-query the index, re-render results.
2. **Voice dictation** (secondary). A "mic" `RectangleButton` toggles `AsrModule.startTranscribing/stopTranscribing`. `onTranscriptionUpdateEvent` writes the partial transcript into the same `TextInputField` text buffer (via `field.text = ...` if exposed, else our own search-state) so the search behaves identically regardless of input source. Use `mode = AsrModule.AsrMode.Balanced` and `silenceUntilTerminationMs ≈ 1500`.
3. **Topic chips** (no-input fallback). A horizontal `ToggleGroup` of 4 chapter chips and ~6 topic chips ("matrix", "trig", "derivative", "integral", "series", "log") — pinching a chip seeds the query.

**Result list UI.** Inside a `Frame`, a vertical `ScrollWindow` (`setWindowSize(20, 24)`, `setScrollDimensions(20, N×rowHeight)`). Each result row is a `RectangleButton` whose label is `"#{id}  {name}  ({chapter})"`. Bind `onTriggerUp` → `bookOfMath.goToFormula(id-1)` and switch screen to formula view. Pagination is implicit via scroll; if perf is a concern over 80 entries we can implement windowed virtualization (only build buttons for visible rows + a few). Recommend non-virtualized first — it's 80 buttons, well within budget.

---

## 2. UI component breakdown by screen

| Screen | Components (UIKit unless noted) | Notes |
|---|---|---|
| **Splash** | `Frame` container + Text 3D lines (existing) + `RectangleButton` "Begin" + `RectangleButton` "Search" | Replace ad-hoc text positioning later; for v1 keep current `makeSplashLine` and just add the two buttons. |
| **TOC** | `Frame` + 4× `RectangleButton` (Geometry / Algebra / Calculus / **Linear Algebra**) + `RectangleButton` "Search" | Bind `onTriggerUp` → `goToFormula(chapterStartIndex)`. |
| **Search** | `Frame`(innerSize ~30×24) hosting: `TextInputField` (top), mic `RectangleButton` (toggles ASR), `ToggleGroup` of topic chips, then a `ScrollWindow` of result-row `RectangleButton`s | `Frame.closeButton.onTriggerUp` returns to TOC. |
| **Results (same screen as Search)** | The lower `ScrollWindow` is repopulated as user types | Reuse row buttons via a small object pool (clone N=20 templates, hide unused). |
| **Formula view** | Existing `MatematexSceneRenderer` output + `RectangleButton` prev/next + `RectangleButton` "Back to Search" + `RectangleButton` "Index" | Replace the SIK `PinchButton` with UIKit `RectangleButton`; both fire similar events but UIKit's `onTriggerUp` is the canonical one. |

**Pattern note.** Per `architecture.mdx`, every UIKit interactive thing is a `VisualElement` (Visual + Element). We never create raw colliders — the components do it via `initialize()`.

---

## 3. Linear Algebra chapter (ids 61–80)

Adds `chapter: 'Linear Algebra'` to `MathBookData.ts`. Sources cited per row.

| id | name | latex | source |
|---|---|---|---|
| 61 | Matrix Multiplication | `(AB)_{ij} = \sum_{k=1}^{n} a_{ik} b_{kj}` | ProofWiki — *Matrix Multiplication* |
| 62 | Identity Matrix | `I_n = \mathrm{diag}(1,1,\ldots,1)` | Wikipedia CC BY-SA |
| 63 | Inverse Definition | `A A^{-1} = A^{-1} A = I` | OpenStax *Linear Algebra* |
| 64 | Transpose | `(A^T)_{ij} = A_{ji}` | ProofWiki |
| 65 | Transpose of Product | `(AB)^T = B^T A^T` | ProofWiki |
| 66 | Determinant 2×2 | `\det\!\begin{pmatrix}a & b\\ c & d\end{pmatrix} = ad - bc` | OpenStax — flag, uses `pmatrix` |
| 67 | Determinant of Product | `\det(AB) = \det(A)\,\det(B)` | ProofWiki |
| 68 | Cofactor Expansion | `\det A = \sum_{j=1}^{n}(-1)^{i+j} a_{ij} M_{ij}` | ProofWiki |
| 69 | Eigenvalue Equation | `A\mathbf{v} = \lambda \mathbf{v}` | OpenStax |
| 70 | Characteristic Polynomial | `\det(A - \lambda I) = 0` | OpenStax |
| 71 | Trace | `\mathrm{tr}(A) = \sum_{i=1}^{n} a_{ii}` | Wikipedia CC BY-SA |
| 72 | Trace of Product | `\mathrm{tr}(AB) = \mathrm{tr}(BA)` | ProofWiki |
| 73 | Dot Product | `\mathbf{a}\cdot\mathbf{b} = \sum_{i=1}^{n} a_i b_i` | OpenStax |
| 74 | Cross Product Magnitude | `\lVert \mathbf{a}\times\mathbf{b}\rVert = \lVert\mathbf{a}\rVert\lVert\mathbf{b}\rVert\sin\theta` | OpenStax |
| 75 | Cauchy-Schwarz | `\lvert\langle u,v\rangle\rvert \leq \lVert u\rVert\,\lVert v\rVert` | ProofWiki |
| 76 | Vector Norm (L2) | `\lVert\mathbf{x}\rVert_2 = \sqrt{\sum_{i=1}^{n} x_i^2}` | OpenStax |
| 77 | Orthogonality | `\mathbf{u}\cdot\mathbf{v} = 0` | OpenStax |
| 78 | Rank–Nullity | `\dim(\ker T) + \dim(\mathrm{im}\,T) = \dim V` | ProofWiki |
| 79 | Spectral Decomp. (sym.) | `A = Q \Lambda Q^T` | Wikipedia CC BY-SA |
| 80 | Singular Value Decomp. | `A = U \Sigma V^{T}` | OpenStax |

**Bridge gap flagged.** `MatematexBridge.ts` has no handler for KaTeX's `mtable` / `pmatrix` / `bmatrix` (verified — `grep` for "matrix|pmatrix|bmatrix|array|begin{" returns nothing). #66 (`pmatrix`) and any future explicit-matrix entry will fail validation today. **Mitigation options:** (a) for v1 swap #66 to a non-matrix form (`\det A = ad-bc` with a leading text "for a 2×2 matrix"); (b) add a Bridge enhancement task for `mtable` row/column rendering. I recommend (a) for v1, scoped (b) as a follow-up bridge feature with its own design pass.

---

## 4. Integration steps (ordered)

1. **Install Spectacles UI Kit** via Lens Studio → Asset Library → "Spectacles UI Kit". Confirm Lens Studio version ≥ 5.9.0 (needed for ASR; UIKit ships there too).
2. **Extend `MathBookData.ts`:** add optional `keywords?: string[]` to `MathFormula`; add the 20 Linear Algebra entries (ids 61–80) with the matrix-free variant for #66.
3. **Build `MathSearchIndex.ts`** (new file, sibling of `MathBookData.ts`): pure-TS, zero LS dependencies — `buildIndex(formulas)` returns `{ search(q: string, limit=20): MathFormula[] }`. Unit-testable in node.
4. **Refactor `MatematexBookOfMath.ts` to a screen state machine:** `Screen = Splash | TOC | Search | Formula`. Move `currentIndex` semantics into the Formula screen only; add `currentScreen`. Existing splash/TOC/formula rendering becomes screen handlers.
5. **Replace `PinchButton` inputs with UIKit `RectangleButton`** for prev/next/chapter. Keep the `@input PinchButton` types for one release as a fallback so existing scenes don't break, but log a deprecation note. Bind via `onTriggerUp.add(...)`.
6. **Add Search screen scaffold** (new `MatematexSearchScreen.ts` script component): owns one `TextInputField`, one mic `RectangleButton`, a `ToggleGroup` of chips, and a `ScrollWindow` with N=20 row-button templates. Hook `TextInputField`'s `OnTextChanged` callback → `index.search()` → `populateRows()`.
7. **Add ASR integration:** mic button toggles `AsrModule.startTranscribing/stopTranscribing`. On `onTranscriptionUpdateEvent`, set the search field's text and trigger a re-query. Permission: confirm `AsrModule` permission is declared in the Lens project settings.
8. **Wire navigation between screens.** Splash "Search" / TOC "Search" → Search screen; result row click → Formula screen at that id; formula "Index" → Search; formula "Back" → TOC.
9. **Validation pass.** Re-run the existing `validateAll` on the new 80 entries. Expect #66 to pass with the matrix-free form; if any others fail, log and decide skip vs. fix.
10. **Bridge mtable enhancement (deferred / v1.5).** Separate design doc; out of scope for this iteration.
11. **Connected Lens companion (v2).** Use docs in `docs/about-spectacles-features/connected-lenses/` (`building-connected-lenses.mdx`); design as a separate plan after v1 ships.

---

## 5. Open questions for the user

1. **UIKit version pinning.** Confirm Lens Studio version on your machine — if < 5.9, ASR is unavailable and voice slips to v1.5.
2. **Voice in v1 or v2?** ASR is straightforward but adds a permission and a UX surface (mic button states, partial-vs-final transcript handling). If you want a tight v1, voice can be a v1.1.
3. **Matrix rendering policy.** Confirm: (a) ship Linear Algebra now with matrix-free formulations and a Bridge follow-up, or (b) hold the chapter until `mtable` rendering lands. I recommend (a).
4. **Keep `PinchButton` for one release as fallback?** Or hard-cut to UIKit `RectangleButton` and re-bind every button in the Lens Studio scene?
5. **Search field scope.** Index name + chapter + curated keywords — do you want full-LaTeX-string indexed too (e.g. "sqrt", "sin") or is that noise?
6. **Topic chips list.** I proposed `matrix / trig / derivative / integral / series / log` — okay or do you want a different set?

---

## 6. Risk areas

- **Matrix rendering (high).** The bridge has zero `mtable`/`pmatrix` support. Anything visually matrix-shaped will silently produce 0 layout items and fall over in `validateAll`. Mitigation in plan.
- **ScrollWindow performance with 80 buttons (medium).** UIKit masks rather than virtualizes. 80 `RectangleButton`s is probably fine but un-tested for us. Object-pool the rows (build 20, recycle on filter) before assuming we need virtualization.
- **TextInputField + on-device keyboard latency (medium).** `requestKeyboard` is asynchronous and the UIKit field handles state via `OnKeyboardStateChanged`; debounce search on text change to avoid thrashing while the user types.
- **AsrModule maturity (medium).** Lens Studio 5.9 minimum; older devices will throw in `require`. Wrap the `require('LensStudio:AsrModule')` in a try/catch and degrade gracefully (mic button hidden).
- **Permissions (low).** ASR requires mic permission; XR keyboard requires `LensStudio:TextInputModule`. Both are project-config one-liners but easy to forget and surface as obscure runtime errors.
- **Two button systems coexisting (low).** SIK `PinchButton` (current) vs UIKit `RectangleButton` (new). Pick a migration window — I recommend a single PR cutting over.

---

### Critical files for implementation

- `Matematex/Assets/ProjectScripts/MatematexBookOfMath.ts` — refactor to screen state machine; swap to UIKit buttons.
- `Matematex/Assets/ProjectScripts/MathBookData.ts` — add `keywords?` field and the 20 Linear Algebra entries (ids 61–80).
- `Matematex/Assets/ProjectScripts/MathSearchIndex.ts` (new) — inverted-index search with substring fallback.
- `Matematex/Assets/ProjectScripts/MatematexSearchScreen.ts` (new) — `TextInputField` + ASR mic + `ScrollWindow` of result `RectangleButton` rows.
- `Matematex/Assets/ProjectScripts/MatematexBridge.ts` — flagged for a v1.5 `mtable`/`pmatrix` handler enhancement.

### Sources

- [Keyboard | Snap for Developers](https://developers.snap.com/spectacles/about-spectacles-features/apis/key-board)
- [KeyboardOptions | Lens Scripting API](https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.TextInputSystem.KeyboardOptions)
- [Native Keyboard | Snap for Developers](https://developers.snap.com/lens-studio/features/text/native-keyboard)
- [specs-devs/context — UI Kit components](https://github.com/specs-devs/context/tree/main/docs/spectacles-frameworks/spectacles-ui-kit/components)
- [specs-devs/context — ASR Module doc](https://github.com/specs-devs/context/blob/main/docs/about-spectacles-features/apis/asr-module.mdx)
- [specs-devs/context — XR Keyboard doc](https://github.com/specs-devs/context/blob/main/docs/about-spectacles-features/apis/key-board.mdx)


---

## 7. Status update (2026-08-04)

**Search screen is scaffolded in-scene.** `MatematexSearchScreen` now exists under
`MatematixBookOfMathPhase6` with 16 UI children, built by duplicating the working
`Launch PinchButtonCapsuleCh1` / `Text3D` objects (programmatic `Component.Text`
does not render — a clone is the only reliable path):

| Object | Purpose |
|---|---|
| `SearchQueryButton` | opens the XR keyboard |
| `SearchQueryLabel`, `SearchResultsLabel` | Text3D readouts |
| `SearchChip1..6` | topic chips, pre-labelled matrix / trig / derivative / integral / series / log |
| `SearchRow1..6` | result-row button pool |
| `SearchCloseButton` | back to splash |

A `Launch PinchButtonCapsuleSearch` button was added to the splash page and is
confirmed binding at runtime (`Bound searchButton.onButtonPinched`).

**Wired automatically:** `bookOfMath`, `queryButton`, `queryLabelObj`,
`resultsLabelObj`, `closeButton` on the screen; `searchScreen` and `searchButton`
on `MatematexBookOfMath`.

### Auto-wiring — no Inspector work needed

Three inputs are **arrays**, and arrays are the one thing the Lens Studio MCP
bridge cannot write (no array `valueType`; values get stringified). That left a
dozen drag-and-drop steps whose only rule was "match the numbers" — a poor job
for a human and one that fails silently when a row lands in the wrong slot.

`MatematexSearchScreen.autoWireFromChildren()` now runs at startup and fills any
array input still empty, by reading its own children's names:

| Child name pattern | Fills | Taken from each object |
|---|---|---|
| `SearchChip<n>` | `topicChips` | its PinchButton component |
| `SearchRow<n>` | `resultRowButtons` | its PinchButton component |
| `SearchRow<n>` | `resultRowLabelObjs` | the object itself — the caption is a `Text` on its `Launch Text` child |

Rows appear in two lists because two different things are read off them: the
button to bind a pinch to, and the object to find the caption on. Sorting is
numeric, so `SearchRow10` follows `SearchRow9`, not `SearchRow1`.

A hand-assigned array always wins — this only fills gaps, so any of it can still
be overridden in the Inspector. Adding a 7th row is just duplicating `SearchRow6`
as `SearchRow7`; it joins the pool automatically and the result limit becomes 7.

`topicChipLabels` stays empty on purpose: the fallback
(`matrix, trig, derivative, integral, series, log`) already matches the chip
captions.

**Verified in preview:** logs `auto-wired 6 topic chips` and
`auto-wired 6 result rows`.

**Check it:** Preview → pinch *Search* on the splash → pinch the **matrix** chip.
The results label should read "N results" and rows fill with entries like
`#61 Matrix Multiplication (Linear Algebra)`. No auto-wire lines in the Logger
means the child names don't match the patterns above.

### Layout fixes from the first on-device look

| Symptom | Cause | Fix |
|---|---|---|
| Row captions spilled well past their buttons | capsule ≈ 90px wide, `#1 Pythagorean Theorem (Geometry)` needs ≈ 190px | rows scaled **2.6× on X**; their `Launch Text` child counter-scaled to **0.48** so the type isn't stretched |
| `<<` / `>>` floating over the chip rows | `showScreen` toggled chapter + search buttons but never prev/next | both now hidden on the Search screen (`navigate()` already ignored them there, so they were inert as well as in the way) |
| ~~Row hit targets overlap~~ | my error — read `size: 15` on the collider and missed `fitVisual: true` | nothing to fix; the collider tracks the mesh, so widened rows get wider hit targets |

### Known rough edges

- **Result labels render green.** The two Text3D labels are clones of the book's
  template, and `Text3D` takes its colour from a *material*, not a per-component
  `textFill` — and that material is shared with the book's formula glyphs.
  Recolouring it would repaint every formula. Fix is a cloned material, same
  approach already used in `MatematexProof`.
- **The keyboard button may be inert in Preview.** `SearchQueryButton` calls the
  Spectacles XR keyboard via `global.textInputSystem`, usually absent on desktop;
  the script logs and continues. Use the chips to test. Voice/ASR is not built.
- **These are SIK `PinchButton`s, not Spectacles UI Kit.** The `RectangleButton` /
  `TextInputField` migration in §2 above is still the intended end state.

**Also landed:** #66 restored from its matrix-free workaround to the real
`\det\begin{pmatrix}…\end{pmatrix}` form, now that the bridge renders `mtable`.


---

## 8. Field-of-view budget (2026-08-05)

**The desktop preview shows about twice the vertical extent Spectacles does.**
Lens Studio's preview camera runs a ~63.5° vertical FOV; Spectacles is ~46°
*diagonal*, roughly 33° vertical. Content sits ~101 world units away
(parent z=-100 + `containerWorldZ` 39, camera z=+40), which gives:

| | vertical half-extent |
|---|---|
| Lens Studio preview | **±62 units** |
| Spectacles | **±30 units** |

The original splash was **149 units tall** — even the `MATEMATEX` title at y=+40
sat off the display on device, while looking perfectly composed on the desktop.
This is the worst kind of bug: invisible in the only view most of the UI gets
built in.

### What changed

- Splash trimmed to **46 units** (y +25 … −21): title, subtitle, a one-line
  blurb, TOC header, four chapter rows. The three-line catalogue blurb collapsed
  to one; the hint line dropped (the buttons say it).
- **New About page** holds what was pushed off the bottom — content sources,
  licences, copyright. Reached by an `About` button on the splash; pinching it
  again returns. Prev/next are hidden there, so the toggle is the only exit and
  must not hide itself.
- **Chapter buttons are positioned by the script**, from the same
  `CHAPTER_BUTTON_Y` array the TOC rows use. They had drifted out of alignment
  the moment the splash was re-flowed; now they can't.
- **`SAFE_HALF_HEIGHT = 27`** is checked at runtime in `renderLines()`, which
  logs a warning naming the page and its span. Verified it fires by temporarily
  lowering it to 18.

### Rule of thumb

Anything laid out by hand in world units must stay inside **±27** at the current
viewing distance. If the container moves closer or further, that budget scales
with it — the constant assumes ~101 units.

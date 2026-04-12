# Matematex Design Specification

## 1. Problem Statement

Spectacles-Matematex aims to render LaTeX mathematical expressions as spatially positioned 3D objects on Snap Spectacles. The rendering pipeline must:

1. Parse LaTeX markup into a structured representation
2. Convert that representation into visual elements renderable by Lens Studio APIs
3. Operate within the memory and CPU constraints of Snap Spectacles hardware
4. Run entirely offline with no external service dependencies (R7)

The project requires compatibility with standard LaTeX math notation and must leverage **SpaceSVG** (an existing Lens Studio SVG renderer) for path-based rendering. A **SpaceDOM** library is also available, providing a spec-compliant DOM tree implementation that runs natively in the Lens Studio TypeScript runtime without any browser dependencies.

### Key Available Infrastructure

- **SpaceSVG** ([source](https://github.com/IoTone/Spectacles-polynode/blob/main/PolynodeSpecsDemo/Assets/ProjectScripts/SpaceSVG.ts)) -- Renders SVG path data into Lens Studio meshes and scene objects.
- **SpaceDOM** ([source](https://github.com/IoTone/Spectacles-polynode/blob/main/PolynodeSpecsDemo/Assets/ProjectScripts/SpaceDOM.ts)) -- A pure TypeScript DOM implementation for Lens Studio. Provides `SpaceDocument`, `SpaceElement`, `SpaceText`, `SpaceComment`, `SpaceAttr`, `SpaceNodeList`, `SpaceHTMLCollection`, `SpaceNamedNodeMap`, `SpaceDocumentFragment`, plus serialization helpers. Supports `createElement`, `createElementNS`, `createTextNode`, `getElementById`, `getElementsByTagName`, `getElementsByClassName`, `getAttribute`/`setAttribute`, `innerHTML`/`outerHTML`, `appendChild`, `insertBefore`, `removeChild`, `cloneNode`, `textContent`, and more. Has a parser registration hook (`_registerParser`) for HTML parsing support.

### Current State

- **Prototype implementations** exist (TestLatex2/3/4) using regex-based parsing and hardcoded Unicode substitution for a handful of symbols (`\sqrt`, superscripts, subscripts).
- **KaTeX 0.16.22** and **MathJax 3.2.2** are checked into `/external/` but are not integrated into the Lens Studio runtime. Both libraries depend on DOM APIs -- which **SpaceDOM now provides**.
- **texsvg** exists in `/external/texsvg/` as a Node.js pipeline (MathJax -> SVG -> SVGO optimization). Useful as a development-time reference oracle.
- **SpaceSVG** is referenced but not yet imported into the project.
- **SpaceDOM** is referenced in the README as the off-screen DOM library for porting efforts.

### Requirements Summary

| ID | Requirement |
|----|-------------|
| R1 | TypeScript library compatible with Lens Studio APIs |
| R2 | Full LaTeX compliant parser |
| R3 | Full LaTeX compliant renderer into SVG |
| R4 | Full LaTeX compliant renderer into PNG |
| R5 | 3D plotting conversion (TikZ-style) into spatial rendering |
| R6 | Efficient memory and CPU use on Snap Spectacles |
| R7 | 100% local, no external online services |

---

## 2. Three Approaches

### Approach A: KaTeX on SpaceDOM + SpaceSVG Renderer

**Description:** Run KaTeX's existing parser and rendering engine on top of SpaceDOM as the DOM backend. KaTeX renders LaTeX into an HTML DOM tree (spans with CSS classes for positioning). A bridge layer walks the resulting SpaceDOM tree, extracts layout information (positions, sizes, font classes), and converts it to SVG. SpaceSVG then renders the SVG into Lens Studio scene objects.

**Pipeline:**
```
LaTeX string
    -> KaTeX (using SpaceDOM as document)
    -> SpaceDOM tree (HTML spans + CSS classes)
    -> DOM-to-SVG bridge (walks tree, maps KaTeX CSS classes to geometry)
    -> SVG string
    -> SpaceSVG
    -> SceneObjects
```

**How it works:**
- Create a `SpaceDocument` instance and wire it as KaTeX's `document` global
- KaTeX's `renderToString()` produces an HTML string; alternatively, use `render()` targeting a SpaceDOM element so we get a live DOM tree
- KaTeX uses CSS class names (e.g., `.mfrac`, `.msupsub`, `.sqrt`, `.katex-html`) to encode layout semantics. The bridge maps these classes to SVG layout rules
- KaTeX ships with pre-computed font metrics tables (`fontMetricsData.js`) for its own fonts -- these provide glyph widths, heights, depths, and italic corrections
- Symbol glyphs are either rendered as SVG `<text>` elements (using font names from KaTeX's CSS classes) or pre-extracted as SVG `<path>` data from KaTeX's bundled fonts
- SpaceSVG renders the final SVG output

**Pros:**
- **Largest LaTeX coverage with least effort:** KaTeX supports ~700 LaTeX commands, all math environments, and has been battle-tested by millions of users (Khan Academy, many websites)
- **Parser and layout engine are free:** No need to write a tokenizer, parser, AST, or layout engine from scratch
- **SpaceDOM is purpose-built for this:** SpaceDOM was designed to enable exactly this kind of library porting. It provides `createElement`, `createElementNS`, `setAttribute`, `appendChild`, `innerHTML`, `textContent`, `cloneNode`, namespace support (needed for MathML/SVG elements), and serialization
- **KaTeX is small:** ~200KB minified, significantly smaller than MathJax (~2MB+)
- **Font metrics included:** KaTeX's `fontMetricsData.js` provides precise measurements for all math symbols -- no need to extract font metrics independently
- **KaTeX has a comprehensive test suite** (~1000+ tests) that can be run against the SpaceDOM backend to validate the port
- **Offline (R7 compliant):** Everything runs on-device
- **`renderToString()` as escape hatch:** Even if SpaceDOM integration hits issues, KaTeX's `renderToString()` produces an HTML string that can be parsed separately

**Cons:**
- **DOM-to-SVG bridge is non-trivial:** KaTeX's output is HTML with CSS-based layout (spans, relative positioning, em-based sizing). Converting this to SVG requires understanding KaTeX's CSS class semantics and mapping them to absolute positions. This is the main engineering challenge.
- **No CSS engine in SpaceDOM:** SpaceDOM provides DOM structure but no CSS cascade, computed styles, or layout engine. KaTeX's `render()` path may call `getBoundingClientRect()` or similar measurement APIs that SpaceDOM cannot provide. The `renderToString()` path avoids this but gives us a string, not a measured tree.
- **Font rendering gap:** KaTeX expects its custom web fonts (KaTeX_Main, KaTeX_Math, KaTeX_Size1-4, KaTeX_AMS, etc.) to be available. On Spectacles, these fonts don't exist -- we need to either map them to SVG paths or find equivalent rendering.
- **Memory risk:** KaTeX's parse tables + font metrics + SpaceDOM tree for complex expressions could approach memory limits on Spectacles.
- **Maintenance:** KaTeX updates require re-validating the SpaceDOM integration. However, KaTeX's API surface is stable.
- **3D extensions (R5) are bolted on:** KaTeX has no concept of 3D layout. TikZ-style plotting would require a separate system layered on top.

---

### Approach B: Custom Lightweight LaTeX-to-SVG Engine

**Description:** Build a purpose-built, minimal LaTeX parser and SVG generator specifically designed for the Spectacles runtime. Support a practical subset of LaTeX math (not full compliance initially) with an architecture that allows incremental expansion. Use SpaceSVG for rendering. SpaceDOM is not needed.

**Pipeline:**
```
LaTeX string
    -> Custom tokenizer
    -> Custom AST
    -> Layout engine (font metrics tables)
    -> SVG path generator
    -> SpaceSVG
    -> SceneObjects
```

**How it works:**
- **Tokenizer:** Scan LaTeX input into tokens (commands, groups, text, operators). LaTeX tokenization is well-documented and straightforward.
- **Parser:** Build an AST from tokens. Support a curated subset of LaTeX math:
  - Arithmetic operators, Greek letters, relations
  - Superscripts, subscripts (nested)
  - Fractions (`\frac`), square roots (`\sqrt`, `\sqrt[n]`)
  - Summation, product, integral with limits
  - Matrices and alignment environments (`align`, `pmatrix`, `bmatrix`)
  - Text mode (`\text`, `\mathrm`)
  - Delimiters (parentheses, brackets, braces, `\left`/`\right`)
- **Layout engine:** Walk the AST and compute bounding boxes, baselines, and positions using a table of pre-computed font metrics.
- **SVG generator:** Emit SVG `<path>`, `<text>`, and `<line>` elements. Symbol glyphs are stored as pre-extracted SVG path data from font outlines.
- **SpaceSVG:** Renders the generated SVG into Lens Studio scene objects.

**Pros:**
- **Runs entirely on-device** -- no network dependency, no latency (R7 compliant)
- **Tailored for Spectacles constraints:** Only include what's needed; memory footprint is predictable and controllable (R6)
- **Incremental development:** Start with basic expressions, ship early, add commands over time
- **No DOM dependencies:** No SpaceDOM needed, no CSS class interpretation, no bridge layer
- **Full control over spatial layout:** Can natively integrate 3D extensions (R5) since the layout engine is custom
- **Font metrics can be pre-computed and shipped as a compact JSON table**
- **SVG output is directly testable** outside of Spectacles (in any browser or SVG viewer)
- **Simpler debugging:** Every layer is purpose-built and transparent; no black-box library internals

**Cons:**
- **Significant up-front engineering** for the parser and layout engine (estimated 4-6 weeks for MVP)
- **Not full LaTeX compliance initially** -- advanced packages, edge cases, and less common commands require ongoing work
- **Layout quality risk:** Achieving typographic quality comparable to TeX/KaTeX requires careful baseline, kerning, and spacing calculations. This is genuinely hard.
- **Font glyph extraction:** Must extract SVG paths for math symbols from a font file (one-time tooling effort, but non-trivial for the full math symbol set)
- **Testing burden:** Must build a conformance test suite from scratch (vs. inheriting KaTeX's)
- **Re-inventing the wheel:** Parser and layout logic that KaTeX already provides would need to be rebuilt

---

### Approach C: KaTeX on SpaceDOM + Direct DOM-to-SceneObject Rendering (No SVG Intermediate)

**Description:** Run KaTeX on SpaceDOM (like Approach A) but skip the SVG intermediate representation entirely. Instead, walk KaTeX's SpaceDOM output tree and directly create Lens Studio scene objects -- `Text` components for characters, `Image` components for lines (fraction bars, radical symbols), and `SceneObject` hierarchies for grouping and positioning.

**Pipeline:**
```
LaTeX string
    -> KaTeX (using SpaceDOM as document)
    -> SpaceDOM tree (HTML spans + CSS classes)
    -> DOM-to-SceneObject renderer (walks tree, creates Lens Studio components)
    -> SceneObjects (directly in scene)
```

**How it works:**
- Same SpaceDOM + KaTeX integration as Approach A for parsing and DOM generation
- Instead of converting to SVG, a renderer walks the SpaceDOM tree:
  - `.katex-html` root -> create container `SceneObject`
  - `.mfrac` -> create fraction bar as `Image` component, numerator/denominator as child groups
  - `.msupsub` -> position superscript/subscript children with calculated offsets
  - `.sqrt` -> render radical using line segments (similar to existing TestLatex4 approach)
  - `.mord`, `.mop`, `.mrel` -> create `Text` components with appropriate styling
- Font sizing derived from KaTeX's CSS class hierarchy (`size1` through `size11`, `sizing`)
- Positioning calculated from KaTeX's em-based measurements, converted to world units

**Pros:**
- **Eliminates the SVG intermediate step:** One fewer translation layer means fewer bugs and better performance
- **Leverages existing prototype patterns:** TestLatex4 already demonstrates creating `Text` and `Image` components for math rendering -- this approach formalizes that pattern
- **Full KaTeX parser coverage** (~700 commands) with no parser engineering
- **Direct 3D positioning:** Since we're creating scene objects directly, 3D extensions (R5) can be integrated naturally -- just change the z-coordinate or add rotation
- **No SpaceSVG dependency:** Removes the question of "what SVG features does SpaceSVG support?"
- **Offline (R7 compliant)**
- **Text components perform well** on Spectacles -- the runtime is optimized for them

**Cons:**
- **CSS class interpretation is the critical challenge:** Must reverse-engineer KaTeX's CSS layout semantics to position scene objects correctly. KaTeX uses ~50 distinct CSS classes with specific layout rules.
- **No CSS engine (same as Approach A):** Without `getComputedStyle` or layout measurement, we must manually implement the sizing/positioning logic that CSS normally handles.
- **Font mapping:** KaTeX expects specific fonts. Lens Studio `Text` components use whatever fonts are available. Character widths may differ, causing misalignment.
- **Scene object proliferation:** Complex expressions could create hundreds of scene objects (one per character in the worst case), which may impact performance (R6).
- **Harder to test outside Spectacles:** No intermediate SVG to inspect in a browser. Testing requires either Lens Studio preview or building a separate scene-object-to-SVG dumper for offline validation.
- **Tight coupling to KaTeX internals:** If KaTeX changes its CSS class structure (rare but possible), the renderer breaks.

---

## 3. Comparison Matrix

| Criterion                        | A: KaTeX + SpaceDOM + SVG | B: Custom Engine  | C: KaTeX + SpaceDOM Direct |
|----------------------------------|---------------------------|-------------------|-----------------------------|
| LaTeX coverage                   | High (700+ commands)      | Medium (curated, expandable) | High (700+ commands)  |
| On-device memory                 | Medium-High               | Controllable      | Medium                      |
| Network dependency               | None                      | None              | None                        |
| Time to first working render     | 2-3 weeks                 | 4-6 weeks         | 2-3 weeks                   |
| Time to production quality       | 4-6 weeks                 | 3-4 months        | 4-6 weeks                   |
| Maintenance burden               | Medium (KaTeX updates)    | Medium (own code) | Medium (KaTeX updates)      |
| 3D/spatial extension support (R5)| Hard (post-SVG)           | Native            | Moderate (direct scene)     |
| Offline capability (R7)          | Yes                       | Yes               | Yes                         |
| Typographic quality              | High (KaTeX metrics)      | Medium initially  | High (KaTeX metrics)        |
| Testability                      | Good (SVG output inspectable) | Good (SVG output inspectable) | Harder (no intermediate format) |
| SpaceSVG dependency              | Yes                       | Yes               | No                          |
| SpaceDOM dependency              | Yes                       | No                | Yes                         |
| Complexity of bridge layer       | High (DOM->SVG)           | N/A               | High (DOM->SceneObjects)    |
| R2 compliance (full parser)      | Yes (KaTeX)               | Partial initially | Yes (KaTeX)                 |
| R3 compliance (SVG output)       | Yes                       | Yes               | No (no SVG produced)        |
| R4 compliance (PNG output)       | Possible (rasterize SVG)  | Possible (rasterize SVG) | Difficult             |

---

## 4. Recommended Approach: A (KaTeX on SpaceDOM + SpaceSVG)

### Rationale

**Approach A is the best overall architecture.** The availability of SpaceDOM fundamentally changes the calculus from the original analysis. Here's why:

1. **SpaceDOM eliminates the #1 blocker for KaTeX integration.** The previous concern with porting KaTeX was "KaTeX depends on DOM APIs not available in Spectacles." SpaceDOM provides exactly those APIs -- `createElement`, `createElementNS`, `setAttribute`, `appendChild`, `innerHTML`, `textContent`, `cloneNode`, namespace support, and serialization. This transforms KaTeX integration from "months of porting" to "weeks of bridge work."

2. **R2 (full LaTeX parser) is met immediately.** Writing a full LaTeX parser from scratch (Approach B) is a multi-month effort to reach the coverage KaTeX already provides. With SpaceDOM enabling KaTeX to run, we get ~700 commands for free.

3. **R3 (SVG output) and R4 (PNG output) are naturally satisfied.** The DOM-to-SVG bridge produces SVG strings that can be inspected, tested, and rasterized to PNG. Approach C skips SVG entirely, making R3/R4 harder to achieve.

4. **R7 (offline) is fully satisfied.** Everything runs on-device.

5. **SVG as the intermediate representation is the right decoupling point.** It gives us:
   - A standard, inspectable format for debugging and testing
   - A clean interface to SpaceSVG (which is designed to consume SVG)
   - PNG generation via SVG rasterization (R4)
   - The ability to test the pipeline end-to-end in a browser, outside Lens Studio

6. **The DOM-to-SVG bridge is tractable.** KaTeX's HTML output is highly structured and uses a well-documented set of CSS classes. The bridge does not need a general-purpose CSS engine -- it needs to understand KaTeX's specific class vocabulary (~50 classes) and their layout semantics. This is a bounded problem.

7. **KaTeX's font metrics solve the hardest layout problem.** Correct math typesetting requires precise glyph measurements. KaTeX ships `fontMetricsData.js` with exact metrics for every symbol. Approach B would need to extract or recreate these.

### Why Not B (Custom Engine)?

Approach B was the top recommendation before SpaceDOM existed, because fighting DOM dependencies seemed worse than building from scratch. With SpaceDOM, that trade-off reverses:

- Building a custom parser to match KaTeX's 700-command coverage is months of work
- Building a custom layout engine with correct baselines, kerning, and spacing is the hardest problem in math typesetting -- KaTeX already solved it
- The custom engine has **better R5 support** (native 3D), but R5 is a lower priority than R2/R3 and can be layered on top of Approach A later

### Why Not C (Direct SceneObject Rendering)?

Approach C avoids the SVG step but introduces harder problems:

- No inspectable intermediate format makes testing difficult
- R3 (SVG output) is not met
- R4 (PNG output) becomes very difficult
- Scene object proliferation risks hitting R6 performance limits
- The DOM-to-SceneObject bridge is roughly the same complexity as DOM-to-SVG, but less testable

### R5 (3D Extensions) Strategy

3D plotting (TikZ-style) is orthogonal to math expression rendering. It will be implemented as a separate module that:

- Parses TikZ-subset commands independently
- Generates 3D geometry using Lens Studio's `MeshBuilder` API directly
- Shares the same `SceneObject` container hierarchy as the math renderer
- Does not go through the SVG pipeline (3D geometry doesn't benefit from 2D SVG)

---

## 5. Architecture (Approach A)

```
                    +------------------+
                    |  LaTeX String    |
                    +--------+---------+
                             |
                    +--------v---------+
                    |      KaTeX       |  Uses SpaceDOM as its document.
                    |   (unmodified)   |  Parses LaTeX, builds layout,
                    +--------+---------+  produces HTML with CSS classes.
                             |
                    +--------v---------+
                    |    SpaceDOM      |  In-memory DOM tree.
                    |   (HTML tree)    |  SpaceElement nodes with
                    +--------+---------+  attributes and class names.
                             |
                    +--------v---------+
                    |  KaTeX-to-SVG    |  Walks SpaceDOM tree.
                    |     Bridge       |  Maps CSS classes to SVG layout.
                    +--------+---------+  Uses KaTeX font metrics for
                             |            glyph sizing and positioning.
                    +--------v---------+
                    |  SVG String      |  Standard SVG markup.
                    |                  |  Inspectable, testable,
                    +--------+---------+  rasterizable to PNG.
                             |
                    +--------v---------+
                    |    SpaceSVG      |  Converts SVG paths to
                    |                  |  Lens Studio meshes and
                    +------------------+  scene objects.
```

### Module Breakdown

| Module             | Responsibility                                              | Input               | Output                |
|--------------------|-------------------------------------------------------------|----------------------|-----------------------|
| `SpaceDOMAdapter`  | Wire SpaceDOM as KaTeX's document; provide global shims     | -                    | `SpaceDocument`       |
| `KaTeXRunner`      | Call KaTeX `render()` or `renderToString()` with SpaceDOM   | LaTeX string         | SpaceDOM tree or HTML string |
| `KaTeXSVGBridge`   | Walk KaTeX's DOM output, produce SVG using class semantics  | SpaceDOM tree        | SVG string            |
| `FontMetrics`      | KaTeX's `fontMetricsData.js` -- provides glyph measurements | font name + char     | width, height, depth  |
| `GlyphTable`       | Map KaTeX font+character to SVG path data                   | font + codepoint     | SVG `<path>` d-string |
| `MatematexAPI`     | Public API: `renderToSVG(latex): string`                    | LaTeX string         | SVG string            |
| `SpaceSVGBridge`   | Feed SVG string to SpaceSVG for scene rendering             | SVG string           | `SceneObject`         |
| `MatematexComponent` | Lens Studio `@component` wrapper for scene integration    | LaTeX input + config | rendered scene        |

### SpaceDOM Adapter Details

The adapter must provide the following to KaTeX:

```typescript
// Minimum shims needed for KaTeX
const doc = new SpaceDocument();

// KaTeX accesses these globals:
// - document.createElement()        -> doc.createElement()       [SpaceDOM provides]
// - document.createElementNS()      -> doc.createElementNS()     [SpaceDOM provides]
// - document.createTextNode()       -> doc.createTextNode()      [SpaceDOM provides]
// - document.createDocumentFragment() -> doc.createDocumentFragment() [SpaceDOM provides]

// KaTeX may also access:
// - element.getAttribute()          [SpaceDOM provides]
// - element.setAttribute()          [SpaceDOM provides]
// - element.appendChild()           [SpaceDOM provides]
// - element.className               [SpaceDOM provides]
// - element.textContent             [SpaceDOM provides]
// - element.innerHTML               [SpaceDOM provides via serialization]
// - element.cloneNode()             [SpaceDOM provides]
// - node.childNodes                 [SpaceDOM provides]
```

Items SpaceDOM does **not** provide that KaTeX may need (to be shimmed or worked around):

| Missing API                | KaTeX Usage                        | Mitigation                                    |
|----------------------------|------------------------------------|-----------------------------------------------|
| `element.style`            | Inline style for sizing/color      | Add a `.style` property bag to SpaceElement   |
| `window.getComputedStyle`  | Measuring rendered sizes           | Use `renderToString()` path which avoids this |
| `element.getBoundingClientRect` | Measuring element dimensions  | Not needed with `renderToString()` path       |
| `DOMParser`                | Parsing HTML strings               | SpaceDOM's `_registerParser` hook             |

### KaTeX CSS Class Vocabulary (Bridge Must Understand)

The DOM-to-SVG bridge needs to interpret these KaTeX-generated CSS classes:

| Class                | Meaning                                   | SVG Mapping                              |
|----------------------|-------------------------------------------|------------------------------------------|
| `.katex-html`        | Root container                            | SVG `<svg>` root element                |
| `.base`              | Baseline-aligned group                    | SVG `<g>` with baseline transform       |
| `.strut`             | Invisible height strut                    | Contributes to parent height calculation |
| `.mord`              | Ordinary math character                   | SVG `<text>` or `<path>` (glyph)        |
| `.mop`               | Large operator (sum, integral)            | SVG `<path>` (glyph) with size variants |
| `.mbin`              | Binary operator (+, -, ...)               | SVG `<text>` or `<path>`                |
| `.mrel`              | Relation (=, <, >, ...)                   | SVG `<text>` or `<path>`                |
| `.mopen`, `.mclose`  | Delimiters (parens, brackets)             | SVG `<path>` with scaling               |
| `.mfrac`             | Fraction container                        | SVG `<line>` (bar) + numerator/denom groups |
| `.frac-line`         | Fraction bar                              | SVG `<line>` element                    |
| `.msupsub`           | Superscript/subscript container           | Offset `<g>` transforms                 |
| `.vlist`             | Vertical list (stacked elements)          | Vertically offset `<g>` groups          |
| `.sqrt`              | Square root container                     | SVG `<path>` (radical) + overbar        |
| `.sizing`            | Font size modifier                        | Scale factor on `<g>`                    |
| `.delimsizing`       | Delimiter size variant                    | Glyph variant selection                  |
| `.nulldelimiter`     | Invisible delimiter (spacing only)        | Empty space                              |
| `.mspace`            | Explicit spacing                          | Horizontal offset                        |
| `.mtable`            | Matrix/table                              | Grid layout with `<g>` groups            |

### Supported LaTeX (via KaTeX)

KaTeX provides immediate support for:

**All standard math** (no additional work beyond the bridge):
- Arithmetic, Greek letters, relations, logic symbols
- Superscripts, subscripts (arbitrary nesting)
- Fractions (`\frac`, `\dfrac`, `\tfrac`, `\cfrac`)
- Roots (`\sqrt`, `\sqrt[n]`)
- Sums, products, integrals, limits with limits
- Matrices (`pmatrix`, `bmatrix`, `vmatrix`, `Bmatrix`, `matrix`)
- Alignment environments (`align`, `align*`, `aligned`, `gathered`, `cases`)
- All delimiter types with `\left`/`\right`/`\big`/`\Big`/`\bigg`/`\Bigg`
- Accents, arrows, spacing commands, text mode
- AMS math symbols and environments
- Color, sizing, font selection (`\mathbf`, `\mathrm`, `\mathcal`, etc.)

See the full KaTeX supported functions list: https://katex.org/docs/supported

---

## 6. Test Plan

The test plan has four tiers: **SpaceDOM integration tests** validating KaTeX runs on SpaceDOM, **SVG output conformance tests** against MathJax reference, **visual inspection tests** for spatial rendering, and **performance tests**.

### 6.1 SpaceDOM Integration Tests (Automated, Node.js)

Validate that KaTeX runs correctly on the SpaceDOM backend. Run in Node.js using the same SpaceDOM source.

#### 6.1.1 DOM Adapter Tests

| Test Case                              | Assertion                                           |
|----------------------------------------|-----------------------------------------------------|
| `createElement` creates SpaceElement   | `doc.createElement('span').tagName === 'span'`      |
| `createElementNS` handles SVG ns       | Element has correct `namespaceURI`                  |
| `setAttribute`/`getAttribute` roundtrip | Value preserved                                    |
| `appendChild` builds tree              | `parentNode` and `childNodes` correct               |
| `innerHTML` serializes correctly       | Output matches expected HTML string                 |
| `className` get/set works              | Maps to `class` attribute                           |
| `textContent` aggregates child text    | Returns concatenated descendant text                |
| `cloneNode(true)` deep copies tree     | Clone is structurally equal, independent            |

#### 6.1.2 KaTeX-on-SpaceDOM Smoke Tests

| Test Case                        | Input                      | Assertion                                       |
|----------------------------------|----------------------------|-------------------------------------------------|
| Simple variable                  | `x`                       | Output contains a `.mord` span with text "x"    |
| Superscript                     | `x^2`                     | Output contains `.msupsub` structure             |
| Fraction                        | `\frac{1}{2}`             | Output contains `.mfrac` with `.frac-line`       |
| Square root                     | `\sqrt{x}`                | Output contains `.sqrt` structure                |
| Greek letter                    | `\alpha`                  | Output contains correct Unicode character        |
| Complex expression              | `E=mc^2`                  | Output is well-formed HTML, no errors            |
| KaTeX error handling             | `\frac{1}`               | KaTeX throws `ParseError` (expected)             |
| Display mode                     | `\sum_{i=1}^n i^2`       | `.mop` has limits in display position            |
| Align environment                | `\begin{align}...`        | Output contains `.mtable` structure              |
| Matrix                          | `\begin{pmatrix}...`      | Output contains `.mtable` with delimiters        |

#### 6.1.3 KaTeX Test Suite on SpaceDOM

Run KaTeX's own test suite (~1000+ tests) with SpaceDOM as the DOM backend. Track:

| Metric                    | Target (Phase 1) | Target (Phase 2) |
|---------------------------|-------------------|-------------------|
| Parser tests passing      | 95%               | 100%              |
| Render tests passing      | 80%               | 95%               |
| Tests requiring DOM shims | < 20              | < 5               |

### 6.2 SVG Conformance Tests (Automated, Against MathJax Reference)

Use the `texsvg` pipeline (MathJax) running locally as a reference oracle. For each test expression, compare the bridge's SVG output against MathJax's output.

#### 6.2.1 Test Corpus

Build a corpus of ~100 LaTeX expressions organized by category:

**Basic expressions (20):**
```
x^2, a_n, x^{2n+1}, a_{i,j}, E=mc^2,
x^2+y^2=r^2, \frac{1}{2}, \frac{a+b}{c-d},
\frac{\frac{1}{2}}{3}, \sqrt{2}, \sqrt[3]{x+1},
a+b=c, -x, \pm 1, a \cdot b, a \times b,
a \div b, a \neq b, a \leq b, a \geq b
```

**Greek and symbols (15):**
```
\alpha, \beta, \gamma, \Delta, \Sigma, \pi,
\infty, \partial, \nabla, \forall, \exists,
\in, \notin, \subset, \cup
```

**Complex structures (25):**
```
\sum_{i=1}^{n} i^2, \prod_{k=1}^{n} k,
\int_0^1 x\,dx, \lim_{x\to 0} \frac{\sin x}{x},
\binom{n}{k}, \begin{pmatrix} a & b \\ c & d \end{pmatrix},
\left(\frac{a}{b}\right)^n, \underbrace{a+b+c}_{n},
\vec{v} \cdot \hat{n}, \mathcal{L}\{f(t)\},
... (etc)
```

**Real-world formulas (20):**
```
E = \frac{mc^2}{\sqrt{1-\frac{v^2}{c^2}}}     (Lorentz factor)
e^{i\pi} + 1 = 0                                (Euler's identity)
\frac{d}{dx}[f(g(x))] = f'(g(x)) \cdot g'(x)  (Chain rule)
\nabla \times \vec{E} = -\frac{\partial \vec{B}}{\partial t}  (Faraday's law)
f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!}(x-a)^n     (Taylor series)
... (etc)
```

**Edge cases and stress tests (20):**
```
Deeply nested fractions (5 levels)
Long expressions (50+ characters)
All delimiter types
Mixed text and math mode
Empty groups, consecutive operators
```

#### 6.2.2 Comparison Methodology

Since pixel-perfect SVG matching is impractical (different engines make different styling choices), use **structural comparison**:

1. **Element count match:** Same number of `<path>`, `<text>`, `<line>`, `<rect>` elements (within tolerance)
2. **Bounding box comparison:** Overall SVG dimensions within 15% of reference
3. **Symbol presence check:** All expected glyphs/characters appear in the output
4. **Baseline alignment:** For multi-element expressions, verify relative vertical positions match the reference within tolerance
5. **Visual diff (rasterized):** Rasterize both SVGs to PNG at a fixed resolution, compute SSIM (structural similarity index). Flag results with SSIM < 0.85 for manual review.

#### 6.2.3 Conformance Scoring

| Metric                        | Target (MVP) | Target (v1.0) |
|-------------------------------|--------------|----------------|
| Parser success rate           | 95%          | 99%+           |
| SVG structural match          | 80%          | 95%            |
| Visual SSIM > 0.85            | 75%          | 90%            |
| No-crash rate                 | 100%         | 100%           |

### 6.3 Visual Inspection Tests (Manual + Screenshot Automation)

These tests validate the final spatial rendering on Spectacles (or in Lens Studio preview).

#### 6.3.1 Test Harness

Build a `MatematexTestRunner` Lens Studio component that:

1. Accepts a list of test expressions (hardcoded or loaded from a JSON asset)
2. Renders each expression at a fixed position in the scene
3. Displays the expression index and raw LaTeX as a `Text` label above the rendered output
4. Supports stepping through expressions via hand gesture (pinch to advance)
5. Captures screenshots via Lens Studio's built-in capture API (or manual capture)
6. Logs render time per expression to the console

#### 6.3.2 Visual Test Cases

| ID     | LaTeX Input                                         | What to Inspect                                  |
|--------|-----------------------------------------------------|--------------------------------------------------|
| VT-01  | `x^2`                                              | Superscript is raised, smaller font              |
| VT-02  | `\frac{1}{2}`                                      | Horizontal bar centered, numerator above          |
| VT-03  | `\sqrt{x+1}`                                       | Radical sign, overbar covers content              |
| VT-04  | `E = \frac{mc^2}{\sqrt{1-\frac{v^2}{c^2}}}`       | Complex nesting renders without overlap           |
| VT-05  | `\sum_{i=1}^{n} x_i`                               | Limits above/below sigma, correct sizing          |
| VT-06  | `\begin{pmatrix}a&b\\c&d\end{pmatrix}`             | Matrix aligned, parentheses sized                 |
| VT-07  | `\int_0^\infty e^{-x}\,dx`                         | Integral sign, limits, spacing                    |
| VT-08  | `\alpha + \beta = \gamma`                           | Greek letters render as correct glyphs            |
| VT-09  | `\left(\frac{a}{b}\right)^2`                       | Auto-sized parentheses match fraction height      |
| VT-10  | `e^{i\pi} + 1 = 0`                                | Overall aesthetic quality                         |
| VT-11  | `\nabla \times \vec{E} = -\frac{\partial B}{\partial t}` | Vector notation, partial derivatives      |
| VT-12  | `\begin{cases}x&\text{if }x>0\\-x&\text{if }x\leq0\end{cases}` | Cases environment layout        |

#### 6.3.3 Visual Inspection Criteria

For each visual test, evaluate:

- **Readability:** Can the expression be read at arm's length (~0.7m)?
- **Correctness:** Do all symbols match their LaTeX meaning?
- **Spacing:** Are elements neither cramped nor too spread apart?
- **Alignment:** Are baselines consistent across the expression?
- **Depth:** Do overlapping elements (e.g., radical over content) layer correctly?
- **Color/contrast:** Is the expression legible against the AR background?

#### 6.3.4 Regression Testing

Maintain a screenshot gallery (PNG files in `tests/visual/golden/`) for each visual test case. On each build:

1. Re-render all test expressions
2. Capture screenshots
3. Compare against golden images (manual review or automated SSIM)
4. Flag regressions where SSIM drops below 0.90 vs. golden

### 6.4 Performance Tests

| Test                             | Method                                    | Target                          |
|----------------------------------|-------------------------------------------|---------------------------------|
| KaTeX parse time (simple)        | `Date.now()` around `renderToString()`   | < 10ms                          |
| KaTeX parse time (complex)       | `Date.now()` around `renderToString()`   | < 50ms                          |
| Bridge conversion time           | Time from DOM tree to SVG string          | < 50ms                          |
| SpaceSVG render time             | Time from SVG string to scene objects     | < 100ms                         |
| Total pipeline (simple)          | End-to-end LaTeX to scene objects         | < 200ms                         |
| Total pipeline (complex)         | End-to-end LaTeX to scene objects         | < 500ms                         |
| Memory: KaTeX + font metrics     | Lens Studio profiler                      | < 1MB                           |
| Memory: SpaceDOM tree (complex)  | Estimate from node count                  | < 500KB                         |
| Scene object count               | Count created objects per expression      | < 200 for typical expression    |

---

## 7. Implementation Milestones

| Phase   | Deliverable                                                            | Duration (est.)  |
|---------|------------------------------------------------------------------------|------------------|
| Phase 0 | Import SpaceSVG + SpaceDOM into project; validate SpaceSVG renders hand-crafted SVG | 1 week |
| Phase 1 | SpaceDOM Adapter: wire SpaceDOM as KaTeX's document; add `style` shim; run KaTeX `renderToString()` successfully for basic expressions | 1-2 weeks |
| Phase 2 | KaTeX-to-SVG Bridge: implement class-to-SVG mapping for Priority 1 classes (`.mord`, `.mfrac`, `.msupsub`, `.sqrt`, `.base`, `.strut`) | 2 weeks |
| Phase 3 | Font glyph extraction: build tooling to extract SVG paths from KaTeX fonts; create GlyphTable | 1 week |
| Phase 4 | SpaceSVG integration: feed bridge SVG output to SpaceSVG, first visual render on Spectacles | 1 week |
| Phase 5 | Conformance test suite (automated, 50 expressions vs. MathJax reference) | 1 week |
| Phase 6 | Bridge expansion: remaining KaTeX CSS classes (`.mop`, `.delimsizing`, `.mtable`, `.vlist`) | 2 weeks |
| Phase 7 | Visual test harness on Spectacles; polish spacing/sizing | 1 week |
| Phase 8 | R5 (3D extensions) -- TikZ-subset parser + MeshBuilder integration | 3-4 weeks |

---

## 8. Risks and Mitigations

| Risk                                              | Impact | Mitigation                                                       |
|---------------------------------------------------|--------|------------------------------------------------------------------|
| KaTeX relies on DOM APIs SpaceDOM doesn't support | High   | Use `renderToString()` path (string-based, avoids measurement APIs). Add targeted shims for any gaps. Validate in Phase 1 before investing in bridge. |
| SpaceSVG cannot handle complex SVG paths          | High   | Validate early (Phase 0). Simplify paths with path optimization. If SpaceSVG is limited, extend it (it's our own library). |
| KaTeX CSS class semantics are complex to map      | Medium | Start with the 6 most common classes (covers 80% of expressions). Use KaTeX source code as reference for layout logic. |
| Font glyph extraction is incomplete               | Medium | Start with Latin, Greek, and operator glyphs (~200 characters). Expand as needed. Fall back to `<text>` elements for missing glyphs. |
| KaTeX + SpaceDOM memory exceeds Spectacles limits | Medium | Profile in Phase 1. If too large, consider lazy-loading KaTeX modules or pruning unused KaTeX features (e.g., chemistry, physics packages). |
| `renderToString()` output is harder to walk than live DOM | Low | Parse the HTML string back into SpaceDOM using `_registerParser` hook, or use regex-based extraction for the well-structured KaTeX output. |
| SpaceSVG performance degrades with many paths     | Medium | Batch glyphs into combined paths. Use instancing for repeated symbols. Cap scene object count. |

---

## 9. Open Questions

1. **KaTeX `render()` vs `renderToString()` path:** `render()` builds a live DOM tree (ideal for walking), but may call measurement APIs. `renderToString()` avoids measurement but returns a string that must be re-parsed. Which path works better with SpaceDOM should be determined in Phase 1.

2. **SpaceSVG capabilities:** What SVG features does SpaceSVG currently support? (`<path>`, `<text>`, `<g>` transforms, `<use>`, clip paths?) This must be validated in Phase 0.

3. **Font strategy:** Should we:
   - (a) Extract SVG paths from KaTeX's WOFF2 fonts and embed them in GlyphTable?
   - (b) Use Lens Studio `Text` components for characters and SpaceSVG only for symbols/lines?
   - (c) Use a system font and accept minor spacing differences?
   Option (a) gives the highest fidelity; option (b) is simplest; option (c) is a fast compromise.

4. **SpaceDOM `style` property:** KaTeX sets inline styles for positioning (`style.top`, `style.marginLeft`, etc.). SpaceDOM doesn't currently have a `.style` property. Options:
   - Add a minimal `.style` property bag to SpaceElement (preferred)
   - Extract style info from `setAttribute('style', ...)` calls in the bridge

5. **KaTeX version management:** Should we vendor KaTeX 0.16.22 as-is, or apply minimal patches? Vendoring unchanged maximizes upstream compatibility.

6. **Caching strategy:** Should rendered SVG strings or scene object trees be cached for repeated expressions?

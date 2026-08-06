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

> **Superseded in practice.** The SSIM approach below was designed around MathJax as the
> oracle, which forces fuzzy comparison because it's a *different engine*. The harness we
> actually built (`test/layout-conformance/`) uses **KaTeX in a real browser** instead.
> Because both sides traverse the same KaTeX DOM produced by the same KaTeX build, glyph
> correspondence is exact and deltas are measured directly in em — no rasterisation, no
> SSIM, no engine-difference tolerance. Every delta is unambiguously our bug. The browser
> supplies the CSS inline layout SpaceDOM cannot compute, which is exactly where the
> Phase 6.5 spacing defects live. Keep the method below in mind only if a second,
> independent oracle is ever wanted.

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

## 7. Implementation Status

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 0 | SpaceSVG + SpaceDOM imported and validated | ✅ Complete (10/10 tests) |
| 1 | SpaceDOM adapter + KaTeX `renderToString()` + `render()` working | ✅ Complete (14/14 tests) |
| 2 | KaTeX-to-scene bridge: mord, mfrac, msupsub, sqrt, base, strut | ✅ Complete (MVP renders fractions) |
| 2.5 | Additional constructs: superscript, subscript, Greek, italic variables, SVG radicals | ✅ Complete |
| 3 | KaTeX font metrics extracted and wired into walker | ✅ Complete (per-glyph widths from fontMetricsData.js) |
| 4 | Test harness: `MatematexValidator.ts` with 33 test cases | ✅ Complete (33/33 passing) |
| 5 | Named operators (`.mop` class handling for `\sin`, `\cos`, `\lim`, etc.) | ✅ Complete |
| 6 | Book of Math demo app: 60 theorems + splash/TOC + pinch navigation | ✅ Complete |
| 6.1 | Sqrt overbar fix: regex now matches both `H40000` (sqrtMain) and `H400000` (Size variants) | ✅ Complete |
| 6.2 | Book of Math v2: 80 formulas (+ Linear Algebra), `MathSearchIndex`, screen state machine, search-screen scaffold | ✅ Complete (UIKit migration pending) |
| 6.5 | Visual QA traversal of all 80 formulas — defect catalog (`phase6-visual-qa.md`) | ⏳ In progress |
| 6.6 | Bridge improvements: mbin/mrel spacing, big-op display-mode limits, `\mathbf` bold font, accent `left:` offset | ✅ Complete (P0 + P1, awaiting visual retest) |
| 6.6.x | Deferred bridge work: mtable rendering, delimiter auto-sizing, italic auto-calibration | ⏳ Planned (`matematex-porting-review.md`) |
| 6.7 | UIKit migration: `RectangleButton` swap, `TextInputField` for search, ASR mic | ⏳ Planned (`book-of-math-v2-plan.md`) |
| 7.0 | Visual proofs v1: typed primitive layer (line/polygon/circle/label/arrow), 3D-spatial rendering, Pythagoras as first proof | ✅ Complete (awaiting visual retest) |
| 7.0.1 | Proof renderer correctness pass: per-color cloned materials, CCW winding normalisation, z-step layering, bbox anchoring | ✅ Complete (awaiting visual retest) |
| 7.0.2 | Sample-scene repair: `@allowUndefined` on optional inputs, Chapter 4 button added and bound | ✅ Complete (lens runs, 80/80 validate) |
| 6.2b | **Layout conformance harness** (`test/layout-conformance/`) — per-glyph diff of the walker against KaTeX in a real browser, in em. Implements §6.2 with exact glyph correspondence instead of SSIM | ✅ Complete (all 80 measured) |
| 6.8 | Nested-fraction content loss fixed (`findRowFracLine`) + structural assertion in `validateAll` | ✅ Complete (80/80 intact, guard verified sensitive) |
| 6.9 | Layout conformance fix pass: italic-correction double-count, subscript vs superscript rule, `tightSpacings`, size multipliers, scriptspace, `nulldelimiter` width, `layoutWidthMargin` 1.18→1.0 | ✅ Complete (corpus 2% → 79% conformant; worst error 2.4em → 0.33em) |
| 6.9.1 | Harness fix: load every `@font-face` before measuring — KaTeX_Size2–4 were silently falling back to a system serif, poisoning every `\int`/`\sum`/`\left(` comparison | ✅ Complete (reversed an earlier wrong conclusion) |
| 6.10 | **Matrix / array support** (`mtable`): `arraycolsep` gutter width; cell layout already covered by the vlist walker. #66 restored to real `pmatrix` | ✅ Complete (3×3 and `vmatrix` PASS at 0.001em) |
| 6.7 | Search screen scaffolded in-scene: `MatematexSearchScreen` object + 16 UI children, scalar inputs wired, splash "Search" button bound, array inputs auto-wired from child names | ✅ Complete (no Inspector work; logs `auto-wired 6 topic chips` / `6 result rows`) |
| 6.11 | **FOV budget**: splash trimmed from 149 → 46 units tall, attribution moved to a new About page behind a toggle button, chapter buttons driven from the same y constants as the TOC rows | ✅ Complete (runtime `SAFE_HALF_HEIGHT` guard, verified it fires) |
| 7.1 | Additional proofs: circle area (#5), distance (#10), Heron (#13), difference of squares (#22) | ✅ Complete (catalog 1 → 5; `test/proof-data.test.ts` validates geometry outside Lens Studio) |
| 7.1.3 | **Proof mathematics verified**, not just renderability: `test/proof-math.test.ts` re-derives each claim from the authored coordinates — squares on the Pythagoras sides are checked to BE squares and to sit outside the triangle, the difference-of-squares pieces must tile a² and share an (a−b) edge, Heron must reproduce the drawn triangle's shoelace area, the circle's wedges must be equal. All 5 pass | ✅ Complete |
| 7.1.4 | **All five figures now argue rather than assert.** #1 rebuilt as the two-(a+b)²-squares rearrangement, #5 draws the wedges interleaved into the r × πr strip beside the disc, #13 draws the incircle that makes s−a, s−b, s−c geometric. #22 and #10 were already genuine | ✅ Complete |
| 7.1.1 | Proof gets its own screen with a `Proof` button, auto-scaled to the FOV budget via `fitBox` | ✅ Complete (the inline thumbnail hung to y −40, well past the ±27 the device shows) |
| 6.12 | **Formulas centred and width-fitted.** The walker lays out from x=0 rightward, so every formula sat entirely right of centre — #2 ran 17 units off the right edge with 34 units empty on the left; #10 lost half its width. Now offset by −width/2 and shrunk if wider than ±34 | ✅ Complete (only #40 and #78 need shrinking) |
| 7.1.2 | Inline proof thumbnail removed; proof title/caption reuse the name and chapter label slots instead of drawing over them | ✅ Complete |
| 6.13 | **Glyph scale calibrated against the em grid.** The pen advanced `emToWorld` = 5.0 world units per em while Text3D DREW 6.327 (upright) and 7.968 (italic) — so glyphs were 1.265x and 1.594x too big for the slots the pen left them. The upright `2`'s ink alone was wider than its whole advance; the italic `a`'s ink was 1.43x its advance. Fixed by `textScaleMultiplier` 5 → 3.951 and `italicScaleAdjust` 1.0 → 0.7957 | ✅ Complete (re-measured on device: drawn-em is now 5.00 for both fonts) |
| 7.2 | True 3D proofs (sphere volume via Cavalieri, cylinder/cone, polyhedra) — needs out-of-plane primitives | ⏳ Planned |
| 7.3 | TikZ-string parser → typed primitives (defer until proof catalog grows) | ⏳ Planned |

### Architecture divergence from original plan

The original design assumed an SVG intermediate format: `KaTeX DOM → SVG string → SpaceSVG → scene`. In practice, we adopted a **hybrid pipeline**:

- **Text characters** render via cloned `Component.Text3D` (not SVG glyph paths). Programmatic `createComponent('Component.Text')` doesn't work; cloning an editor-created template via `copyComponent()` does.
- **Fraction bars** render via `MeshBuilder` quads with a `RenderMeshVisual` (not SVG lines).
- **Sqrt radicals** render via SpaceSVG — the only path where we actually use the SVG intermediate. KaTeX emits real `<svg><path>` elements for radicals which we serialize and feed to SpaceSVG's mesh backend.

This hybrid approach proved simpler and more performant than a pure-SVG pipeline.

### Key findings

- **SpaceDOM provides everything KaTeX needs** — no forking or patching KaTeX source required. A small adapter (`.style` property bag, `compatMode` shim) was sufficient.
- **`copyComponent()` is essential for Text3D rendering** — programmatic `createComponent` produces non-rendering components.
- **`textScaleMultiplier` decouples layout from rendering scale** — layout uses em-based world units, text rendering uses SceneObject transform. A `layoutWidthMargin` fudge factor (~1.18) compensates for the mismatch.
- **Tier 3 "unsupported" features render via generic passthrough** — `\sum`, `\int`, matrices, `\lim` all produce readable output because KaTeX emits Unicode glyphs for them, even without dedicated walker handlers — though spacing and limits placement are not yet typographically correct.
- **KaTeX ships *two* sqrt SVG path families** with different overbar-end constants (`H40000` for sqrtMain, `H400000` for Size variants). The Phase 6.1 fix loosened the regex to `\d{5,}` to catch both.
- **Walker uses font metrics, not measured ink** — content widths from `cursorX` accumulate italic gaps and subscript padding. The pending-SVG handler now measures emitted text items' ink extents to size the radical correctly; the same technique could be generalized to other layout primitives.
- **`lineMaterial` is a shared asset — never write color into it.** `visual.mainPass` and `material.mainPass` both resolve to the *material*, so assigning a color there repaints every visual using that material. It's invisible for the bridge (every fraction bar is the same `textColor`) but it silently collapsed the proof layer to a single color. Multi-color geometry must either use `visual.mainPassOverrides` (per-visual) or its own `material.clone()`. `MatematexProof` now clones one material per distinct color and caches it per render.
- **Generated geometry must be wound consistently.** A quad built from `a→b` flips orientation with the line's direction, and hand-authored polygons arrive in both windings. Under a back-face-culling material that makes shapes vanish with no error. The proof renderer normalises every ring to counter-clockwise (front face toward +Z, toward the viewer) via a shoelace test before emitting indices.
- **Coplanar proof geometry z-fights.** Fills, their strokes, and labels all sat at z=0. The renderer now advances a small z bias per primitive in draw order (strokes half a step ahead of their own fill, labels a full step), which also makes the documented "later primitives render on top" actually true.
- **Author coordinates should not drive placement.** Proof figures are now positioned by their measured XY bounding box (`anchor: 'center' | 'top'`), so a proof whose author origin is a right-angle vertex still lands where the host asked. The Book of Math anchors the top edge below the chapter label, which keeps any future proof from colliding with it regardless of size.
- **"Optional" `@input`s need `@allowUndefined`.** Without it Lens Studio hard-fails the whole lens at runtime (`Input <name> was not provided`), not just the feature — the hint text saying "optional" has no effect on its own.

### Porting review

A current inventory of which KaTeX HTML constructs the bridge handles, what's partially supported, what's missing, and a prioritized improvement roadmap is in **[matematex-porting-review.md](./matematex-porting-review.md)**.

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


## Proof rigour — what the five figures establish

`test/proof-math.test.ts` checks that all five are mathematically TRUE. That is
a different question from whether they PROVE anything, and originally three of
them did not — they drew the identity and labelled it. All five now carry an
argument.

| # | the argument the figure makes |
|---|---|
| 1 | Two (a+b)² squares hold the same four copies of the a-b-c triangle, so the leftovers are equal: c² on the left, a²+b² on the right |
| 5 | The disc's twelve wedges, redrawn interleaved into a strip r tall and πr wide, so A = r · πr |
| 10 | The segment is the hypotenuse of a right triangle whose legs are the coordinate differences |
| 13 | The incircle cuts each side into s−a, s−b, s−c (side c visibly into (s−a)+(s−b)), and the three inradius slivers give A = r·s |
| 22 | a² dissected into a(a−b) + b(a−b) + b²; factoring (a−b) out of the two remaining pieces gives (a+b)(a−b) |

**What the tests verify.** Not renderability — `proof-data.test.ts` covers that —
but the claim itself, re-derived from the authored coordinates:

- #1: both outer squares are squares and equal in area; all eight triangles are
  mutually congruent and right-angled; each dissection tiles its square exactly
  (4·triangle + leftovers = the whole square, so no overlap or gap); the
  leftovers come out 25 and 9+16.
- #5: all 24 wedges are sectors of one radius and congruent to each other; the
  strip's apexes alternate 6-up / 6-down exactly r apart; six wedge pitches span
  πr, so r × πr = πr².
- #13: the inradius equals A/s; the incentre is exactly r from all three sides
  and each tangency falls strictly inside its side; the tangent lengths are
  s−a, s−b, s−c and (s−a)+(s−b) = c; and r² = (s−a)(s−b)(s−c)/s, the algebraic
  step the caption states.
- #22: the pieces tile a² exactly and share an (a−b) edge, without which the
  promised reassembly into (a+b)×(a−b) is impossible.
- #10: the legs are genuinely axis-parallel (or they are not coordinate
  differences), the angle between them is right, and the segment marked d joins
  the two labelled points.

**Where the figures stop.** #13 still needs one algebraic step the picture
cannot draw — r² = (s−a)(s−b)(s−c)/s — so the caption states it rather than
pretending the figure is a complete derivation. #5 is exact only in the limit;
twelve wedges leave the strip visibly scalloped, which is drawn honestly rather
than smoothed into a rectangle.

**Coverage.** 8 of 80 formulas have a proof.

## Phase 7.2 — spatial proofs

The renderer was already 2.5D: `toWorld` honoured a primitive's z, so anything
could be placed at any depth. What it could not do was draw a *solid*, for four
reasons, all now fixed:

| was | now |
|---|---|
| `drawFace` oriented winding by a shoelace sum on the **XY projection**, which collapses to zero for a face seen edge-on — a cube's side walls had their front decided by rounding noise | Newell normal, well defined in any plane, plus an explicit `outwardFrom` so a face turns away from the centre of its solid and stays correct from every angle |
| `drawLine` took its perpendicular as `(-dy, dx, 0)`, which is zero for a line running along z — **a cube's depth edges would not have drawn at all** | perpendicular from `cross(dir, +Z)`, falling back to `cross(dir, +Y)` when the line points at the viewer |
| `proofBounds` tracked only x and y, so fit-to-box ignored depth | bounds carry z; a spatial figure is fitted against the diagonal of its x-z footprint, since the viewer walks around it and that is its widest projection |
| the per-primitive `Z_STEP` bias that stops coplanar flat art z-fighting would **shear a solid** — six faces at 0.05 apart is 0.3 units of skew | `spatial: true` on a VisualProof switches the bias off; strokes instead ride proud along their face's own outward normal |
| an axis-aligned box drawn straight down the view axis **is a rectangle** — every face dead-on or edge-on, so the first render of #24 looked completely flat | `rotateProof` turns a spatial figure to a three-quarter view (yaw −32°, pitch 22°) before anything measures or draws it, bringing three faces of each box into sight |

Flat proofs are unaffected by construction: for a polygon in the XY plane the
Newell z-component is exactly twice the old signed area, so the orientation
decision is identical, and with zero depth the fit calculation reduces to the
old one.

`boxFaces()` / `boxEdges()` / `boxCentre()` build axis-aligned solids and set
`outwardFrom` themselves, so winding is never the author's problem. The test
suite checks the helper directly — a box is closed exactly when each of its 12
edges is shared by exactly 2 faces — because every future spatial proof is built
on it and one bad face ring would corrupt them all at once.

**#24 Difference of Cubes** is the first spatial proof, chosen to debug the
pipeline: it is the direct 3D analogue of #22, so the same tiling-and-volume
argument verifies it, and a fault in the new code shows up as arithmetic rather
than as a judgement call about a picture. The slabs are drawn pulled slightly
apart so the seams are visible; `CUBE_SLABS` holds their true positions and the
test checks tiling from those, so the visual gap cannot hide a real gap. It also
checks pairwise non-overlap — a decomposition that double-counts volume would
otherwise still sum correctly by luck.

### Two failure modes that only exist for solids

Neither is visible in any check of the mathematics, and both were live in the
first build of #24:

- **A piece can be completely hidden.** At the gap originally authored the b³
  corner sat squarely behind slab 3 along the view axis, and behind slab 1 as
  well. The figure was correct and the viewer could not see it. `proof-math`
  now casts a ray from each piece toward the viewer and intersects the filled
  triangles in front of it; the gap went from 0.55 to 1.3.

  A piece is sampled at every one of its face centroids and passes if ANY of
  them survives. Testing a single centroid was the first attempt and it condemns
  #8 outright: a closed solid always hides its own far side, and the bored cone
  is a cavity only ever seen through its opening. Pieces are grouped by an
  explicit `piece` tag, because `outwardFrom` cannot identify a cavity — no
  single point lies outside a cone's inner wall on every side, so those faces
  each carry their own reference and looked like hundreds of separate objects.

  Comparing piece centroid *depths* is the tempting version and it is wrong:
  after the view rotation, depth is dominated by x position, so an annotation
  lifted a hair off a face reads as being behind the whole face — that check
  passed #24 and failed #74, both incorrectly. Only filled geometry counts as an
  occluder, since a wireframe can be hidden but never hides. Verified against
  the real bug: at the original 0.55 gap the test reports `1 buried`.
- **Labels do not scale with the figure.** `createLabel` applies
  `templateScale` directly, so a label is a fixed world size no matter how far
  the fit-to-box calculation shrinks the drawing. At the 0.75 used on flat
  proofs, a seven-character label came out nearly half the width of the entire
  solid. Spatial labels are authored at 0.45.

- **An unlit material makes a solid a silhouette.** `MatematexUnlit` has no
  lighting term, so all six faces of a box drew the identical colour — turning
  the figure changed its outline and nothing else. Rather than depend on scene
  lights (the figure stands in a room the lens does not control), a Lambert term
  is baked into each face's colour from its own outward normal. The three faces
  visible in the default view come out at 0.62 / 0.71 / 0.87 of the base colour.
  A weak back-light keeps the three REAR faces at 0.47 / 0.49 / 0.54 rather than
  clamping them all to flat ambient, which would have moved the same problem to
  whoever walked round the back.
- **Transparent fills flatten a solid.** The flat proofs use 0.35-alpha fills;
  on a box that reads as tinted glass, and whatever shows through washes out the
  shading that gives the shape away. `opaque()` returns the same colour at full
  alpha for spatial use.
- **A label tinted to match its piece is invisible on that piece.** Amber text
  on an amber slab has no edge at all. Every proof label now draws a dark offset
  copy behind it (~0.06 em, scaling with the label), which also lifts pale
  labels off a bright passthrough background. Spatial labels are additionally
  lightened well clear of the shaded face they name.

- **A tilted face eats its own labels.** `|b| sin θ` rendered as `|b| si` and
  reads exactly like font clipping — it is not. `horizontalOverflow` on the
  Text3D template is already `Overflow` (0), so nothing truncates. What happened
  is that `spatial` switches off the Z_STEP that normally lifts a label off the
  geometry, and #74's parallelogram is tilted, so the part of the face to the
  right of the label sits NEARER the viewer and covers the tail of the text.
  Labels in a spatial proof are now floated to a plane in front of the whole
  figure, keeping their x and y so they still point at their piece.
- **Title and caption are drawn at a fixed world size**, so their character
  count alone decides whether they fit. #74's original 91-character caption ran
  off both edges of the display. `proof-data` now enforces a budget calibrated
  against a title that just fits — "Cross Product Magnitude", 23 characters at
  scale 1.2, spanning about half the ~68-unit safe width — with a 0.9 margin,
  giving 40 characters for a title and 69 for a caption.

`rotateProof` is checked to be a rigid motion — the other tests reason about the
unrotated coordinates while the renderer draws the rotated ones, which is only
sound if no distance changes. Worst drift across 96 points is 2.7e-15.

**#74 Cross Product Magnitude** is the second spatial proof, chosen because
nothing in it is axis-aligned — the parallelogram sits at a slant, the height
drops at an angle to it, and the product leaves the plane entirely. #24 was
axis-aligned throughout, so this is what exercises the Newell winding and the 3D
ribbon on arbitrary orientations.

It found a fourth 3D bug the cube never touched: `createArrow` measured its
length and built its head from `dx, dy` only. An arrow with depth had its head
and shaft-shortening scaled wrong, and an arrow along the view axis failed the
zero-length guard and **drew nothing at all** — which is precisely what a×b is.
Both the arrow and `drawLine` now share `viewPerp()`.

What the figure argues: the parallelogram has base |a|; dropping a perpendicular
from the tip of b makes a right triangle whose hypotenuse is b, so the height is
|b| sin θ; area is base times height. The product vector is drawn at its TRUE
length, so the reader can see it matches rather than being told. Identifying
|a×b| with that area is the definition of the cross product's magnitude — the
figure shows what the definition amounts to and the caption does not claim more.

**#8 Volume of a Sphere** — Archimedes, and the reason the spatial renderer
exists. A hemisphere beside a cylinder with a cone bored out of it: slice both
at height y and you get a disc of radius √(r²−y²) against an annulus from y out
to r, both of area π(r²−y²). Same at every height, so same volume — and the cut
cylinder's is one you already know, πr³ − πr³/3. This is the proof that cannot
be flattened at all: the argument compares cross-sections at every height, and a
plane figure has no heights to compare. The slices are drawn lifted out and set
down below their solids, because a cross-section left in place would be sealed
inside an opaque solid.

It needed a new primitive: `revolve()` turns a silhouette into a closed surface
of revolution, so a cylinder, a cone, a hemisphere and a flat disc are all just
different profiles. `facing: 'in'` is explicit rather than inferred, because a
cavity — the inner wall of a bored cone — is a surface whose visible side faces
the axis, and getting it wrong makes the surface vanish under back-face culling
rather than look wrong.

Two more things the earlier solids never exercised:

- **A flat cap has no interior direction at its own height.** `revolve` first
  used the axis point at each band's height as the "inside", which for a disc
  lies IN the disc — leaving the face with no side to turn away from. The
  reference is now the middle of the profile's height range.
- **Shading needed the true face normal.** It was using the direction from the
  reference point to the face centre, which coincides with the normal on a box
  and is badly skewed on anything tall or curved — a cylinder wall would shade
  as though every face pointed at the solid's midpoint. It now takes the Newell
  normal and only uses the reference for its sign.

The tests separate the mathematics from the picture. The identity is checked at
a tessellation fine enough not to be the limiting factor (hemisphere 16.75433 vs
cylinder−cone 16.75447, analytic 16.75516); what is DRAWN is then checked
against a tessellation budget (0.62% apart at 20 segments and 12 bands), plus
the requirement that an inscribed approximation must run UNDER the true volume,
which catches a reversed winding or a bad profile. At 362 faces it is by far the
heaviest proof — every face is its own SceneObject, so if device performance
becomes a problem this is where batching is needed.

### Remaining 3D candidates

Genuinely need depth: **#7** surface area of a sphere (Archimedes' hat-box — the
sphere and its circumscribed cylinder have equal lateral area), **#8** volume of
a sphere (cylinder minus double cone, by Cavalieri), **#9** volume of a cylinder,
**#18** Euler's polyhedron formula, **#74** cross product magnitude. Better in 3D
but provable flat: **#1** (lift the four triangles to show the rearrangement as
motion), **#5** (fan the wedges out of plane), **#27** (staircase of unit cubes).

### There is no theorem → proof mechanism

`PROOFS` is hand-authored data keyed by formula id, and nothing derives a figure
from the LaTeX. That is not a gap that can be closed: KaTeX yields the parse tree
of the *statement*, and automated provers yield symbolic derivations — neither
produces a picture. Choosing what to draw is a design act.

The work is not 80 independent problems, though. Classical visual proofs cluster
into a few families — area dissection (#1, #22, #23, #27, #33), volume dissection
(#24, #8), limit of dissection (#5, #7, #8), similar triangles (#3, #11, #12),
unit circle (#40, #49, #50), vector parallelogram (#34, #73, #74, #75) — and
parameterised templates for those would cover roughly 25–30 of the 80, reducing
each to instantiation plus label placement. The remainder splits into bespoke
proofs (#13 incircle, #21 completing the square, #45 FTC) and formulas with **no
sensible visual proof at all**: #57–60 are definitions or PDEs. Drawing anything
for those would be decoration, not argument.

That last list was drawn too wide on the first pass — it named #78–80 as
symbolic, and all three now have figures. See Phase 7.3.


## Phase 7.3 — closing the linear-algebra gap

The catalogue stopped at 59 proofs with 21 formulas recorded as *no witness*.
Nine of those 21 were linear algebra, which is not a plausible distribution: a
single chapter does not hold a disproportionate share of the unprovable
statements in mathematics. Re-reading them found **eight with genuine content**,
and one outright contradiction — the grammar's family-I section already listed
#61 as a member while its classification table filed the same formula as
**none**.

| # | was | now | witness |
|---|---|---|---|
| 42 | Chain Rule | F | three rulers geared together — the rise of one stage is the run of the next |
| 53 | L'Hôpital's Rule | D | two curves through one zero; near it each is its tangent, so the height ratio is the slope ratio |
| 61 | Matrix Multiplication | I | read A and B as edge tables: (AB)ᵢⱼ counts the routes i→k→j, partitioned by the middle node |
| 63 | Matrix Inverse | K | the unit square returns from either order — which is the theorem, since the definition only asks for one side |
| 68 | Cofactor Expansion | I | the 3! Leibniz terms split into three groups of two by which column row 1 uses |
| 70 | Characteristic Polynomial | K | sweep λ and the square's image flattens exactly where the determinant crosses zero |
| 72 | Trace of Product | I | nine products in a grid, added by rows (tr AB) and by columns (tr BA) |
| 79 | Spectral Decomposition | K | the SVD's figure with one rotation replaced by the other's transpose — and that difference is the content |

The thirteen that remain empty are definitions (#35 #51 #59 #62 #64 #71),
notational restatements (#30 #36 #44 #47) and physical postulates (#57 #58 #60).
**#64 Transpose stays empty on purpose**: a reflection across the diagonal draws
beautifully and asserts nothing, and the discipline that a figure hung on a
definition teaches the reader that figures are decoration is worth more than a
round number.

### What went wrong the first time

Two mistakes, made in opposite directions, and both now guarded by step 5 of the
decision procedure — *before recording none, state the theorem in words without
the notation; if the sentence could be false, there is something to draw*:

- **Reading the notation instead of the claim.** `tr(AB) = tr(BA)` was written
  off as a "symbolic index shuffle"; it says two sums over the same nine
  products agree, which is family I in its purest form. `det A = Σ (−1)^(i+j)
  aᵢⱼ Mᵢⱼ` was written off as "symbolic recursion"; it is a partition of a
  finite set of terms.
- **Assuming a shape for the figure, then concluding none existed.** The chain
  rule was refused for want of a "faithful planar witness", which presumed the
  figure had to be a graph of a composed function. Three parallel rulers do it
  in one picture, and the linking lines carry the argument.

### New invariants

- **`matrixGrid` / `unitSquareImage`** in `MathProofTemplates.ts`. Cells are
  separate quads rather than one rectangle with rules drawn across it, because
  the argument in every matrix proof is about *which cells group with which* and
  a grouping can only be coloured if the cells are real objects.
  `unitSquareImage` emits corners in the order 0, e₁, e₁+e₂, e₂ so the drawn
  winding carries the **sign** of the determinant — #70's whole point is that
  the sign flips between the two roots, and a figure that lost it would look
  identical.
- **#61, #68, #72** are checked by exhaustive enumeration: every route in the
  3×3 network, every one of the 3! permutation terms, and — for #72 — the nine
  drawn cell labels are *parsed* and required to be exactly {aᵢⱼ bⱼᵢ}. A grid
  quietly drawing aᵢⱼ bᵢⱼ would be completely convincing and completely wrong.
- **#63 and #70** are measured off the drawn polygons by shoelace rather than
  trusting their labels, so a stage built from mistyped columns fails.
- **Caret and underscore gate.** Reported as "#65's labels don't convert to
  LaTeX layout". They never could: proof labels are literal Text3D characters
  with no markup layer. The earlier fix, made when `e^(−r²)` was reported in
  #55, banned only `^{` and `^(` — so `A^T` passed and shipped in #65, #79 and
  #80. The rule is now the whole class, and 22 strings across 8 figures were
  rewritten: transposes to primes, `A^-1` to `inv(A)`, `S_n`/`a_n` to `S`/`an`,
  and #25's closed form moved into its caption as words. Figures using a prime
  carry a `' means transpose` legend, since the tick is small and in #65 it is
  the entire subject.
- **Label overlap gate** (`proof-data.test.ts`, all 67 figures). Two labels in
  one place render as an unreadable smear and every other check passes: correct
  maths, correct figure, correct text. It uses the narrow font-width estimate
  — 0.55 units per character against the 1.25 worst case used for the title
  budget — so it fails only on pairs that collide under any plausible metric.
  Spatial figures are exempt; their labels are anchored in 3D and turned before
  drawing, so an overlap in the authored XY says nothing about the screen. It
  found a pre-existing defect in **#10**, whose corner label and dimension label
  sat 0.2 units apart vertically with several units of text each.

**Catalogue: 67 proofs, 13 recorded as no witness.**

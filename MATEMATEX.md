# Using Matematex in your own Lens

Matematex renders LaTeX maths as real geometry inside a Lens Studio scene:
KaTeX does the typesetting, a walker turns its output into positioned glyphs and
rules, and a renderer clones Text 3D components and builds meshes for them. It
runs entirely on-device. No network, no render target, no WebView.

This is a working note for someone dropping it into a different project, written
around the things that will actually cost you a day. It is not API
documentation generated from the source; where the two disagree, the source
wins.

---

## 1. What you get, and what you don't

**You get** correct KaTeX layout. Not "close enough" — the pen positions are
diffed against KaTeX running in a real browser, 83 of 88 test formulas match to
about a thousandth of an em (see §7). Fractions, radicals, big operators,
sub/superscripts with italic correction, matrices, accents and scaled
delimiters all land where KaTeX puts them.

**You don't get** a text field. Matematex draws a formula; it has no notion of
editing, selection, reflow or line breaking. A formula is laid out once, as one
line, at one size. Long ones must be scaled to fit by the caller (§5.3).

**You don't get** colour inside a formula. `\textcolor` is parsed by KaTeX but
the renderer paints every glyph one colour. Per-run colour is possible — the
layout items carry the class list — but nobody has built it.

---

## 2. The files to copy

Everything lives in `Matematex/Assets/ProjectScripts/`. There is no package; you
copy files.

### Required — the renderer

| File | Lines | What it is |
|---|---|---|
| `katex_bundle.ts` | 18,560 | KaTeX 0.16.22 `dist/katex.mjs`, unmodified, `@ts-nocheck` |
| `SpaceDOM.ts` | 1,562 | A DOM implementation in pure TS. KaTeX needs a DOM; Lens Studio has none |
| `SpaceDOMAdapter.ts` | 94 | Installs SpaceDOM as the global `document` |
| `SpaceSVG.ts` | 1,420 | SVG path → mesh. KaTeX emits radicals and some rules as SVG |
| `MatematexBridge.ts` | 1,727 | The walker and the renderer — the actual library |
| `KaTeXFontMetrics.ts` | 111 | Font metric tables, transcribed from KaTeX's `fontMetricsData.js` |
| `MatematexTextColor.ts` | 80 | Tinting cloned text components. Small, and you need it |

Plus two fonts in `Assets/`: **`KaTeX_Main-Regular.ttf`** (52 KB) and
**`KaTeX_Math-Italic.ttf`** (31 KB). Import them and assign them (§3).

### Optional — things built on top

| File | What it is |
|---|---|
| `MatematexProof.ts` + `MathProofTemplates.ts` | A TikZ-ish primitive layer: lines, polygons, circles, arrows, labels, with baked shading for solids |
| `MatematexPage.ts` | A grid-paper sheet — paper fill, minor/major grid, border rule, four scene objects total |
| `MathSearchIndex.ts` | A tiny token-based search index over a formula list |

---

## 3. Scene setup

Four things must exist before anything renders.

**A Text 3D template.** A SceneObject carrying a `Component.Text3D`, created
**in the editor**. The renderer clones it per glyph with `copyComponent`. This
is not a preference — see §6.1.

**An unlit material** for the rules: fraction bars, radical strokes, and (if you
use it) proof geometry. The project ships `MatematexUnlit`.

**The fonts assigned.** The renderer takes `italicFont` and optionally
`mainFont` / `boldFont`. Without them Lens Studio falls back to its default face
and every advance width in the layout is wrong — the maths will look subtly
misaligned rather than obviously broken, which is worse.

**`installSpaceDOMAdapter()` called once**, before any KaTeX call.

---

## 4. Minimum viable render

```ts
import { installSpaceDOMAdapter, getSpaceDocument } from './SpaceDOMAdapter';
import { MatematexLayoutWalker, MatematexSceneRenderer } from './MatematexBridge';
// @ts-ignore — katex_bundle is @ts-nocheck
import katex from './katex_bundle';

installSpaceDOMAdapter();
const doc = getSpaceDocument();

// 1. KaTeX types the formula into an off-screen DOM.
const wrapper = doc.createElement('div');
katex.render('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', wrapper,
             { throwOnError: true, displayMode: true });

// 2. Find the .katex-html subtree. KaTeX also emits MathML for screen
//    readers; walking that instead gives you a pile of duplicated glyphs.
const html = findFirstWithClass(wrapper, 'katex-html');

// 3. Walk it into positioned items. emToWorld is how many world units one em
//    is: everything downstream is in these units.
const walker = new MatematexLayoutWalker();
const result = walker.layout(html, 5.0);
//   result.items    — positioned text / line / svg items
//   result.width    — total advance, world units
//   result.warnings — constructs the walker did not understand

// 4. Draw.
const renderer = new MatematexSceneRenderer();
renderer.render(
    result.items,
    parentSceneObject,
    10,                     // baseTextSize
    new vec4(1, 1, 1, 1),   // colour
    lineMaterial,
    templateTextComp,       // the cloned-from Text3D component
    templateScale,          // that object's local scale
    3.951,                  // textScaleMultiplier — see §6.2
    italicFont,
    boldFont,               // optional
    mainFont,               // optional
);

renderer.clear();           // before rendering the next formula
```

`findFirstWithClass` is four lines and appears in several files here; copy one.

---

## 5. The parts you will tune

### 5.1 `emToWorld` and `textScaleMultiplier` are a pair

`emToWorld` sets the layout scale. `textScaleMultiplier` sets how large a
cloned glyph *draws*. They ship as **5.0** and **3.951**, and 3.951 is
`5.0 / 1.2654` — the measured factor by which Text 3D over-draws relative to
the layout.

Change `emToWorld` and you **must** rescale `textScaleMultiplier` by the same
ratio, or every glyph will be the wrong size relative to the spacing the walker
computed, and the formula will look randomly letter-spaced.

### 5.2 `italicScaleAdjust`

`0.7957 = 935 / 1175`, the ratio of the two fonts' hhea ascent+descent spans.
Lens Studio fits that span to the requested size, so KaTeX_Math-Italic draws
1.2567× larger than KaTeX_Main at the same setting. It is read out of the font
headers, not fudged. If you swap fonts, recompute it.

### 5.3 Fitting a formula to a width

The renderer does not do this; the caller does. The pattern:

```ts
const shrink = result.width > measure ? measure / result.width : 1;
fit.getTransform().setLocalScale(new vec3(shrink, shrink, 1));
fit.getTransform().setLocalPosition(new vec3(-result.width * shrink / 2, 0, 0));
```

The walker lays out from x = 0 rightward, so the natural centre is `width / 2`,
not 0. Forgetting that is why wide formulas look "pushed over".

---

## 6. Six things that will cost you a day each

These are all real, all found the hard way, and none of them produce an error
message.

### 6.1 A Text 3D you create in script does not render

`sceneObject.createComponent('Component.Text3D')` succeeds, sets `.text`
without complaint, and draws nothing. The only reliable path is to clone an
editor-created component with `copyComponent`. That is why the renderer wants a
template object rather than making its own.

### 6.2 Text 3D colour is on the *material*, not on `textFill`

`Component.Text` (2D) has `textFill`. `Component.Text3D` does not — its colour
comes from its material, and Lens Studio's stock Text 3D material is a shader
graph with no `baseColor` at all: it has a front cap, a back cap, and inner and
outer edges, each with its own colour. Setting them all flat is what produces a
solid colour. `applyTextColor` does this, and caches one cloned material per
distinct colour on the source material. Use it; do not write to a shared
material's `mainPass` unless you want every glyph in the scene to change.

### 6.3 Pass state is not a `mainPassOverride`

`visual.mainPassOverrides.depthWrite = false` raises no error and does nothing.
Overrides carry shader *uniforms*; depth writing is pass *state*. It has to be
set on a pass you own: `material.clone()`, then `clone.mainPass.depthWrite`.

This one is worth internalising because the symptom is invisible geometry with
a perfectly healthy log. A sheet drawn behind content, with depth writing left
on, will z-cull everything behind it while still reporting that it built
successfully in 16 ms. Object counts and build times prove nothing about
visibility.

### 6.4 `@input` defaults must live in the decorator

`@input('float', '26') halfWidth: number;` — never
`@input halfWidth: number = 26;`. Lens Studio stores component inputs in the
scene and seeds them from the *decorator's* default string. A TypeScript field
initializer runs after the engine has already assigned the stored value, so it
is overwritten — and for an input with no decorator default, the stored value
is `0`. A component whose dimensions all arrive as 0 builds nothing and says
nothing.

Related: an optional `@input` needs `@allowUndefined`, or an unassigned one
takes down the whole lens at startup rather than just its own feature.

### 6.5 Text 3D centres its string

A label positioned at the left margin is *centred* there, so half of it hangs
off the page. Corner text has to be placed from its own measured width —
`getTextWidthEm(text, false, 'main') * emToWorld * scale` gives you that
exactly, using the same metric tables the layout uses.

### 6.6 A sibling `@component` may not be awake in your `onAwake`

Calling a method on one throws `TypeError: not a function`, then
`Component is not yet awake`, then `Rendering failed 5 times in a row` — the
lens dies on the first frame. Defer cross-component calls to `OnStartEvent`,
and guard with `typeof x.method === 'function'`.

---

## 7. Testing it without a headset

The layout code is deliberately free of Lens Studio types, so it runs under
node. That is the single most useful property of this codebase.

```
npx ts-node --transpile-only test/layout-conformance/dump-ours.ts --ids=all > ours.json
npx ts-node --transpile-only test/layout-conformance/compare.ts
```

`test/layout-conformance/` renders the same formulas in headless Chrome with a
byte-identical copy of the KaTeX build, and diffs **pen positions** — the start
of each glyph's advance box — in em units. Two notes if you extend it:

- Compare pen positions, never ink-box centres. `getBoundingClientRect()`
  returns the ink box, and a glyph's ink is not centred in its advance. The
  Size1–4 fonts have side bearings large enough that centre-to-centre
  comparison invents about an em of drift on every `\sum` formula.
- The reference must be the *same* KaTeX build as the bundle, or you are
  measuring version skew and calling it a bug.

`test/layout-conformance/page-fit-audit.ts` prices every formula against a page
width, which is how you decide a measure instead of guessing at one.

---

## 8. Attribution

- **KaTeX 0.16.22** — MIT, © Khan Academy and contributors. `katex_bundle.ts`
  is `dist/katex.mjs` unmodified; the fonts and the metric tables are theirs.
- **SpaceDOM / SpaceSVG** — from
  [Spectacles-polynode](https://github.com/IoTone/Spectacles-polynode).

If you ship a lens using this, KaTeX's MIT notice needs to travel with it.

---

## 9. Known limits

- **One line, one size.** No line breaking, no `\\` in display maths.
- **`cases` and `aligned`** are the two constructs still failing conformance
  (0.386 and 0.100 em). Neither appears in the shipping book. Everything else
  passes or warns under 0.025 em.
- **No per-run colour** inside a formula (§1).
- **Object count is the cost.** Every glyph is a SceneObject with a cloned
  component. A typical formula is 5–20; a dense proof figure is a few hundred.
  388 objects measured 15 ms to build and 57 ms end-to-end on device. If you
  need more than that on screen at once, batching into a single mesh is the
  fix, and it would cost you per-glyph colour.
- **`\textcolor`, `\class`, `\htmlId`** are parsed and ignored.

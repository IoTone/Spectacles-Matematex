// MatematexBridge.ts — Phase 2 KaTeX-to-Scene bridge
//
// Walks the SpaceDOM tree that KaTeX produces and creates Lens Studio scene
// objects. Hybrid rendering:
//   - Lens Studio Text components for characters (KaTeX outputs Unicode directly)
//   - Image quads for fraction bars
//   - SpaceSVG meshes for radicals and other <svg> blocks (Phase 2.5)
//
// The walker maintains a cursor (x, y, scale) and emits LayoutItems. The
// renderer takes those items and creates scene objects. Layout is one-pass
// with a small width-fixup for fraction bars.
//
// Phase 2 MVP supported constructs:
//   - mord text (single characters and Unicode)
//   - mord container (passthrough)
//   - mspace (horizontal spacing via marginRight)
//   - mrel (relation operators)
//   - mfrac (fractions, including the frac-line bar)
//   - msupsub (superscripts and subscripts via vlist)
//   - sizing (font scale via reset-sizeN sizeN classes)
//   - Multi-base sequences (E = mc^2)
//
// Not yet supported (will throw warnings):
//   - sqrt (Phase 2.5 — needs SVG path rendering via SpaceSVG)
//   - matrices (mtable)
//   - delimsizing (\left, \right)

import { installSpaceDOMAdapter, getSpaceDocument } from './SpaceDOMAdapter';
installSpaceDOMAdapter();

// @ts-ignore — katex_bundle has @ts-nocheck
import katex from './katex_bundle';

import {
    SpaceElement,
    SpaceText,
    SpaceNode,
    ELEMENT_NODE,
    TEXT_NODE,
    serializeNode,
} from './SpaceDOM';

import {
    SVGXMLParser,
    SpaceSVGMeshBackend,
} from './SpaceSVG';

import {
    getCharWidthEm,
    getTextWidthEm,
    getCharHeightEm,
    getCharItalicEm,
    getRunCenterEm,
    FontFamily,
} from './KaTeXFontMetrics';

/** Font assets for the KaTeX_Size1..Size4 faces, keyed by the family name the
 *  walker records on each item.
 *
 *  Separate from the italic/bold/main arguments because those are a WEIGHT and
 *  SLANT choice within one family, while these are different faces holding
 *  different glyphs — "∑" exists in none of Main, Italic or Bold, and a large
 *  operator laid out against Size2 has to be drawn from Size2 or its size is a
 *  lie. Anything unset simply falls back, so a caller that does not care about
 *  big operators can ignore this entirely. */
export interface SizeFonts {
    size1?: Font | null;
    size2?: Font | null;
    size3?: Font | null;
    size4?: Font | null;
}

// ─── LayoutItem types ────────────────────────────────────────

export interface LayoutBase {
    x: number;     // world units, visual center
    y: number;     // world units, visual center
    scale: number; // multiplier (1.0 = base size)
}

export interface TextLayoutItem extends LayoutBase {
    kind: 'text';
    text: string;
    italic: boolean;
    bold?: boolean;
    /** The advance width the layout actually used, in em, before `scale`.
     *
     *  Recorded rather than left to be recomputed. Only the walker knows which
     *  metrics table measured a glyph — a delimiter inside a `delimsizing size3`
     *  subtree is measured against KaTeX_Size3, and nothing downstream can tell
     *  from `{text, italic}` alone. Three separate call sites recomputed this
     *  with `getTextWidthEm(text, italic)` and so silently fell back to Main:
     *  the conformance dump, the radical's ink-extent scan, and the calibration
     *  probe. The conformance one reported every scaled delimiter as an error
     *  of half the Main-to-Size width difference — 0.174em for "(", 0.126em for
     *  "[" — which is 13 of the 24 failures, and all of them in the harness
     *  rather than in the layout. */
    widthEm: number;
    /** Which KaTeX face measured this run: 'size1'..'size4', or null for
     *  Main/Italic.
     *
     *  Recorded for exactly the reason `widthEm` is, and it was missing for
     *  exactly as long. The walker resolves the family from the CSS classes
     *  and uses it to MEASURE, then threw it away — so the renderer, which has
     *  to pick a Font asset, had only `{text, italic, bold}` to go on and put
     *  every glyph in Main. A display integral is laid out against Size2 (2.22
     *  em tall) and was drawn from Main (0.89 em): correctly spaced for a big
     *  glyph, drawn as a small one. That is the "short integral". */
    family?: FontFamily;
}

export interface LineLayoutItem extends LayoutBase {
    kind: 'line';
    width: number;     // world units
    thickness: number; // world units
}

export interface SVGLayoutItem extends LayoutBase {
    kind: 'svg';
    svgString: string; // serialized SVG markup
    width: number;     // world units
    height: number;    // world units
}

export type LayoutItem = TextLayoutItem | LineLayoutItem | SVGLayoutItem;

// ─── Helpers ─────────────────────────────────────────────────

function getClasses(el: SpaceElement): string[] {
    const c = el.getAttribute('class');
    return c ? c.split(/\s+/).filter(s => s.length > 0) : [];
}

function hasClass(el: SpaceElement, cls: string): boolean {
    return getClasses(el).indexOf(cls) >= 0;
}

function getStyle(el: SpaceElement, prop: string): string | null {
    const styleObj = (el as any)._style;
    if (!styleObj) return null;
    const val = styleObj[prop];
    return val == null ? null : String(val);
}

function parseEm(value: string | null): number {
    if (!value) return 0;
    const m = value.match(/(-?[\d.]+)em/);
    if (!m) return 0;
    return parseFloat(m[1]);
}

// KaTeX size classes — multiplier relative to size6 (= 1.0).
// Verbatim from KaTeX/src/Options.js `sizeMultipliers`, indexed size-1:
//   [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.44, 1.728, 2.074, 2.488]
// size2..size5 were previously shifted one slot too large, which made every
// script-style glyph render at 0.8 where KaTeX uses 0.7 (scriptstyle = size3).
const SIZE_FACTORS: { [key: string]: number } = {
    size1: 0.5,
    size2: 0.6,
    size3: 0.7,
    size4: 0.8,
    size5: 0.9,
    size6: 1.0,
    size7: 1.2,
    size8: 1.44,
    size9: 1.728,
    size10: 2.074,
    size11: 2.488,
};

// ─── KaTeX inter-atom spacing matrix ────────────────────────────────────
// KaTeX's spacing model: every atom has a class (ord, op, bin, rel, open,
// close, punct, inner) and the TeXbook-spec gap between consecutive atoms
// depends on their pair. KaTeX usually emits explicit <mspace> elements
// with inline marginRight to realize these gaps, but some KaTeX rendering
// paths rely on CSS rules (which SpaceDOM doesn't compute). We apply the
// matrix defensively in walkChildren — only injecting the *missing* portion
// after subtracting any margin KaTeX already emitted.
//
// Values from KaTeX/buildCommon.js spacings (textstyle/displaystyle):
// 0.167em = thin (3mu), 0.222em = med (4mu), 0.278em = thick (5mu).
// Cells with 0 gap are omitted (no entry → 0).
type AtomClass = 'ord' | 'op' | 'bin' | 'rel' | 'open' | 'close' | 'punct' | 'inner' | 'space' | 'other';

const ATOM_SPACING_EM: { [pair: string]: number } = {
    'ord-op':    0.167, 'ord-bin':   0.222, 'ord-rel':   0.278, 'ord-inner': 0.167,
    'op-ord':    0.167, 'op-op':     0.167, 'op-rel':    0.278, 'op-inner':  0.167,
    'bin-ord':   0.222, 'bin-op':    0.222, 'bin-open':  0.222, 'bin-inner': 0.222,
    'rel-ord':   0.278, 'rel-op':    0.278, 'rel-open':  0.278, 'rel-inner': 0.278,
    'close-op':  0.167, 'close-bin': 0.222, 'close-rel': 0.278, 'close-inner': 0.167,
    'punct-ord':   0.167, 'punct-op':    0.167, 'punct-rel':   0.167,
    'punct-open':  0.167, 'punct-close': 0.167, 'punct-punct': 0.167, 'punct-inner': 0.167,
    'inner-ord':   0.167, 'inner-op':    0.167, 'inner-bin':   0.222,
    'inner-rel':   0.278, 'inner-open':  0.167, 'inner-punct': 0.167, 'inner-inner': 0.167,
};

// Script and scriptscript styles use a REDUCED spacing table: TeX drops the
// medium (bin) and thick (rel) spaces entirely, keeping only thin spaces
// adjacent to large operators. Verbatim from KaTeX/src/spacingData.js
// `tightSpacings`; KaTeX selects it with `node.hasClass("mtight")`, which is
// exactly the marker we test for.
//
// Without this the walker injected a full 0.222em around every `-` inside a
// subscript like `F_{n-1}`, where KaTeX emits no glue at all.
const TIGHT_ATOM_SPACING_EM: { [pair: string]: number } = {
    'ord-op': 0.167,
    'op-ord': 0.167, 'op-op': 0.167,
    'close-op': 0.167,
    'inner-op': 0.167,
};

function getAtomClass(el: SpaceElement): AtomClass {
    const c = getClasses(el);
    if (c.indexOf('mspace') >= 0) return 'space';
    if (c.indexOf('mord') >= 0) return 'ord';
    if (c.indexOf('mop') >= 0) return 'op';
    if (c.indexOf('mbin') >= 0) return 'bin';
    if (c.indexOf('mrel') >= 0) return 'rel';
    if (c.indexOf('mopen') >= 0) return 'open';
    if (c.indexOf('mclose') >= 0) return 'close';
    if (c.indexOf('mpunct') >= 0) return 'punct';
    if (c.indexOf('minner') >= 0) return 'inner';
    return 'other';
}

function sizingMultiplier(classes: string[]): number {
    let resetSize = 1.0;
    let newSize = 1.0;
    for (const c of classes) {
        if (c.indexOf('reset-size') === 0) {
            const key = c.substring('reset-'.length);
            if (SIZE_FACTORS[key] !== undefined) {
                resetSize = SIZE_FACTORS[key];
            }
        } else if (SIZE_FACTORS[c] !== undefined) {
            newSize = SIZE_FACTORS[c];
        }
    }
    return newSize / resetSize;
}

// Approximate text width in em units. Without a font measurement API we use
// rough per-character widths; close enough for layout. Refine with KaTeX
// font metrics in a later phase.
function approxTextWidthEm(text: string): number {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        if (/[ilj.,;:'!()\[\]\-]/.test(ch)) {
            width += 0.30;
        } else if (/[mwM]/.test(ch)) {
            width += 0.85;
        } else if (/[A-Z]/.test(ch)) {
            width += 0.70;
        } else if (/[=+\-*\/<>]/.test(ch)) {
            width += 0.65;
        } else {
            width += 0.55;
        }
    }
    return width;
}

// Elements that carry no ink — pure layout scaffolding KaTeX uses for sizing
// and alignment. The walker skips them; `countRenderableTextNodes` must skip
// exactly the same set or the structural check below produces false alarms.
const SKIP_CLASSES = ['strut', 'pstrut', 'vlist-s'];

// `\nulldelimiterspace` — the empty delimiter slot KaTeX puts on both sides of
// a \frac, \binom, etc. It draws nothing but it is NOT free: katex.scss sets
// `.nulldelimiter { width: $nulldelimiterspace }` with
// `$nulldelimiterspace: calc(1.2em / $ptperem)` and `$ptperem: 10` → 0.12em.
// Treating it as skippable made every fraction 0.24em too narrow.
const NULLDELIMITER_EM = 0.12;

/** Count the text nodes KaTeX expects to be rendered, i.e. how many `text`
 *  LayoutItems a correct walk of this tree must produce.
 *
 *  Compare against the walker's actual output to detect **silent content
 *  loss** — a whole subtree dropped because a container was misclassified.
 *  `validateAll` cannot catch that on its own: it only asserts that *some*
 *  items were emitted, so a formula missing its entire radicand still reports
 *  a pass. (That is exactly how the #56 Lorentz Factor bug survived.)
 *
 *  The walk mirrors `MatematexLayoutWalker.walk`: same skip classes, same
 *  zero-width-space filter, one item per text node. */
export function countRenderableTextNodes(root: SpaceNode): number {
    let n = 0;
    const visit = (node: SpaceNode): void => {
        if (node.nodeType === TEXT_NODE) {
            const text = (node as SpaceText).data;
            if (text && text.length > 0 && text !== '​') n++;
            return;
        }
        if (node.nodeType !== ELEMENT_NODE) return;
        const el = node as SpaceElement;
        const classes = getClasses(el);
        for (const c of SKIP_CLASSES) {
            if (classes.indexOf(c) >= 0) return;
        }
        for (const child of el._childNodes) visit(child);
    };
    visit(root);
    return n;
}

export { applyTextColor } from './MatematexTextColor';
import { applyTextColor } from './MatematexTextColor';

// ─── Walker ──────────────────────────────────────────────────

// Which KaTeX_Size* font a class selects, per katex.scss. Applied by
// font-FAMILY at font-size 1em, so the element still reports scale 1.0 while
// its glyphs are materially wider than the KaTeX_Main equivalents (a size3
// "(" advances 0.736em vs Main's 0.389em; "∑" isn't in Main at all).
function sizeFamilyFor(classes: string[]): string | null {
    if (classes.indexOf('delimsizing') >= 0) {
        for (const n of ['size1', 'size2', 'size3', 'size4']) {
            if (classes.indexOf(n) >= 0) return n;
        }
    }
    if (classes.indexOf('delim-size1') >= 0) return 'size1';
    if (classes.indexOf('delim-size4') >= 0) return 'size4';

    // katex.scss: `.op-symbol.small-op` is KaTeX_Size1, `.large-op` is Size2.
    // "∑" is not in KaTeX_Main at all, so without this a large operator was
    // measured by getCharWidthEm's 0.5em last-resort fallback.
    if (classes.indexOf('op-symbol') >= 0) {
        if (classes.indexOf('large-op') >= 0) return 'size2';
        if (classes.indexOf('small-op') >= 0) return 'size1';
    }
    return null;
}

interface WalkContext {
    cursorX: number;
    baselineY: number;
    scale: number;
    emToWorld: number;
    italic: boolean;
    bold: boolean;
    /** Active KaTeX_Size* variant ('size1'..'size4'), or null for Main/Italic. */
    fontFamily: string | null;
    /** Set while walking an `msupsub`, so the vlist it wraps knows not to
     *  centre its rows. Consumed by the vlist immediately inside, so a fraction
     *  nested within a superscript still centres normally. */
    inSupSub: boolean;
}

interface WalkResult {
    items: LayoutItem[];
    width: number;
    warnings: string[];
}

export class MatematexLayoutWalker {
    private items: LayoutItem[] = [];
    private warnings: string[] = [];
    private seenUnhandledTags: { [key: string]: boolean } = {};
    private _pendingSVG: { el: SpaceElement; ctx: WalkContext } | null = null;
    // Multiplier on a fraction's total width (and therefore its bar). KaTeX's
    // `.frac-line { width: 100% }` means the bar spans the vlist exactly, so
    // the layout-faithful value is 1.0.
    //
    // It was 1.18 — a fudge that existed to hide the missing 0.24em of
    // `nulldelimiter` padding on either side of every fraction. With the
    // nulldelimiters now measured properly, 1.18 overshoots badly (56% of the
    // corpus conformant vs 89% at 1.0). Treat any value above 1.0 as a
    // rendering compensator, not layout.
    _layoutWidthMargin: number = 1.0;
    // 1.0 = trust the measured content width. Was 0.5 to compensate for the
    // walker overshooting the radicand, which the Phase 6.1 overbar-clip fix and
    // the nulldelimiter/scriptspace corrections removed the need for. Three
    // different values used to coexist here, in the @input, and in the scene.
    _sqrtWidthScale: number = 1.0;
    // Extra gap forced after every italic glyph. Purely a RENDERING compensator
    // for fonts whose drawn glyphs are wider than KaTeX's metrics predict — it
    // has no basis in TeX layout, and it used to be 0.12em, which made it the
    // single largest source of horizontal drift versus real KaTeX (~0.12em per
    // italic glyph, accumulating to ~0.7em across a formula).
    //
    // Now 0: the genuine italic correction arrives from KaTeX's own inline
    // margins (see emitText), so padding on top of it was double-counting.
    // Raise this only if italic glyphs visibly collide on device, and prefer
    // correcting `italicScaleAdjust` on the renderer instead.
    _italicMinGapEm: number = 0;
    verbose: boolean = false;

    layout(katexHtmlRoot: SpaceElement, emToWorld: number): WalkResult {
        this.items = [];
        this.warnings = [];
        this.seenUnhandledTags = {};

        const ctx: WalkContext = {
            cursorX: 0,
            baselineY: 0,
            scale: 1.0,
            emToWorld,
            italic: false,
            bold: false,
            fontFamily: null,
            inSupSub: false,
        };

        this.walk(katexHtmlRoot, ctx);

        return {
            items: this.items,
            width: ctx.cursorX,
            warnings: this.warnings,
        };
    }

    private warn(msg: string): void {
        if (!this.seenUnhandledTags[msg]) {
            this.seenUnhandledTags[msg] = true;
            this.warnings.push(msg);
        }
    }

    private walk(node: SpaceNode, ctx: WalkContext): void {
        if (node.nodeType === TEXT_NODE) {
            const text = (node as SpaceText).data;
            // Skip empty and zero-width-space text
            if (text && text.length > 0 && text !== '\u200B') {
                this.emitText(text, ctx);
            }
            return;
        }

        if (node.nodeType !== ELEMENT_NODE) return;

        const el = node as SpaceElement;
        const tag = el.localName;
        const classes = getClasses(el);

        // Skip invisible structural elements entirely.
        if (this.shouldSkip(tag, classes)) return;

        // Empty delimiter slot: draws nothing, occupies 0.12em. Must advance
        // the cursor or the enclosing fraction comes out too narrow and every
        // glyph after it drifts left.
        if (classes.indexOf('nulldelimiter') >= 0) {
            ctx.cursorX += NULLDELIMITER_EM * ctx.emToWorld * ctx.scale;
            return;
        }

        // Column gutter inside an array/matrix. Empty span, no CSS width — the
        // measurement is an inline `width` (0.5em by default, and KaTeX emits
        // TWO of them per gutter). Skipping them left every matrix exactly 1em
        // per column gap too narrow.
        if (classes.indexOf('arraycolsep') >= 0) {
            ctx.cursorX += parseEm(getStyle(el, 'width')) * ctx.emToWorld * ctx.scale;
            return;
        }

        // SVG blocks (e.g., sqrt radical) — defer emission until the parent
        // vlist finishes walking so we know the actual content width. The
        // radical overbar must span ALL content, not just a fixed estimate.
        if (tag === 'svg') {
            this._pendingSVG = {
                el,
                ctx: { ...ctx }, // snapshot the context
            };
            return;
        }

        // Apply marginLeft and paddingLeft before walking children.
        // KaTeX uses marginLeft for spacing and paddingLeft inside sqrt
        // to offset content past the radical stem.
        // KaTeX also uses `left:` (negative or positive em) on accent-body
        // spans to fine-tune horizontal placement of accent glyphs over
        // their base (e.g. `\hat{H}` uses left:-0.25em).
        const cursorBeforeOffsets = ctx.cursorX;
        const marginLeft = parseEm(getStyle(el, 'marginLeft'));
        const paddingLeft = parseEm(getStyle(el, 'paddingLeft'));
        const leftOffset = parseEm(getStyle(el, 'left'));
        if (marginLeft) {
            ctx.cursorX += marginLeft * ctx.emToWorld * ctx.scale;
        }
        if (paddingLeft) {
            ctx.cursorX += paddingLeft * ctx.emToWorld * ctx.scale;
        }
        if (leftOffset) {
            ctx.cursorX += leftOffset * ctx.emToWorld * ctx.scale;
        }
        const marginRight = parseEm(getStyle(el, 'marginRight'));

        // Entering a KaTeX_Size* subtree (large operator or scaled delimiter)
        // switches which metrics table measures its glyphs. Scoped to the
        // subtree and restored on every exit path, like `sizing` and italic.
        const sizeFamily = sizeFamilyFor(classes);
        const savedFamily = ctx.fontFamily;
        if (sizeFamily) ctx.fontFamily = sizeFamily;
        // Rides the same save/restore as the font family: `msupsub` is always
        // exactly one span above the vlist whose rows must not be centred.
        const savedSupSub = ctx.inSupSub;
        if (classes.indexOf('msupsub') >= 0) ctx.inSupSub = true;
        const restoreFamily = () => {
            ctx.fontFamily = savedFamily;
            ctx.inSupSub = savedSupSub;
        };

        // Accent body: draws, but occupies no width.
        //
        // katex.scss says so outright — `.accent-body:not(.accent-full)
        // { width: 0 }` — and accent.js positions the glyph with
        // `left = skew − accentWidth/2` on a `position: relative` box. So the
        // hat over `\hat{H}` overhangs a zero-width slot: it is drawn at the
        // slot's origin plus `left`, and the slot contributes nothing to the
        // row. Counting the glyph's 0.5em advance made the accent row measure
        // 0.31em instead of 0, which then fed the vlist centring and left the
        // hat 0.156em short of the middle of the H.
        //
        // The cursor is restored to before `left` as well as before the glyph:
        // `position: relative` shifts what is painted, never what follows.
        if (classes.indexOf('accent-body') >= 0 && classes.indexOf('accent-full') < 0) {
            this.walkChildren(el, ctx);
            ctx.cursorX = cursorBeforeOffsets;
            restoreFamily();
            return;
        }

        // mspace: explicit horizontal space, no children to walk
        if (hasClass(el, 'mspace')) {
            ctx.cursorX += marginRight * ctx.emToWorld * ctx.scale;
            restoreFamily();
            return;
        }

        // sizing: scale all descendants, then restore
        if (hasClass(el, 'sizing')) {
            const mult = sizingMultiplier(classes);
            const savedScale = ctx.scale;
            ctx.scale = ctx.scale * mult;
            this.walkChildren(el, ctx);
            ctx.scale = savedScale;
            if (marginRight) {
                ctx.cursorX += marginRight * ctx.emToWorld * ctx.scale;
            }
            restoreFamily();
            return;
        }

        // vlist-t: vertical stacking primitive (used by mfrac, msupsub)
        if (hasClass(el, 'vlist-t')) {
            this.walkVlistGroup(el, ctx);
            if (marginRight) {
                ctx.cursorX += marginRight * ctx.emToWorld * ctx.scale;
            }
            restoreFamily();
            return;
        }

        // Named operators (\sin, \cos, \lim, etc.) use class "mop".
        // These must render as UPRIGHT text, never italic.
        if (hasClass(el, 'mop')) {
            const savedItalic = ctx.italic;
            ctx.italic = false;
            this.walkChildren(el, ctx);
            ctx.italic = savedItalic;
            if (marginRight) {
                ctx.cursorX += marginRight * ctx.emToWorld * ctx.scale;
            }
            restoreFamily();
            return;
        }

        // Track italic state: KaTeX uses class "mathnormal" for italic
        // math variables (x, y, z, etc.) and "mathit" for explicit italic.
        // Track bold state via "mathbf" (and the legacy "boldsymbol" alias).
        const isItalicContainer = hasClass(el, 'mathnormal') || hasClass(el, 'mathit');
        const isBoldContainer = hasClass(el, 'mathbf') || hasClass(el, 'boldsymbol');
        if (isItalicContainer || isBoldContainer) {
            const savedItalic = ctx.italic;
            const savedBold = ctx.bold;
            if (isItalicContainer) ctx.italic = true;
            if (isBoldContainer) ctx.bold = true;
            this.walkChildren(el, ctx);
            ctx.italic = savedItalic;
            ctx.bold = savedBold;
        } else {
            // Default: passthrough container
            this.walkChildren(el, ctx);
        }

        if (marginRight) {
            ctx.cursorX += marginRight * ctx.emToWorld * ctx.scale;
        }
        restoreFamily();
    }

    private walkChildren(el: SpaceElement, ctx: WalkContext): void {
        // Track the previous sibling's atom class and the cursor advance KaTeX
        // already emitted after it (via mspace's marginRight, or the atom's
        // own marginRight). Before walking each new atom, inject the KaTeX
        // spacing matrix's required gap, minus what KaTeX already added.
        let prevAtomClass: AtomClass | null = null;
        let prevTrailingEm: number = 0;

        for (const child of el._childNodes) {
            if (child.nodeType !== ELEMENT_NODE) {
                this.walk(child, ctx);
                continue;
            }
            const childEl = child as SpaceElement;
            const tag = childEl.localName;
            const classes = getClasses(childEl);

            if (this.shouldSkip(tag, classes)) {
                this.walk(child, ctx);
                continue;
            }

            const currAtomClass = getAtomClass(childEl);

            // Inject inter-atom gap when both sides are real atom classes.
            // Skip when prev was an mspace (KaTeX already provided the gap)
            // or 'other' (structural span — no atom semantics).
            if (
                prevAtomClass !== null &&
                prevAtomClass !== 'space' &&
                prevAtomClass !== 'other' &&
                currAtomClass !== 'space' &&
                currAtomClass !== 'other'
            ) {
                // KaTeX picks the table from the RIGHT-hand atom's own
                // `mtight` class (buildHTML.js), not from an inherited style.
                const table = hasClass(childEl, 'mtight')
                    ? TIGHT_ATOM_SPACING_EM
                    : ATOM_SPACING_EM;
                const wantEm = table[`${prevAtomClass}-${currAtomClass}`] || 0;
                const needEm = wantEm - prevTrailingEm;
                if (needEm > 0) {
                    ctx.cursorX += needEm * ctx.emToWorld * ctx.scale;
                }
            }

            this.walk(child, ctx);

            // Record this child's trailing margin so the next iteration
            // doesn't double-apply the gap. mspace's full advance is captured
            // in its marginRight attribute; same for atom containers that
            // KaTeX inline-margins.
            prevAtomClass = currAtomClass;
            prevTrailingEm = parseEm(getStyle(childEl, 'marginRight'));
        }
    }

    private shouldSkip(tag: string, classes: string[]): boolean {
        for (const c of SKIP_CLASSES) {
            if (classes.indexOf(c) >= 0) return true;
        }
        return false;
    }

    private emitText(text: string, ctx: WalkContext): void {
        // Convention: x and y are the VISUAL CENTER of the rendered text.
        //
        // X: use KaTeX's real font metrics for per-glyph widths.
        // Y: use a FIXED baseline-to-center offset based on x-height (0.43em),
        //    NOT per-character height. Per-character height varies (e.g., "i" is
        //    taller than "s" due to its dot) which causes characters on the same
        //    line to render at different y positions. Using x-height keeps them aligned.
        const widthEm = getTextWidthEm(text, ctx.italic, ctx.fontFamily, ctx.bold);
        const widthWorld = widthEm * ctx.emToWorld * ctx.scale;
        const centerX = ctx.cursorX + widthWorld / 2;

        // Vertical placement, MEASURED rather than assumed.
        //
        // The template Text 3D is centre-aligned, so an item's y is the centre
        // of the drawn box, not its baseline. This used to convert with a fixed
        // `0.43 / 2` — "the standard x-height for KaTeX fonts" — which is only
        // correct for a run with no ascender and no descender.
        //
        // A named operator breaks that on the first letter: "sin" reaches the
        // dot of its `i` at 0.668 em, so its centre is 0.334 em above the
        // baseline, not 0.215. Pinned at 0.215 the whole word was drawn low by
        // the difference, which is the sagging \sin / \log / \cos on device.
        //
        // Taken over the RUN, not per character. A run is one Text 3D object
        // and needs one height; per-character would land the `i` and the `s` of
        // "sin" at different heights, which is the failure the fixed constant
        // was chosen to avoid in the first place.
        const centerEm = getRunCenterEm(text, ctx.italic, ctx.fontFamily, ctx.bold);
        const centerY = ctx.baselineY + centerEm * ctx.emToWorld * ctx.scale;

        this.items.push({
            kind: 'text',
            text,
            x: centerX,
            y: centerY,
            scale: ctx.scale,
            italic: ctx.italic,
            bold: ctx.bold,
            widthEm,
            family: ctx.fontFamily,
        });

        ctx.cursorX += widthWorld;

        // Italic correction is NOT applied here. KaTeX already emits it as an
        // inline `margin-right` on the glyph's own span (e.g. `F` carries
        // margin-right:0.1389em), which `walk()` applies — adding it again here
        // double-counted it. KaTeX also *cancels* that correction for
        // subscripts via a negative `margin-left` on the subscript row, which
        // only works if the correction arrives from KaTeX's own markup rather
        // than being synthesised per-glyph. See walkVlistGroup.
        //
        // `_italicMinGapEm` survives purely as a RENDERING compensator for
        // fonts whose drawn glyphs are wider than KaTeX's metrics predict. It
        // defaults to 0 (faithful layout); raise it only if italic glyphs
        // visibly collide on device, and prefer fixing `italicScaleAdjust`.
        if (ctx.italic && this._italicMinGapEm > 0 && text.length > 0) {
            ctx.cursorX += this._italicMinGapEm * ctx.emToWorld * ctx.scale;
        }
    }

    private emitSVGWithContentWidth(
        svgEl: SpaceElement,
        ctx: WalkContext,
        contentWidthWorld: number,
    ): number {
        // KaTeX's sqrt SVG uses viewBox="0 0 400000 1080" with width="400em".
        // The radical checkmark sits at x≈0-850 in viewBox coords, and the
        // overbar starts at x≈834 extending to 400000.
        //
        // We clip the overbar to match the actual content width. The radical
        // stem is ~0.85em (850 vb units). The content width is now KNOWN
        // from the vlist walk. We add a small overhang (0.1em).
        const heightAttr = svgEl.getAttribute('height') || '1em';
        const heightEm = parseEm(heightAttr) || 1.0;
        const heightWorld = heightEm * ctx.emToWorld * ctx.scale;

        // Read the ORIGINAL viewBox to preserve its aspect ratio.
        // KaTeX uses different sqrt SVGs for different content heights:
        //   sqrtMain:  viewBox 0 0 400000 1080  (heightEm ≈ 1.08)
        //   sqrtMain2: viewBox 0 0 400000 1440  (heightEm ≈ 1.44)
        //   sqrtMain3: viewBox 0 0 400000 1800  (heightEm ≈ 1.80)
        //   sqrtMain4: viewBox 0 0 400000 2400  (heightEm ≈ 2.40)
        // Hardcoding 1080 distorts the aspect ratio for taller content,
        // causing SpaceSVG to render the overbar dramatically wider than it should.
        const originalVB = svgEl.getAttribute('viewBox') || '0 0 400000 1080';
        const vbParts = originalVB.split(/\s+/).map(parseFloat);
        const originalVBHeight = (vbParts.length >= 4 && !isNaN(vbParts[3])) ? vbParts[3] : 1080;

        // Convert content width from world units back to em, then to viewBox units.
        // contentWidthWorld already includes paddingLeft (~0.833em) which is the
        // radical-stem reservation.
        //
        // For long/complex content, the walker's metric-based width overshoots
        // the actual rendered visual width (italic gaps accumulate, render scale
        // differs from metric scale). Apply `_sqrtWidthScale` to compensate.
        const overhangEm = 0.05;
        const contentWidthEm = contentWidthWorld / (ctx.emToWorld * ctx.scale);
        const rawWidthEm = contentWidthEm + overhangEm;
        const widthEm = rawWidthEm * this._sqrtWidthScale;
        const widthWorld = widthEm * ctx.emToWorld * ctx.scale;


        // Clip the SVG viewBox. 1em ≈ 1000 viewBox units.
        const clippedVBWidth = Math.round(widthEm * 1000);

        // Serialize and patch the SVG
        let svgString = serializeNode(svgEl);

        // 1. Clip the viewBox — preserve the ORIGINAL height so aspect
        // ratio stays correct (critical for taller sqrt SVGs).
        svgString = svgString
            .replace(/viewBox="[^"]*"/, `viewBox="0 0 ${clippedVBWidth} ${originalVBHeight}"`)
            .replace(/width="[^"]*"/, `width="${clippedVBWidth}"`)
            .replace(/preserveAspectRatio="[^"]*"/, '');

        // 2. Clip the path data. The KaTeX radical path uses:
        //    - "H400000" (absolute move-to X) in the first path's top edge
        //    - "h400000" / "h-400000" (relative) in the second path's rectangle
        //      which starts at x=834 (end of radical stem)
        //
        //    For the overbar to end exactly at viewBox right edge (clippedVBWidth):
        //    - Absolute H target = clippedVBWidth
        //    - Relative h length = clippedVBWidth - 834  (overbar length from x=834)
        const RADICAL_STEM_END_X = 834;
        const overbarRelLength = Math.max(1, clippedVBWidth - RADICAL_STEM_END_X);
        // KaTeX sqrt variants use different overbar-end constants: sqrtMain /
        // sqrtMain2/3/4 use H40000 (5 digits), the Size1–Size4 variants use
        // H400000 (6 digits). Match any run of 5+ digits after H / h / h- so
        // both families get clipped. Stem-end coordinates like "H1012.3" have
        // a decimal and so won't match \d+. Without this clip, the overbar
        // renders all the way to the original viewBox coord (e.g. x=40000)
        // while the viewBox is clipped to ~11000, causing SpaceSVG to scale
        // the overbar far past the sqrt's declared world width.
        svgString = svgString.replace(/h(\d{5,})/g, `h${overbarRelLength}`);
        svgString = svgString.replace(/H(\d{5,})/g, `H${clippedVBWidth}`);
        svgString = svgString.replace(/h-(\d{5,})/g, `h-${overbarRelLength}`);

        const centerX = ctx.cursorX + widthWorld / 2;
        // Shift the SVG down slightly so the radical checkmark doesn't
        // extend into the fraction bar when sqrt is in a denominator.
        const svgYShift = -0.15 * ctx.emToWorld * ctx.scale;
        const centerY = ctx.baselineY + heightWorld / 2 + svgYShift;

        this.items.push({
            kind: 'svg',
            svgString,
            x: centerX,
            y: centerY,
            width: widthWorld,
            height: heightWorld,
            scale: ctx.scale,
        });

        // Don't advance cursor — the SVG overlays the content that was
        // already walked and positioned. Return the width for parent tracking.
        return widthWorld;
    }

    private walkVlistGroup(vlistT: SpaceElement, ctx: WalkContext): void {
        // Structure: vlist-t > vlist-r > vlist > [children with top:-Xem]
        // (vlist-t2 has 2 vlist-r — second is depth strut, usually empty)
        const startX = ctx.cursorX;
        // Consume the flag: this vlist is the sub/superscript one, and anything
        // nested deeper inside its rows is an ordinary vlist again.
        const noCenter = ctx.inSupSub;
        ctx.inSupSub = false;
        let maxX = startX;
        const lineItemIndices: number[] = [];
        // Record the items index BEFORE walking this vlist's children so we can
        // later measure the actual ink extents of any text emitted inside it
        // (used for sqrt content width — avoids inflation from italic gaps).
        const vlistItemsStartIdx = this.items.length;

        // Track per-child item ranges so we can CENTER narrower children
        // within the widest child's width (LaTeX centers numerator/denominator).
        const childRanges: { startIdx: number; endIdx: number; width: number;
                              placed: boolean }[] = [];

        for (const vlistR of vlistT._childNodes) {
            if (vlistR.nodeType !== ELEMENT_NODE) continue;
            const vlistREl = vlistR as SpaceElement;
            if (!hasClass(vlistREl, 'vlist-r')) continue;

            for (const vlist of vlistREl._childNodes) {
                if (vlist.nodeType !== ELEMENT_NODE) continue;
                const vlistEl = vlist as SpaceElement;
                if (!hasClass(vlistEl, 'vlist')) continue;

                for (const child of vlistEl._childNodes) {
                    if (child.nodeType !== ELEMENT_NODE) continue;
                    const childEl = child as SpaceElement;

                    const topStyle = getStyle(childEl, 'top');
                    if (topStyle === null) continue;
                    const topEm = parseEm(topStyle);

                    const pstrut = this.findChildByClass(childEl, 'pstrut');
                    const pstrutHeight = pstrut ? parseEm(getStyle(pstrut, 'height')) : 0;

                    const yOffsetEm = -topEm - pstrutHeight;
                    const yOffsetWorld = yOffsetEm * ctx.emToWorld * ctx.scale;

                    const savedX = ctx.cursorX;
                    const savedY = ctx.baselineY;
                    ctx.cursorX = startX;
                    ctx.baselineY = savedY + yOffsetWorld;

                    // A vlist row carries its own horizontal margins, and they
                    // are load-bearing: KaTeX cancels the preceding glyph's
                    // italic correction on SUBSCRIPT rows with a negative
                    // margin-left (e.g. `F_n` → margin-left:-0.1389em against
                    // F's margin-right:0.1389em) while leaving superscripts
                    // shifted. That is exactly TeX's rule, handed to us for
                    // free. These rows are walked via walkChildren, which
                    // bypasses walk()'s margin handling, so apply them here or
                    // every subscript sits an italic correction too far right.
                    const rowMarginLeft = parseEm(getStyle(childEl, 'marginLeft'));
                    if (rowMarginLeft) {
                        ctx.cursorX += rowMarginLeft * ctx.emToWorld * ctx.scale;
                    }

                    // Identify the fraction BAR row. This must not cross into a
                    // nested vlist: a numerator or denominator that itself
                    // contains a fraction has that inner fraction's `frac-line`
                    // somewhere in its subtree, and an unbounded descendant
                    // search would misread the whole row as the bar — emitting a
                    // spurious line and silently dropping every glyph in the row.
                    // That was the #56 Lorentz Factor bug: the entire radicand
                    // `1 - v²/c²` vanished, and `validateAll` still reported a
                    // pass because it only checks that *some* items were emitted.
                    const fracLineEl = this.findRowFracLine(childEl);
                    if (fracLineEl) {
                        const thicknessEm =
                            parseEm(getStyle(fracLineEl, 'borderBottomWidth')) || 0.04;
                        lineItemIndices.push(this.items.length);
                        this.items.push({
                            kind: 'line',
                            x: startX,
                            y: ctx.baselineY,
                            width: 0,
                            thickness: thicknessEm * ctx.emToWorld * ctx.scale,
                            scale: ctx.scale,
                        });
                    } else {
                        const childStartIdx = this.items.length;
                        this.walkChildren(childEl, ctx);
                        // The row's trailing margin is KaTeX's scriptspace
                        // (0.05em after a sub/superscript) and it does advance
                        // the parent.
                        //
                        // Worth knowing: this looked wrong until SIZE_FACTORS
                        // was corrected. At the old (too large) script scale the
                        // content overshot by almost exactly 0.05em, cancelling
                        // the missing scriptspace and making both bugs invisible
                        // in the totals. Fix one without the other and the
                        // corpus gets worse, not better.
                        const rowMarginRight = parseEm(getStyle(childEl, 'marginRight'));
                        if (rowMarginRight) {
                            ctx.cursorX += rowMarginRight * ctx.emToWorld * ctx.scale;
                        }
                        const childWidth = ctx.cursorX - startX;
                        childRanges.push({
                            startIdx: childStartIdx,
                            endIdx: this.items.length,
                            width: childWidth,
                            // A row KaTeX moved itself is already where it
                            // belongs — see the centring pass below.
                            placed: rowMarginLeft !== 0,
                        });
                        if (ctx.cursorX > maxX) maxX = ctx.cursorX;
                    }

                    ctx.cursorX = savedX;
                    ctx.baselineY = savedY;
                }
            }
        }

        // Process any deferred SVG (sqrt radical) and update maxX.
        // The SVG width is computed from the content width and should be
        // at least as wide as the content it covers.
        if (this._pendingSVG) {
            const svg = this._pendingSVG;
            this._pendingSVG = null;
            // Measure actual ink right edge from emitted text items inside
            // this vlist (ignore cursor-based maxX which accumulates italic
            // gaps and subscript padding that don't correspond to visible ink).
            let inkRightX = startX;
            for (let i = vlistItemsStartIdx; i < this.items.length; i++) {
                const it = this.items[i];
                if (it.kind === 'text') {
                    const halfWidthWorld =
                        (it.widthEm * svg.ctx.emToWorld * it.scale) / 2;
                    const rightEdge = it.x + halfWidthWorld;
                    if (rightEdge > inkRightX) inkRightX = rightEdge;
                } else if (it.kind === 'svg' || it.kind === 'line') {
                    const rightEdge = it.x + (it.width || 0) / 2;
                    if (rightEdge > inkRightX) inkRightX = rightEdge;
                }
            }
            const contentWidth = Math.max(inkRightX - startX, maxX - startX) > 0
                ? inkRightX - startX
                : 0;
            const svgWidthWorld = this.emitSVGWithContentWidth(svg.el, svg.ctx, contentWidth);
            if (startX + svgWidthWorld > maxX) {
                maxX = startX + svgWidthWorld;
            }
        }

        // Final total width across all children.
        // The layoutWidthMargin (e.g., 1.18x) widens the fraction bar so it
        // extends past the text on both sides — compensates for char rendering
        // being slightly wider than font metrics predict.
        //
        // Only apply the margin for vlists that contain a frac-line. Applying
        // it to msupsub / sqrt / other vlists causes compound inflation that
        // makes radicals and other SVGs overshoot the content dramatically
        // (especially for expressions with many nested subscripts/superscripts).
        const rawWidth = maxX - startX;
        const marginFactor = lineItemIndices.length > 0 ? this._layoutWidthMargin : 1.0;
        const totalWidth = rawWidth * marginFactor;
        const totalCenterX = startX + totalWidth / 2;

        // Debug (only when verbose flag is set)
        if (this.verbose && (childRanges.length > 1 || lineItemIndices.length > 0)) {
            print(`[MatematexBridge] vlist: totalWidth=${totalWidth.toFixed(2)}, children=${childRanges.length}, lines=${lineItemIndices.length}`);
            for (let ci = 0; ci < childRanges.length; ci++) {
                const r = childRanges[ci];
                print(`[MatematexBridge]   child[${ci}]: width=${r.width.toFixed(2)}, items=${r.startIdx}-${r.endIdx}`);
            }
        }

        // CENTER each child's items within the total width.
        //
        // Except a row KaTeX placed itself. A subscript row on a large operator
        // carries `margin-left:-0.4445em` — TeX's rule that a subscript sits
        // back by the operator's italic correction — and the row is applied
        // above. Centring it afterwards undid exactly that: `width` is measured
        // from the vlist origin, so a row shifted LEFT of the origin measures
        // short (here, negative), and the centring pass pushed it right by half
        // the deficit. On `\int_a^b` the lower limit came out 0.187em too far
        // right while the upper limit — no margin, so nothing to undo — was
        // exact to four decimals. That asymmetry is the tell.
        //
        // Rows KaTeX did NOT place carry `margin-left:0em` or nothing at all
        // (fraction numerators, and the limits over a `\sum`), and those really
        // do want centring.
        for (const range of childRanges) {
            // A sub/superscript pair is not centred at ALL. Both rows start at
            // the vlist origin and the vlist is as wide as the wider of them —
            // so on `\int_{-\infty}^{\infty}` the narrow upper limit was being
            // pushed right by half the lower limit's overhang. `placed` alone
            // did not cover this: that row carries no margin of its own, so
            // nothing marked it as already positioned.
            if (noCenter || range.placed) continue;
            if (range.width < totalWidth && range.endIdx > range.startIdx) {
                const shift = (totalWidth - range.width) / 2;
                for (let i = range.startIdx; i < range.endIdx; i++) {
                    this.items[i].x += shift;
                }
            }
        }

        // Set fraction bar to span the full width, centered.
        for (const idx of lineItemIndices) {
            const lineItem = this.items[idx] as LineLayoutItem;
            lineItem.width = totalWidth;
            lineItem.x = totalCenterX;
        }

        // Advance the parent cursor using the FULL width (including margin)
        // so parent vlists (e.g., an outer fraction) see the complete extent.
        ctx.cursorX = startX + totalWidth;
        ctx.inSupSub = noCenter;
    }

    private findChildByClass(parent: SpaceElement, cls: string): SpaceElement | null {
        for (const child of parent._childNodes) {
            if (child.nodeType === ELEMENT_NODE) {
                const el = child as SpaceElement;
                if (hasClass(el, cls)) return el;
            }
        }
        return null;
    }

    /** Find a `frac-line` belonging to THIS vlist row.
     *
     *  KaTeX always emits the bar as a direct sibling of the row's `pstrut`, but
     *  we search a little deeper to survive an intervening wrapper (e.g. a
     *  `sizing` span) — while refusing to descend into a nested `vlist-t`.
     *  Anything inside a nested vlist belongs to a different fraction, and
     *  claiming it here would drop this row's content entirely. */
    private findRowFracLine(rowEl: SpaceElement): SpaceElement | null {
        for (const child of rowEl._childNodes) {
            if (child.nodeType !== ELEMENT_NODE) continue;
            const el = child as SpaceElement;
            if (hasClass(el, 'frac-line')) return el;
            if (hasClass(el, 'vlist-t')) continue; // a nested fraction's own bar — not ours
            const found = this.findRowFracLine(el);
            if (found) return found;
        }
        return null;
    }

    private findDescendantByClass(parent: SpaceElement, cls: string): SpaceElement | null {
        for (const child of parent._childNodes) {
            if (child.nodeType === ELEMENT_NODE) {
                const el = child as SpaceElement;
                if (hasClass(el, cls)) return el;
                const found = this.findDescendantByClass(el, cls);
                if (found) return found;
            }
        }
        return null;
    }
}

// ─── Renderer ────────────────────────────────────────────────

export class MatematexSceneRenderer {
    private created: SceneObject[] = [];
    _italicScaleAdjust: number = 0.5;
    verbose: boolean = false;
    /** Number of glyphs still to report in the calibration probe. Set >0 to
     *  sample a render; it decrements itself. */
    _calibrationSamples: number = 0;
    _probeEmToWorld: number = 5.0;
    private _probeRecords: { text: string, italic: boolean, comp: any, obj: SceneObject, metricW: number }[] = [];

    /** Report drawn width vs metric width for the sampled glyphs.
     *
     *  Must be called at least one frame AFTER render(): a Text3D's bounds are
     *  only populated once its mesh has been built, so reading them during
     *  creation returns nothing at all.
     *
     *  A ratio near 1.0 means the renderer draws a glyph at exactly the width
     *  the layout reserved for it. Anything else is a scale mismatch, and it
     *  shows up as collisions in the tightest gaps (|a, the 2 in 2ab) long
     *  before it is visible anywhere else — which is why the conformance
     *  harness, which measures em-space positions, cannot see it. */
    runCalibrationReport(): void {
        if (this._probeRecords.length === 0) return;
        print('[Matematex] ── calibration: drawn width vs metric width ──');
        for (const r of this._probeRecords) {
            const parts: string[] = [];
            const sx = r.obj.getTransform().getWorldScale().x;
            try {
                const d = r.comp.worldAabbMax.x - r.comp.worldAabbMin.x;
                if (isFinite(d) && d > 0) parts.push(`worldAabb=${d.toFixed(3)} ratio=${(d / r.metricW).toFixed(3)}`);
            } catch (e) { /* absent */ }
            try {
                const d = (r.comp.localAabbMax.x - r.comp.localAabbMin.x) * sx;
                if (isFinite(d) && d > 0) parts.push(`localAabb=${d.toFixed(3)} ratio=${(d / r.metricW).toFixed(3)}`);
            } catch (e) { /* absent */ }
            try {
                const bb = r.comp.getBoundingBox();
                const d = (bb.max ? (bb.max.x - bb.min.x) : (bb.right - bb.left)) * sx;
                if (isFinite(d) && d > 0) parts.push(`bbox=${d.toFixed(3)} ratio=${(d / r.metricW).toFixed(3)}`);
            } catch (e) { /* absent */ }
            print(`[Matematex] calib ${JSON.stringify(r.text)} italic=${r.italic} ` +
                  `metric=${r.metricW.toFixed(3)}w  ${parts.length ? parts.join('  ') : 'no bounds'}`);
        }
        this._probeRecords = [];
    }

    render(
        items: LayoutItem[],
        parent: SceneObject,
        baseTextSize: number,
        color: vec4,
        lineMaterial: Material,
        templateTextComp: any,
        templateScale: vec3,
        textScaleMultiplier: number,
        italicFont: Font | null,
        boldFont: Font | null = null,
        mainFont: Font | null = null,
        sizeFonts: SizeFonts | null = null,
    ): SceneObject[] {
        this.clear();

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'text') {
                this.createText(item, parent, baseTextSize, color, templateTextComp, templateScale, italicFont, boldFont, mainFont, sizeFonts);
            } else if (item.kind === 'line') {
                this.createLine(item, parent, color, lineMaterial);
            } else if (item.kind === 'svg') {
                this.createSVG(item, parent, color, lineMaterial, textScaleMultiplier);
            }
        }

        return this.created;
    }

    clear(): void {
        for (const obj of this.created) obj.destroy();
        this.created = [];
    }

    private createText(
        item: TextLayoutItem,
        parent: SceneObject,
        baseTextSize: number,
        color: vec4,
        templateTextComp: any,
        templateScale: vec3,
        italicFont: Font | null = null,
        boldFont: Font | null = null,
        mainFont: Font | null = null,
        sizeFonts: SizeFonts | null = null,
    ): void {
        if (!templateTextComp) {
            if (this.created.length === 0) {
                print('[MatematexBridge] WARNING: no templateText assigned, skipping text characters');
            }
            return;
        }

        const obj = global.scene.createSceneObject('MtxText');
        obj.setParent(parent);

        // Clone the template's Text component. The clone inherits font,
        // material, FontSize, layout rect, alignment, etc. — everything
        // needed for proper rendering. We override only text and color.
        const comp: any = (obj as any).copyComponent(templateTextComp);
        if (!comp) {
            print('[MatematexBridge] ERROR: copyComponent returned null');
            return;
        }

        // Override text content. We deliberately do NOT override `size` —
        // Text 3D's actual property is `FontSize` (with capital F), and
        // setting `size` to a small em value silently shrinks the text.
        // The clone keeps the template's FontSize via copyComponent.
        comp.text = item.text;

        // Apply italic / bold font when the walker recorded those flags.
        // Bold takes precedence over italic if both fonts are assigned and
        // both flags are set (rare — \mathbf{x} is bold-not-italic in KaTeX).
        // Font selection must match the metrics the layout used, or glyphs are
        // drawn to a different width than the space reserved for them. Upright
        // glyphs are measured against KaTeX_Main, so they have to be DRAWN in
        // KaTeX_Main — leaving `mainFont` unset meant digits, operators and
        // parens rendered in Lens Studio's default face while being spaced by
        // KaTeX's metrics, which is what made `2ab` collide and `|a|` foul its
        // bars. Italics were already correct; uprights never were.
        // FAMILY FIRST. A run measured against KaTeX_Size2 must be drawn from
        // KaTeX_Size2 — it is a different face with different glyphs, not a
        // weight of Main. A display integral is laid out 2.22 em tall and, drawn
        // from Main, comes out 0.89 em: correctly spaced for a big glyph and
        // drawn as a small one, which is the short integral on screen. "∑",
        // "∏" and "∮" are not in Main at ALL, so without this they fall through
        // to whatever face Lens Studio picks and stop being the right character.
        const sizeFont = item.family && sizeFonts
            ? (sizeFonts as any)[item.family] as Font | null | undefined
            : null;

        if (sizeFont) {
            try { comp.font = sizeFont; } catch (e) { /* ignore */ }
        } else if (item.bold && boldFont) {
            try { comp.font = boldFont; } catch (e) { /* ignore */ }
        } else if (item.italic && italicFont) {
            try { comp.font = italicFont; } catch (e) { /* ignore */ }
        } else if (mainFont) {
            // Bold with no bold face assigned lands here deliberately: the
            // right FAMILY without the weight beats the wrong family, and
            // \mathbf in Lens Studio's default face is how the norm bars in
            // #74 ended up as slanted relation glyphs.
            try { comp.font = mainFont; } catch (e) { /* ignore */ }
        }

        applyTextColor(comp, color);

        // Apply the template's local scale to the clone, multiplied by the
        // per-item scale factor (e.g. 0.8x for super/subscripts). This makes
        // the cloned text the same visual size as the template.
        // For italic text, apply an additional scale adjustment since the
        // italic font often has larger glyph metrics than the regular font.
        const sizeAdjust = (item.italic && italicFont) ? this._italicScaleAdjust : 1.0;
        obj.getTransform().setLocalScale(new vec3(
            templateScale.x * item.scale * sizeAdjust,
            templateScale.y * item.scale * sizeAdjust,
            templateScale.z * item.scale * sizeAdjust,
        ));

        // Position. We use the layout walker's coordinates directly. The
        // layout uses em-based units scaled by emToWorld, so positions are
        // in the same world-unit space as the container.
        const baselineOffset = 0; // omitted for now — the rect-based Text 3D handles its own baseline
        const zNudge = 0.01;
        obj.getTransform().setLocalPosition(
            new vec3(item.x, item.y + baselineOffset, zNudge)
        );

        // ── Glyph calibration probe ────────────────────────────────────
        // Layout advances the cursor by KaTeX's METRIC width; the renderer
        // draws each glyph at a FontSize the layout knows nothing about. If
        // those two disagree, glyphs collide or drift apart no matter how exact
        // the layout is — and the conformance harness cannot see it, because it
        // measures em-space positions, not drawn pixels.
        //
        // So measure. For the first few glyphs of a render, report the metric
        // advance next to the actual world-space width of the object we just
        // created. A ratio near 1.0 means layout and rendering agree.
        // Record for the deferred calibration report (see runCalibrationReport).
        // Bounds cannot be read here: the mesh for a Text3D created this frame
        // has not been built yet, so worldAabbMin/Max are still empty.
        if (this._calibrationSamples > 0) {
            this._calibrationSamples--;
            this._probeRecords.push({ text: item.text, italic: item.italic, comp, obj,
                                      metricW: item.widthEm * this._probeEmToWorld * item.scale });
        }

        // Diagnostic for the first text only (verbose mode only)
        if (this.verbose && this.created.length === 0) {
            const wpos = obj.getTransform().getWorldPosition();
            const wscale = obj.getTransform().getWorldScale();
            print(`[MatematexBridge] First text "${item.text}" worldPos=(${wpos.x.toFixed(2)},${wpos.y.toFixed(2)},${wpos.z.toFixed(2)}) worldScale=(${wscale.x.toFixed(2)},${wscale.y.toFixed(2)},${wscale.z.toFixed(2)})`);

            // Dump every property we can find on the comp to look for fontSize, scale, etc.
            const ca = comp as any;
            const propsToCheck = ['size', 'fontSize', 'FontSize', 'extrusionDepth', 'sizeToFit', 'letterSpacing'];
            for (const p of propsToCheck) {
                try {
                    if (ca[p] !== undefined) {
                        print(`[MatematexBridge]   comp.${p}=${ca[p]}`);
                    }
                } catch (e) { /* ignore */ }
            }

            // Read the world AABB to see how big the text actually is.
            // Lens Studio versions vary on AABB property/method names.
            try {
                let minA: any = null, maxA: any = null;
                // Variant 1: getter properties returning vec3
                try { minA = ca.worldAabbMin; maxA = ca.worldAabbMax; } catch (e) {}
                // Variant 2: function calls
                if (!minA || minA.x === undefined) {
                    try { minA = ca.getWorldAabbMin?.(); maxA = ca.getWorldAabbMax?.(); } catch (e) {}
                }
                // Variant 3: try local AABB instead
                if (!minA || minA.x === undefined) {
                    try { minA = ca.localAabbMin; maxA = ca.localAabbMax; } catch (e) {}
                }
                // Variant 4: try sceneObject's getWorldAabb...
                if (!minA || minA.x === undefined) {
                    try {
                        const aabb = (obj as any).getWorldAabb?.();
                        if (aabb) { minA = aabb.min; maxA = aabb.max; }
                    } catch (e) {}
                }

                if (minA && maxA && minA.x !== undefined && maxA.x !== undefined) {
                    const w = maxA.x - minA.x;
                    const h = maxA.y - minA.y;
                    const d = maxA.z - minA.z;
                    print(`[MatematexBridge]   AABB size: ${w.toFixed(2)} x ${h.toFixed(2)} x ${d.toFixed(2)} (W x H x D)`);
                } else {
                    print(`[MatematexBridge]   AABB: no readable property (min=${typeof minA} max=${typeof maxA})`);
                }
            } catch (e) {
                print(`[MatematexBridge]   AABB readback failed: ${e}`);
            }
        }

        this.created.push(obj);
    }

    private createLine(
        item: LineLayoutItem,
        parent: SceneObject,
        color: vec4,
        material: Material,
    ): void {
        if (item.width <= 0 || item.thickness <= 0) return;

        // Build a quad mesh via MeshBuilder + RenderMeshVisual.
        // RenderMeshVisual + mainPassOverrides is the same pattern SpaceSVG uses.
        // Convention: item.x and item.y are the VISUAL CENTER of the line.
        const hw = item.width / 2;
        const ht = item.thickness / 2;
        const cx = item.x;
        const cy = item.y;

        const builder = new MeshBuilder([
            { name: 'position', components: 3 },
        ]);
        builder.topology = MeshTopology.Triangles;
        builder.indexType = MeshIndexType.UInt16;

        // Quad centered at local origin (positioned via transform)
        builder.appendVerticesInterleaved([
            -hw, -ht, 0,
             hw, -ht, 0,
             hw,  ht, 0,
            -hw,  ht, 0,
        ]);
        builder.appendIndices([0, 1, 2, 0, 2, 3]);

        if (!builder.isValid()) {
            print('[MatematexBridge] Invalid line mesh, skipping');
            return;
        }
        builder.updateMesh();
        const mesh = builder.getMesh();

        const obj = global.scene.createSceneObject('MtxLine');
        obj.setParent(parent);

        const visual = obj.createComponent('Component.RenderMeshVisual') as RenderMeshVisual;
        visual.mesh = mesh;
        visual.mainMaterial = material;

        // Try multiple color paths — different shaders expose color via
        // different parameters. baseColor works on Unlit; emissiveColor
        // makes PBR materials self-illuminate without scene lights.
        this.applyColorOverrides(visual, color);

        obj.getTransform().setLocalPosition(new vec3(cx, cy, 0));

        this.created.push(obj);
    }

    applyColorOverrides(visual: RenderMeshVisual, color: vec4): void {
        const tries = [
            () => (visual.mainPassOverrides as any).baseColor = color,
            () => (visual.mainPass as any).baseColor = color,
            () => (visual.mainPassOverrides as any).emissiveColor = color,
            () => (visual.mainPass as any).emissiveColor = color,
            () => (visual.mainPassOverrides as any).emissiveIntensity = 1.0,
            () => (visual.mainPass as any).emissiveIntensity = 1.0,
        ];
        for (const t of tries) {
            try { t(); } catch (e) { /* ignore */ }
        }
    }

    private svgXmlParser = new SVGXMLParser();
    private svgMeshBackend = new SpaceSVGMeshBackend();

    private createSVG(
        item: SVGLayoutItem,
        parent: SceneObject,
        color: vec4,
        material: Material,
        textScaleMultiplier: number = 1.0,
    ): void {
        if (!item.svgString || item.width <= 0 || item.height <= 0) return;

        try {
            // Parse the SVG string via SpaceSVG's XML parser
            const tree = this.svgXmlParser.parse(item.svgString);

            // SVG dimensions come from the layout walker in emToWorld units.
            // Do NOT multiply by textScaleMultiplier — the text characters
            // are independently enlarged via SceneObject transform, but the
            // SVG should match the LAYOUT coordinate space so it covers the
            // content positions correctly.
            const groups = this.svgMeshBackend.buildMeshes(
                tree,
                item.width,
                item.height,
            );

            if (groups.length === 0) {
                print(`[MatematexBridge] SVG produced 0 mesh groups`);
                return;
            }

            // Create a container for the SVG meshes
            const container = global.scene.createSceneObject('MtxSVG');
            container.setParent(parent);
            container.getTransform().setLocalPosition(
                new vec3(item.x, item.y, 0.005) // slight z nudge
            );

            for (let i = 0; i < groups.length; i++) {
                const g = groups[i];
                if (g.vertices.length === 0 || g.indices.length === 0) continue;

                const builder = new MeshBuilder([
                    { name: 'position', components: 3 },
                ]);
                builder.topology = MeshTopology.Triangles;
                builder.indexType = MeshIndexType.UInt16;
                builder.appendVerticesInterleaved(g.vertices);
                builder.appendIndices(g.indices);

                if (!builder.isValid()) continue;
                builder.updateMesh();

                const obj = global.scene.createSceneObject(`MtxSVG_${i}`);
                obj.setParent(container);

                const visual = obj.createComponent('Component.RenderMeshVisual') as RenderMeshVisual;
                visual.mesh = builder.getMesh();
                visual.mainMaterial = material;

                // Use the SVG's own color if it has one, otherwise use our text color
                const svgColor = new vec4(g.color[0], g.color[1], g.color[2], g.color[3]);
                // If SVG color is black (KaTeX default), override with our text color
                if (svgColor.r < 0.1 && svgColor.g < 0.1 && svgColor.b < 0.1) {
                    this.applyColorOverrides(visual, color);
                } else {
                    this.applyColorOverrides(visual, svgColor);
                }
            }

            this.created.push(container);
            // Silent by default: the cover lays out dozens of fragments at
            // startup and this fired for each one. `verbose` still shows it.
            if (this.verbose) {
                print(`[MatematexBridge] SVG rendered: ${groups.length} mesh groups`);
            }

        } catch (e: any) {
            print(`[MatematexBridge] SVG render failed: ${e.message || e}`);
        }
    }
}

// ─── @component ──────────────────────────────────────────────

@component
export class MatematexBridge extends BaseScriptComponent {

    @input
    @hint("LaTeX expression to render")
    private latex: string = "\\frac{1}{2}";

    @input
    @hint("Unlit material for fraction bars and lines")
    private lineMaterial: Material;

    @input
    @hint("Template Text 3D SceneObject — create one in editor, drag here. We clone its Text component for each character (inherits font + material).")
    private templateText: SceneObject;

    @input
    @hint("Hide the template SceneObject after using it as a clone source")
    private hideTemplate: boolean = true;

    @input
    @hint("Debug: draw a colored outline at each text item position so you can see layout placement")
    private debugTextBounds: boolean = false;

    @input
    @hint("Font for italic math variables (e.g. KaTeX_Math-Italic). If not set, uses template font for everything.")
    private italicFont: Font;

    @input
    @hint("Bold font for \\mathbf / \\boldsymbol. Optional — falls back to template font.")
    private boldFont: Font;

    @input
    @hint("Scale adjustment for italic font (KaTeX_Math-Italic renders larger than Main-Regular at same FontSize). Try 0.5 if italic text is 2x too big.")
    private italicScaleAdjust: number = 0.5;

    @input
    @hint("World units per em — controls layout spacing between characters. Start at 2, increase if chars overlap, decrease if too spread out.")
    private emToWorld: number = 2.0;

    @input
    @hint("Lens Studio Text component size for 1.0x scale (em → text size)")
    private baseTextSize: number = 2.0;

    @input
    @hint("Multiplier for text SceneObject scale (cranks up cloned text size). Try 5 if text is small.")
    private textScaleMultiplier: number = 1.0;

    @input
    @hint("Width margin for fraction bars and radicals (compensates for text rendering scale mismatch). 1.0 = exact, 1.18 = 18% wider.")
    private layoutWidthMargin: number = 1.0;

    @input
    @hint("Scale factor for sqrt radical width. 1.0 = walker's predicted width. Lower if radical extends past content. Complex expressions need 0.4-0.6.")
    private sqrtWidthScale: number = 1.0;

    @input
    private textColor: vec4 = new vec4(1, 1, 1, 1);

    @input
    @hint("Print layout items to console for debugging")
    private dumpLayout: boolean = true;

    @input
    @hint("Container world Z (camera at z=40 looks toward -Z; 35 = 5 units in front)")
    private containerWorldZ: number = 35.0;

    @input
    @hint("Container world Y (height)")
    private containerWorldY: number = 0.0;

    @input
    @hint("Render a bright debug anchor quad at the container origin (sanity check)")
    private debugAnchor: boolean = true;

    private container: SceneObject | null = null;

    onAwake(): void {
        if (!this.lineMaterial) {
            print("[MatematexBridge] ERROR: Assign an unlit Material to lineMaterial!");
            return;
        }

        const doc = getSpaceDocument();
        if (!doc) {
            print("[MatematexBridge] FATAL: SpaceDOM not installed");
            return;
        }

        print(`[MatematexBridge] Rendering: ${this.latex}`);
        print(`[MatematexBridge] emToWorld=${this.emToWorld} baseTextSize=${this.baseTextSize} containerWorldZ=${this.containerWorldZ}`);
        print(`[MatematexBridge] textColor=(${this.textColor.r},${this.textColor.g},${this.textColor.b},${this.textColor.a})`);

        // Create the container, parent it (required — unparented SceneObjects
        // are not in the scene graph and won't render), then set its WORLD
        // position. setWorldPosition() correctly computes the local transform
        // regardless of the parent's transform, so we can place the container
        // exactly where we want in world space even if the script's parent is
        // at world origin while the camera is at z=+40.
        this.container = global.scene.createSceneObject('MatematexContainer');
        this.container.setParent(this.getSceneObject());
        this.container.getTransform().setWorldPosition(
            new vec3(0, this.containerWorldY, this.containerWorldZ)
        );

        const parentWorld = this.getSceneObject().getTransform().getWorldPosition();
        print(`[MatematexBridge] parent world pos = (${parentWorld.x.toFixed(2)}, ${parentWorld.y.toFixed(2)}, ${parentWorld.z.toFixed(2)})`);
        const containerWorld = this.container.getTransform().getWorldPosition();
        print(`[MatematexBridge] container world pos = (${containerWorld.x.toFixed(2)}, ${containerWorld.y.toFixed(2)}, ${containerWorld.z.toFixed(2)})`);

        if (this.debugAnchor) {
            this.createDebugAnchor();
        }

        // Step 1: KaTeX renders LaTeX to a SpaceDOM tree
        const wrapper = doc.createElement('div');
        try {
            // @ts-ignore
            katex.render(this.latex, wrapper, { throwOnError: true });
        } catch (e: any) {
            print(`[MatematexBridge] KaTeX render failed: ${e.message || e}`);
            return;
        }

        // Step 2: locate the .katex-html root
        const katexHtml = this.findFirstWithClass(wrapper, 'katex-html');
        if (!katexHtml) {
            print("[MatematexBridge] ERROR: could not find .katex-html in KaTeX output");
            return;
        }

        // Step 3: walk the tree and produce LayoutItems.
        // emToWorld controls LAYOUT SPACING (how many world units per em).
        // textScaleMultiplier controls TEXT RENDERING SIZE (SceneObject scale).
        // These are independent — tune emToWorld for tight/wide spacing,
        // tune textScaleMultiplier for text legibility.
        const walker = new MatematexLayoutWalker();
        walker._layoutWidthMargin = this.layoutWidthMargin;
        walker._sqrtWidthScale = this.sqrtWidthScale;
        walker.verbose = this.dumpLayout;
        const result = walker.layout(katexHtml, this.emToWorld);

        if (this.dumpLayout) {
            this.dumpLayoutItems(result);
        }

        // Look up the template's Text component (once). Try multiple type
        // names since the actual class varies by Lens Studio version.
        let templateTextComp: any = null;
        let templateScale: vec3 = new vec3(1, 1, 1);
        if (this.templateText) {
            const candidates = [
                'Component.Text',
                'Component.Text 3D',
                'Component.Text3D',
                'Text',
            ];
            for (const t of candidates) {
                try {
                    const c = this.templateText.getComponent(t as any);
                    if (c) {
                        templateTextComp = c;
                        print(`[MatematexBridge] Template Text component found via "${t}"`);
                        // Read template's interesting properties for diagnostics
                        try {
                            const ca = c as any;
                            const sz = ca.size !== undefined ? ca.size : '(no size prop)';
                            print(`[MatematexBridge]   template.size=${sz}`);
                        } catch (e) { /* ignore */ }
                        break;
                    }
                } catch (e) { /* ignore */ }
            }

            if (templateTextComp) {
                // Capture the template's local scale so we can match it on clones
                templateScale = this.templateText.getTransform().getLocalScale();
                print(`[MatematexBridge] Template localScale=(${templateScale.x.toFixed(2)},${templateScale.y.toFixed(2)},${templateScale.z.toFixed(2)})`);

                // Apply user-controlled multiplier
                if (this.textScaleMultiplier !== 1.0 && this.textScaleMultiplier > 0) {
                    templateScale = new vec3(
                        templateScale.x * this.textScaleMultiplier,
                        templateScale.y * this.textScaleMultiplier,
                        templateScale.z * this.textScaleMultiplier,
                    );
                    print(`[MatematexBridge] Applied textScaleMultiplier=${this.textScaleMultiplier}, effective scale=(${templateScale.x.toFixed(2)},${templateScale.y.toFixed(2)},${templateScale.z.toFixed(2)})`);
                }

                if (this.hideTemplate) {
                    this.templateText.enabled = false;
                }
            } else {
                print('[MatematexBridge] WARNING: templateText assigned but no Text component found on it');
            }
        } else {
            print('[MatematexBridge] WARNING: templateText not assigned — text characters will be skipped');
        }

        // Step 4: render the layout items to scene objects
        const renderer = new MatematexSceneRenderer();
        renderer._italicScaleAdjust = this.italicScaleAdjust;
        renderer.verbose = this.dumpLayout;
        const created = renderer.render(
            result.items,
            this.container,
            this.baseTextSize,
            this.textColor,
            this.lineMaterial,
            templateTextComp,
            templateScale,
            this.textScaleMultiplier,
            this.italicFont || null,
            this.boldFont || null,
        );

        // Optional: draw debug markers at each text-item position
        if (this.debugTextBounds) {
            for (const item of result.items) {
                if (item.kind === 'text') {
                    // Cyan dot at the layout-item position
                    this.makeQuad(item.x, item.y, 0.3, 0.3, new vec4(0, 1, 1, 1));
                }
            }
        }

        print(`[MatematexBridge] Rendered ${created.length} scene objects (width ≈ ${result.width.toFixed(3)})`);
    }

    private dumpLayoutItems(result: WalkResult): void {
        print(`[MatematexBridge] === Layout: ${result.items.length} items, width=${result.width.toFixed(3)} ===`);
        for (let i = 0; i < result.items.length; i++) {
            const item = result.items[i];
            if (item.kind === 'text') {
                print(`  [${i}] text "${item.text}" at (${item.x.toFixed(3)}, ${item.y.toFixed(3)}) scale=${item.scale.toFixed(2)}`);
            } else if (item.kind === 'line') {
                print(`  [${i}] line  at (${item.x.toFixed(3)}, ${item.y.toFixed(3)}) w=${item.width.toFixed(3)} t=${item.thickness.toFixed(4)}`);
            }
        }
        for (const w of result.warnings) {
            print(`  WARN: ${w}`);
        }
    }

    private createDebugAnchor(): void {
        if (!this.container) return;
        // Big visible cross: 2-unit red center, 4x0.5 green +X arm, 0.5x4 blue +Y arm.
        // At ~5 units from the camera (containerWorldZ=35, camera z=40), a 2-unit
        // square subtends ~22°, easy to see.
        this.makeQuad(0, 0, 2.0, 2.0, new vec4(1, 0, 0, 1));      // red center
        this.makeQuad(3.0, 0, 4.0, 0.5, new vec4(0, 1, 0, 1));    // green +X
        this.makeQuad(0, 3.0, 0.5, 4.0, new vec4(0, 0, 1, 1));    // blue +Y
        print('[MatematexBridge] Debug anchor: red center, green +X, blue +Y (each 2-4 units)');
    }

    private makeQuad(cx: number, cy: number, w: number, h: number, color: vec4): void {
        if (!this.container || !this.lineMaterial) return;
        const hw = w / 2;
        const hh = h / 2;

        const builder = new MeshBuilder([
            { name: 'position', components: 3 },
        ]);
        builder.topology = MeshTopology.Triangles;
        builder.indexType = MeshIndexType.UInt16;
        builder.appendVerticesInterleaved([
            -hw, -hh, 0,
             hw, -hh, 0,
             hw,  hh, 0,
            -hw,  hh, 0,
        ]);
        builder.appendIndices([0, 1, 2, 0, 2, 3]);
        if (!builder.isValid()) return;
        builder.updateMesh();

        const obj = global.scene.createSceneObject('MtxDebug');
        obj.setParent(this.container);
        const visual = obj.createComponent('Component.RenderMeshVisual') as RenderMeshVisual;
        visual.mesh = builder.getMesh();
        visual.mainMaterial = this.lineMaterial;

        // Same multi-path color override used for line meshes — works for
        // both Unlit (baseColor) and PBR (emissiveColor) materials.
        const tries = [
            () => (visual.mainPassOverrides as any).baseColor = color,
            () => (visual.mainPass as any).baseColor = color,
            () => (visual.mainPassOverrides as any).emissiveColor = color,
            () => (visual.mainPass as any).emissiveColor = color,
            () => (visual.mainPassOverrides as any).emissiveIntensity = 1.0,
            () => (visual.mainPass as any).emissiveIntensity = 1.0,
        ];
        for (const t of tries) { try { t(); } catch (e) { /* ignore */ } }

        obj.getTransform().setLocalPosition(new vec3(cx, cy, -0.002));
    }

    private findFirstWithClass(node: SpaceNode, cls: string): SpaceElement | null {
        for (const child of node._childNodes) {
            if (child.nodeType === ELEMENT_NODE) {
                const el = child as SpaceElement;
                const elClass = el.getAttribute('class') ?? '';
                if (elClass.split(/\s+/).indexOf(cls) >= 0) return el;
                const found = this.findFirstWithClass(el, cls);
                if (found) return found;
            }
        }
        return null;
    }
}

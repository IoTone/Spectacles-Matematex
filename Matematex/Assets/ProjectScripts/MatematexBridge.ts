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
} from './KaTeXFontMetrics';

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

// KaTeX size classes — multiplier relative to size6 (= 1.0)
const SIZE_FACTORS: { [key: string]: number } = {
    size1: 0.5,
    size2: 0.7,
    size3: 0.8,
    size4: 0.9,
    size5: 1.0,
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

// ─── Walker ──────────────────────────────────────────────────

interface WalkContext {
    cursorX: number;
    baselineY: number;
    scale: number;
    emToWorld: number;
    italic: boolean;
    bold: boolean;
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
    _layoutWidthMargin: number = 1.18;
    _sqrtWidthScale: number = 0.5; // compensate for walker overshooting visual content (more aggressive than before)
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

        // mspace: explicit horizontal space, no children to walk
        if (hasClass(el, 'mspace')) {
            ctx.cursorX += marginRight * ctx.emToWorld * ctx.scale;
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
            return;
        }

        // vlist-t: vertical stacking primitive (used by mfrac, msupsub)
        if (hasClass(el, 'vlist-t')) {
            this.walkVlistGroup(el, ctx);
            if (marginRight) {
                ctx.cursorX += marginRight * ctx.emToWorld * ctx.scale;
            }
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
                const wantEm = ATOM_SPACING_EM[`${prevAtomClass}-${currAtomClass}`] || 0;
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
        if (classes.indexOf('strut') >= 0) return true;
        if (classes.indexOf('pstrut') >= 0) return true;
        if (classes.indexOf('vlist-s') >= 0) return true;
        if (classes.indexOf('nulldelimiter') >= 0) return true;
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
        const widthEm = getTextWidthEm(text, ctx.italic);
        const widthWorld = widthEm * ctx.emToWorld * ctx.scale;
        const centerX = ctx.cursorX + widthWorld / 2;

        const xHeightEm = 0.43; // standard x-height for KaTeX fonts
        const baselineToCenterWorld = (xHeightEm / 2) * ctx.emToWorld * ctx.scale;
        const centerY = ctx.baselineY + baselineToCenterWorld;

        this.items.push({
            kind: 'text',
            text,
            x: centerX,
            y: centerY,
            scale: ctx.scale,
            italic: ctx.italic,
            bold: ctx.bold,
        });

        ctx.cursorX += widthWorld;

        // Add italic inter-character spacing using real italic correction
        // from font metrics. Many math-italic characters have correction=0,
        // so we enforce a minimum gap to prevent visual overlapping (the
        // rendered text at textScaleMultiplier may be wider than metrics predict).
        if (ctx.italic && text.length > 0) {
            const lastChar = text.charAt(text.length - 1);
            const italicCorrectionEm = getCharItalicEm(lastChar);
            const minGapEm = 0.12; // minimum gap between consecutive italic chars
            const gapEm = Math.max(italicCorrectionEm, minGapEm);
            ctx.cursorX += gapEm * ctx.emToWorld * ctx.scale;
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
        let maxX = startX;
        const lineItemIndices: number[] = [];
        // Record the items index BEFORE walking this vlist's children so we can
        // later measure the actual ink extents of any text emitted inside it
        // (used for sqrt content width — avoids inflation from italic gaps).
        const vlistItemsStartIdx = this.items.length;

        // Track per-child item ranges so we can CENTER narrower children
        // within the widest child's width (LaTeX centers numerator/denominator).
        const childRanges: { startIdx: number; endIdx: number; width: number }[] = [];

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

                    const fracLineEl = this.findDescendantByClass(childEl, 'frac-line');
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
                        const childWidth = ctx.cursorX - startX;
                        childRanges.push({
                            startIdx: childStartIdx,
                            endIdx: this.items.length,
                            width: childWidth,
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
                        (getTextWidthEm(it.text, it.italic) * svg.ctx.emToWorld * it.scale) / 2;
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
        for (const range of childRanges) {
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
    ): SceneObject[] {
        this.clear();

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'text') {
                this.createText(item, parent, baseTextSize, color, templateTextComp, templateScale, italicFont, boldFont);
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
        if (item.bold && boldFont) {
            try { comp.font = boldFont; } catch (e) { /* ignore */ }
        } else if (item.italic && italicFont) {
            try { comp.font = italicFont; } catch (e) { /* ignore */ }
        }

        // Try color override (template color is used as fallback)
        try { (comp.textFill as any).mappingType = 0; } catch (e) { /* ignore */ }
        try { comp.textFill.color = color; } catch (e) { /* ignore */ }

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
            print(`[MatematexBridge] SVG rendered: ${groups.length} mesh groups`);

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
    private layoutWidthMargin: number = 1.18;

    @input
    @hint("Scale factor for sqrt radical width. 1.0 = walker's predicted width. Lower if radical extends past content. Complex expressions need 0.4-0.6.")
    private sqrtWidthScale: number = 0.5;

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

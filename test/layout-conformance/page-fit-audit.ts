// page-fit-audit.ts — How wide and how tall does each of the 80 book formulas
// actually draw, in the world units the scene uses?
//
//   npx ts-node --transpile-only test/layout-conformance/page-fit-audit.ts
//   npx ts-node --transpile-only test/layout-conformance/page-fit-audit.ts --half-width=19
//
// Written to answer one question with data instead of opinion: if the page goes
// PORTRAIT, the measure narrows, and MatematexBookOfMath.renderFormula shrinks
// any formula wider than the measure to fit. How many of the 80 get shrunk, and
// how small do the worst ones get?
//
// emToWorld is the scene's 5.0 here, NOT the 1.0 dump-ours uses — this asks
// about world units on a page, not about em-space conformance.

import './ls-stubs';

import { installSpaceDOMAdapter, getSpaceDocument } from '../../Matematex/Assets/ProjectScripts/SpaceDOMAdapter';
installSpaceDOMAdapter();

// @ts-ignore — katex_bundle is @ts-nocheck
import katex from '../../Matematex/Assets/ProjectScripts/katex_bundle';

import { SpaceElement, SpaceNode, ELEMENT_NODE } from '../../Matematex/Assets/ProjectScripts/SpaceDOM';
import { MatematexLayoutWalker } from '../../Matematex/Assets/ProjectScripts/MatematexBridge';
import { MATH_FORMULAS } from '../../Matematex/Assets/ProjectScripts/MathBookData';
import { getTextWidthEm } from '../../Matematex/Assets/ProjectScripts/KaTeXFontMetrics';
import { PROOFS } from '../../Matematex/Assets/ProjectScripts/MathProofData';

function numArg(flag: string, dflt: number): number {
    const a = process.argv.find(x => x.startsWith(flag + '='));
    if (!a) return dflt;
    const v = parseFloat(a.slice(flag.length + 1));
    return isNaN(v) ? dflt : v;
}

// Scene values, not code defaults — see dump-ours.ts's NOTE on the three-way
// drift in sqrtWidthScale.
const EM_TO_WORLD = numArg('--em-to-world', 5.0);
const HALF_WIDTH = numArg('--half-width', 24);   // SAFE_HALF_WIDTH, the portrait type area

function findFirstWithClass(node: SpaceNode, cls: string): SpaceElement | null {
    for (const child of (node as any)._childNodes) {
        if (child.nodeType !== ELEMENT_NODE) continue;
        const el = child as SpaceElement;
        const c = el.getAttribute('class');
        if (c && c.split(/\s+/).indexOf(cls) >= 0) return el;
        const found = findFirstWithClass(el, cls);
        if (found) return found;
    }
    return null;
}

const doc = getSpaceDocument();
if (!doc) { console.error('SpaceDOM not installed'); process.exit(1); }

interface Row { id: number; name: string; w: number; h: number; }
const rows: Row[] = [];

for (const f of MATH_FORMULAS) {
    const wrapper = doc.createElement('div');
    (katex as any).render(f.latex, wrapper, { throwOnError: true, displayMode: true });
    const katexHtml = findFirstWithClass(wrapper as any, 'katex-html');
    if (!katexHtml) { console.error(`#${f.id}: no .katex-html`); continue; }

    const walker = new MatematexLayoutWalker();
    walker._sqrtWidthScale = 1.0;
    const r = walker.layout(katexHtml as any, EM_TO_WORLD);

    // Vertical extent: the walker has no height in WalkResult, so take it from
    // the items. Each item's `scale` is its em size, so one em of glyph body
    // above and below the pen is a fair envelope — the exact cap/descender
    // extremes are the renderer's business, not the page's.
    let top = -Infinity, bot = Infinity;
    for (const it of r.items) {
        const half = 0.5 * (it as any).scale * EM_TO_WORLD;
        if (it.y + half > top) top = it.y + half;
        if (it.y - half < bot) bot = it.y - half;
    }
    if (!isFinite(top)) { top = 0; bot = 0; }

    rows.push({ id: f.id, name: f.name, w: r.width, h: top - bot });
}

rows.sort((a, b) => b.w - a.w);

const measure = HALF_WIDTH * 2;
const shrunk = rows.filter(r => r.w > measure);

console.log(`page-fit audit — emToWorld ${EM_TO_WORLD}, measure ${measure} units (±${HALF_WIDTH})\n`);
console.log('  widest 15:');
for (const r of rows.slice(0, 15)) {
    const pct = r.w > measure ? (measure / r.w) : 1;
    const flag = pct < 1 ? `  SHRINK to ${(pct * 100).toFixed(0)}%` : '';
    console.log(`    #${String(r.id).padStart(2)}  w ${r.w.toFixed(1).padStart(6)}  h ${r.h.toFixed(1).padStart(5)}  ${r.name}${flag}`);
}

const widths = rows.map(r => r.w);
const heights = rows.map(r => r.h);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

console.log(`\n  width   max ${Math.max(...widths).toFixed(1)}   median ${median(widths).toFixed(1)}   min ${Math.min(...widths).toFixed(1)}`);
console.log(`  height  max ${Math.max(...heights).toFixed(1)}   median ${median(heights).toFixed(1)}`);
console.log(`\n  ${shrunk.length}/${rows.length} formulas exceed the ${measure}-unit measure and get scaled down.`);
if (shrunk.length) {
    const worst = shrunk[0];
    console.log(`  worst: #${worst.id} at ${(measure / worst.w * 100).toFixed(0)}% (${worst.name})`);
}

// ─── Page furniture ─────────────────────────────────────────────────────
//
// The formula is not the only thing that has to fit the measure. Every label
// the book draws by hand is template text — KaTeX_Main at `scale`, where one em
// is EM_TO_WORLD world units — so the same metrics table prices them exactly.
// This is the check that catches a formula name overhanging the page after the
// measure moved from +/-34 to +/-24.

const textW = (t: string, scale: number) =>
    getTextWidthEm(t, false, 'main', false) * EM_TO_WORLD * scale;

interface Label { what: string; text: string; scale: number; x: number; }
const labels: Label[] = [];

for (const f of MATH_FORMULAS) {
    labels.push({ what: `#${f.id} name`, text: `${f.id}/${MATH_FORMULAS.length}  ${f.name}`, scale: 0.4, x: 0 });
    labels.push({ what: `#${f.id} chapter`, text: `Chapter: ${f.chapter}`, scale: 0.3, x: 0 });
}
for (const key of Object.keys(PROOFS)) {
    const pr = (PROOFS as any)[key];
    if (!pr) continue;
    if (pr.title)   labels.push({ what: `#${key} proof title`,   text: pr.title,   scale: 0.4, x: 0 });
    if (pr.caption) labels.push({ what: `#${key} proof caption`, text: pr.caption, scale: 0.3, x: 0 });
}

// A label is centred on its x, so it runs half its width either side. The
// running head is nominally left-anchored at the margin, but Text3D centres,
// so it is measured the same way and its x is where its centre lands.
const reach = (l: Label & { w: number }) => Math.abs(l.x) + l.w / 2;
const measured = labels.map(l => ({ ...l, w: textW(l.text, l.scale) }));
const over = measured.filter(l => reach(l) > HALF_WIDTH).sort((a, b) => reach(b) - reach(a));

console.log(`\n  page furniture: ${labels.length} labels checked against +/-${HALF_WIDTH}`);
if (over.length === 0) {
    const worst = measured.sort((a, b) => reach(b) - reach(a))[0];
    console.log(`  all fit. Widest: ${reach(worst).toFixed(1)} — ${worst.what} ${JSON.stringify(worst.text)}`);
} else {
    console.log(`  ${over.length} OVERHANG the type area:`);
    for (const l of over.slice(0, 12)) {
        console.log(`    ${reach(l).toFixed(1).padStart(6)}  ${l.what}  ${JSON.stringify(l.text)}`);
    }
}

// The running head and folio are not centred labels — setFurniture anchors each
// to its own margin from its measured width, so neither can overhang by
// construction. What CAN go wrong is the two of them meeting in the middle, so
// that is what gets checked.
const FURNITURE_SCALE = 0.22;
const chapters: string[] = [];
for (const f of MATH_FORMULAS) if (chapters.indexOf(f.chapter) < 0) chapters.push(f.chapter);
const widestHead = chapters
    .map(c => ({ c, w: textW(c, FURNITURE_SCALE) }))
    .sort((a, b) => b.w - a.w)[0];
const widestFolio = textW(`${MATH_FORMULAS.length}`, FURNITURE_SCALE);
const gap = HALF_WIDTH * 2 - widestHead.w - widestFolio;
console.log(`\n  running head + folio: widest head ${widestHead.w.toFixed(1)} ` +
            `("${widestHead.c}"), folio ${widestFolio.toFixed(1)}, ` +
            `gap ${gap.toFixed(1)} units` + (gap < 4 ? '   TOO TIGHT' : ''));

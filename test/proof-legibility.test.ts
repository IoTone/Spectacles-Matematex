// proof-legibility.test.ts — is every label in every proof actually readable?
//
//   npx ts-node --transpile-only test/proof-legibility.test.ts
//   npx ts-node --transpile-only test/proof-legibility.test.ts --id=42
//
// proof-data.test.ts already checks labels against EACH OTHER. This checks them
// against the FIGURE: a label sitting on top of a stroked line, or inside a
// filled polygon, or across a circle's rim. Those are the ones that read as
// "the text is broken" on device, because the glyph and the ink it lands on are
// the same brightness on an additive display and neither wins.
//
// WHAT COUNTS AS OBSCURED
//
// A label is a box: `text.length x CHAR_W` wide by `LINE_H` tall, scaled, and
// centred on its position — the same conservative model proof-data.test.ts
// uses for label-vs-label, so the two agree about how big a word is.
//
//   - LINE      the segment passes through the label's TEXT BAND
//   - CIRCLE    the rim passes through the text band
//   - POLYGON   an opaque fill covers the centre, or an edge crosses the band
//
// "Text band", not "box", and that distinction is the whole test. A label that
// NAMES a line is placed beside it, so a box test flags every correctly-placed
// label in the catalogue — 61 of them, which is a report nobody can act on. A
// stroke only actually damages a glyph when it runs through the middle of the
// text, so the rule is: does the stroke pass within half a text-height of the
// label's CENTRE? Clipping a corner of the bounding box is what a good label
// does; running through the x-height is the defect.
//
// A polygon with no `fill` is an outline: only its edges count.
//
// A label INSIDE a filled polygon is usually correct and not a defect: naming a
// region by putting its name in the middle of it is the whole idiom, and the
// catalogue's fills are washes chosen to be written over — CELL_DIM is alpha
// 0.10, the *_FILL colours are 0.35. Reporting those buried the real findings
// under 180 matrix cells labelling themselves. So a fill only counts when it is
// opaque enough to actually compete: alpha >= FILL_COMPETES.
//
// A STROKE through a glyph is always reported. That is the defect this test
// exists for — a hard line crossing a stem, where the glyph and the ink are the
// same brightness on an additive display and neither wins.
//
// SHADOWS ARE NOT A DEFENCE. `ProofLabel.shadow` puts a dark copy behind the
// glyph, which helps against a WASH but not against a hard stroke crossing a
// stem. This test ignores it deliberately: it reports where a human should
// look, and a shadowed label over a thick line is still worth looking at.

import { PROOFS } from '../Matematex/Assets/ProjectScripts/MathProofData';
import { VisualProof, ProofPrimitive, Vec3 } from '../Matematex/Assets/ProjectScripts/MatematexProof';

const CHAR_W = 0.55;   // conservative: a narrow font, matching proof-data.test.ts
const LINE_H = 0.55;
/** Fill alpha at or above which a label sitting on it is worth a look. The
 *  catalogue's washes are 0.10 and 0.35; anything at 0.5+ is a solid. */
const FILL_COMPETES = 0.5;
/** How close a stroke must pass to a label's centre, as a multiple of the text
 *  half-height, to count as running THROUGH the glyphs rather than beside them. */
const STRIKE = 1.0;

const idArg = process.argv.find(a => a.startsWith('--id='));
const onlyId = idArg ? parseInt(idArg.slice(5), 10) : null;

interface Box { x0: number; y0: number; x1: number; y1: number; }

function labelBox(p: { position: Vec3; text: string; scale?: number }): Box {
    const s = p.scale === undefined ? 1.0 : p.scale;
    const w = p.text.length * CHAR_W * s;
    const h = LINE_H * s;
    return {
        x0: p.position[0] - w / 2, x1: p.position[0] + w / 2,
        y0: p.position[1] - h / 2, y1: p.position[1] + h / 2,
    };
}

/** Cohen–Sutherland outcode, which is the cheap way to ask "does this segment
 *  touch this box" without solving for the intersection point. */
function outcode(x: number, y: number, b: Box): number {
    let c = 0;
    if (x < b.x0) c |= 1; else if (x > b.x1) c |= 2;
    if (y < b.y0) c |= 4; else if (y > b.y1) c |= 8;
    return c;
}

/** Perpendicular distance from a point to a segment. */
function distToSegment(px: number, py: number, a: Vec3, b: Vec3): number {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    if (len2 === 0) return Math.hypot(px - a[0], py - a[1]);
    let t = ((px - a[0]) * vx + (py - a[1]) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy));
}

function segmentHitsBox(a: Vec3, bb: Vec3, box: Box): boolean {
    let x0 = a[0], y0 = a[1], x1 = bb[0], y1 = bb[1];
    let c0 = outcode(x0, y0, box), c1 = outcode(x1, y1, box);
    for (let guard = 0; guard < 8; guard++) {
        if (!(c0 | c1)) return true;          // both inside
        if (c0 & c1) return false;            // both outside the same edge
        const c = c0 || c1;
        let x = 0, y = 0;
        if (c & 8)      { x = x0 + (x1 - x0) * (box.y1 - y0) / (y1 - y0); y = box.y1; }
        else if (c & 4) { x = x0 + (x1 - x0) * (box.y0 - y0) / (y1 - y0); y = box.y0; }
        else if (c & 2) { y = y0 + (y1 - y0) * (box.x1 - x0) / (x1 - x0); x = box.x1; }
        else            { y = y0 + (y1 - y0) * (box.x0 - x0) / (x1 - x0); x = box.x0; }
        if (c === c0) { x0 = x; y0 = y; c0 = outcode(x0, y0, box); }
        else          { x1 = x; y1 = y; c1 = outcode(x1, y1, box); }
    }
    return false;
}

function pointInPolygon(px: number, py: number, pts: Vec3[]): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if ((yi > py) !== (yj > py) &&
            px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** Circle rim vs box: the box is hit when it straddles the radius — i.e. its
 *  nearest point is inside the circle and its farthest is outside. */
function rimHitsBox(cx: number, cy: number, r: number, b: Box): boolean {
    const nx = Math.max(b.x0, Math.min(cx, b.x1));
    const ny = Math.max(b.y0, Math.min(cy, b.y1));
    const near = Math.hypot(nx - cx, ny - cy);
    const far = Math.max(
        Math.hypot(b.x0 - cx, b.y0 - cy), Math.hypot(b.x1 - cx, b.y0 - cy),
        Math.hypot(b.x0 - cx, b.y1 - cy), Math.hypot(b.x1 - cx, b.y1 - cy));
    return near <= r && far >= r;
}

interface Finding { id: number; label: string; what: string; }
const findings: Finding[] = [];
let labelsChecked = 0;
let proofsChecked = 0;

for (const key of Object.keys(PROOFS)) {
    const id = parseInt(key, 10);
    if (onlyId !== null && id !== onlyId) continue;
    const proof: VisualProof = (PROOFS as any)[key];
    if (!proof) continue;

    // Spatial proofs are rotated into a three-quarter view before drawing, so
    // their authored XY is not what the reader sees. Checking them in this
    // frame would report collisions that the rotation resolves and miss ones it
    // creates — worse than not checking, because it would be believed.
    if (proof.spatial) continue;
    proofsChecked++;

    const prims: ProofPrimitive[] = proof.primitives || [];
    const labels = prims.filter(p => p.kind === 'label') as any[];

    for (const lab of labels) {
        labelsChecked++;
        const box = labelBox(lab);
        const cx = lab.position[0], cy = lab.position[1];
        const halfH = (LINE_H * (lab.scale === undefined ? 1 : lab.scale)) / 2;
        const strikes = (a: Vec3, b: Vec3) =>
            segmentHitsBox(a, b, box) && distToSegment(cx, cy, a, b) <= STRIKE * halfH;
        const hits: string[] = [];

        for (const p of prims as any[]) {
            if (p.kind === 'line' || p.kind === 'arrow') {
                const a = p.kind === 'line' ? p.p1 : p.from;
                const b = p.kind === 'line' ? p.p2 : p.to;
                if (strikes(a, b)) hits.push(p.kind);
            } else if (p.kind === 'polygon') {
                const pts: Vec3[] = p.points || [];
                if (pts.length < 3) continue;
                const alpha = p.fill ? (p.fill[3] === undefined ? 1 : p.fill[3]) : 0;
                if (alpha >= FILL_COMPETES &&
                    pointInPolygon(lab.position[0], lab.position[1], pts)) {
                    hits.push(`solid fill (alpha ${alpha.toFixed(2)})`);
                    continue;
                }
                for (let i = 0; i < pts.length; i++) {
                    if (strikes(pts[i], pts[(i + 1) % pts.length])) {
                        hits.push('polygon edge');
                        break;
                    }
                }
            } else if (p.kind === 'circle') {
                const c = p.center || p.centre;
                if (c && rimHitsBox(c[0], c[1], p.radius, box) &&
                    Math.abs(Math.hypot(cx - c[0], cy - c[1]) - p.radius) <= STRIKE * halfH) {
                    hits.push('circle rim');
                }
            }
        }

        if (hits.length > 0) {
            // Collapse duplicates: "6 polygon edges" is the useful number, not
            // six identical lines.
            const counts: { [k: string]: number } = {};
            for (const h of hits) counts[h] = (counts[h] || 0) + 1;
            const what = Object.keys(counts)
                .map(k => counts[k] > 1 ? `${counts[k]} x ${k}` : k).join(', ');
            findings.push({ id, label: lab.text, what });
        }
    }
}

console.log(`proof legibility — ${labelsChecked} labels across ${proofsChecked} flat proofs\n`);
if (findings.length === 0) {
    console.log('  no label sits on a line, an edge or a fill.');
} else {
    findings.sort((a, b) => a.id - b.id);
    let last = -1;
    for (const f of findings) {
        if (f.id !== last) { console.log(`  #${f.id}`); last = f.id; }
        console.log(`      ${JSON.stringify(f.label).padEnd(28)} over ${f.what}`);
    }
    const ids: number[] = [];
    for (const f of findings) if (ids.indexOf(f.id) < 0) ids.push(f.id);
    console.log(`\n  ${findings.length} labels in ${ids.length} proofs: ${ids.join(', ')}`);
}

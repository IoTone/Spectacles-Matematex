// proof-data.test.ts — validate the visual-proof catalog without Lens Studio.
//
//   npx ts-node --transpile-only test/proof-data.test.ts
//
// This works because the proof PRIMITIVES are pure TS — plain [x,y,z] tuples,
// no Lens Studio types at module scope. `renderProof` below them uses SceneObject
// and vec3, but those live inside functions this test never calls.
//
// Checks that would otherwise only surface as a blank or clipped figure on
// device: a proof keyed to a formula id that doesn't exist, degenerate geometry,
// a figure with no visible marks, or labels stranded far outside the drawing
// (they'd be pushed off-screen once the renderer scales the figure to fit).

import { PROOFS, hasProof } from '../Matematex/Assets/ProjectScripts/MathProofData';
import { VisualProof, ProofPrimitive } from '../Matematex/Assets/ProjectScripts/MatematexProof';
import { MATH_FORMULAS } from '../Matematex/Assets/ProjectScripts/MathBookData';

let failures = 0;
function check(cond: boolean, msg: string): void {
    if (!cond) { console.log(`  FAIL  ${msg}`); failures++; }
}

function pointsOf(p: ProofPrimitive): number[][] {
    switch (p.kind) {
        case 'line':    return [p.p1, p.p2];
        case 'polygon': return p.points;
        case 'circle':  return [
            [p.center[0] - p.radius, p.center[1] - p.radius, p.center[2]],
            [p.center[0] + p.radius, p.center[1] + p.radius, p.center[2]],
        ];
        case 'label':   return [p.position];
        case 'arrow':   return [p.from, p.to];
    }
}

/** Bounds of the marks only — labels are excluded, because a label sitting far
 *  outside the drawing is the thing we're trying to detect. */
function markBounds(proof: VisualProof) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of proof.primitives) {
        if (p.kind === 'label') continue;
        for (const pt of pointsOf(p)) {
            minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]);
            minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
            minZ = Math.min(minZ, pt[2]); maxZ = Math.max(maxZ, pt[2]);
        }
    }
    return { minX, maxX, minY, maxY, minZ, maxZ };
}

const ids = Object.keys(PROOFS).map(Number).sort((a, b) => a - b);
console.log(`Proof catalog: ${ids.length} proofs\n`);

for (const id of ids) {
    const proof: VisualProof = (PROOFS as any)[id];
    const formula = MATH_FORMULAS.find(f => f.id === id);
    const b = markBounds(proof);
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const labels = proof.primitives.filter(p => p.kind === 'label').length;
    const marks = proof.primitives.length - labels;

    console.log(`#${id} ${formula ? formula.name : '???'}`);
    const d = b.maxZ - b.minZ;
    console.log(`     ${marks} marks, ${labels} labels, ${w.toFixed(1)} x ${h.toFixed(1)}` +
                `${proof.spatial ? ` x ${d.toFixed(1)} units (spatial)` : ' units'}`);

    // A figure with real depth must say so, or the renderer applies the
    // painter's-stack z bias and shears it.
    check(!(d > 0.01) || proof.spatial === true,
          `#${id}: spans ${d.toFixed(2)} units in z but is not marked spatial — ` +
          `the per-primitive z bias will shear it`);

    check(!!formula, `#${id}: no formula in MathBookData has this id`);
    check(marks > 0, `#${id}: no drawable marks — a proof of only labels renders as floating text`);
    check(isFinite(w) && w > 0, `#${id}: zero or non-finite width`);
    check(isFinite(h) && h > 0, `#${id}: zero or non-finite height`);
    check(!!proof.title, `#${id}: no title`);

    // Title and caption are drawn at a FIXED world size — they do not shrink
    // with the figure — so their length alone decides whether they fit the
    // display. Calibrated against a title that just fits: "Cross Product
    // Magnitude", 23 characters at scale 1.2, spans about half the ~68-unit
    // safe width, giving ~1.25 units per character at scale 1.0. #74's original
    // 91-character caption ran off both edges of the screen.
    // 0.9 keeps a margin: the per-character figure is an estimate from one
    // rendered title, and a caption sitting exactly at the limit is a caption
    // that will clip on a device with a slightly different field of view.
    const budget = (scale: number) => Math.floor(0.9 * 68 / (1.25 * scale));
    check(!proof.title || proof.title.length <= budget(1.2),
          `#${id}: title is ${proof.title!.length} chars, over the ${budget(1.2)} that fit at title scale`);
    check(!proof.caption || proof.caption.length <= budget(0.7),
          `#${id}: caption is ${proof.caption!.length} chars, over the ${budget(0.7)} that fit at caption scale`);

    // Labels should sit near the figure. The renderer scales the whole thing to
    // fit a box, so a stray label at 10x the figure size shrinks everything else
    // to nothing.
    const slack = Math.max(w, h);
    for (const p of proof.primitives) {
        if (p.kind !== 'label') continue;
        const [lx, ly] = p.position;
        check(
            lx > b.minX - slack && lx < b.maxX + slack &&
            ly > b.minY - slack && ly < b.maxY + slack,
            `#${id}: label ${JSON.stringify(p.text)} at (${lx}, ${ly}) is far outside the figure ` +
            `(${b.minX}..${b.maxX}, ${b.minY}..${b.maxY})`,
        );
    }

    // Polygons need 3+ points or they draw nothing.
    for (const p of proof.primitives) {
        if (p.kind === 'polygon') {
            check(p.points.length >= 3, `#${id}: polygon with ${p.points.length} points draws nothing`);
            check(!!(p.fill || p.stroke), `#${id}: polygon has neither fill nor stroke — invisible`);
        }
        if (p.kind === 'circle') {
            check(p.radius > 0, `#${id}: circle with radius ${p.radius}`);
            check(!!(p.fill || p.stroke), `#${id}: circle has neither fill nor stroke — invisible`);
        }
    }
}

// ── Labels sitting on top of each other ─────────────────────────────────
// Two labels in the same place render as one unreadable smear, and it is the
// one defect that survives every other check: the maths is right, the figure
// is right, the text is right, and the reader still cannot read it. With 67
// figures it is not something to catch by looking.
//
// The width model is deliberately the NARROW one — 0.55 units per character at
// scale 1.0, against the ~1.25 worst case calibrated for the title budget. The
// real font sits between them, so a pair that overlaps even at 0.55 overlaps at
// any plausible metric, and this fails only on labels that genuinely collide
// rather than on every pair that happens to sit close. A separate wide-model
// sweep is the right tool for a fit-and-finish pass; this is the hard gate.
//
// Spatial figures are skipped. Their labels are anchored in 3D and the whole
// proof is turned before drawing, so an XY overlap in the authored data says
// nothing about what ends up on screen.
{
    const CHAR_W = 0.55, LINE_H = 0.55;
    for (const id of Object.keys(PROOFS).map(Number).sort((a, b) => a - b)) {
        const proof: VisualProof = (PROOFS as any)[id];
        if (proof.spatial) continue;
        const boxes = (proof.primitives.filter(p => p.kind === 'label') as any[]).map(p => {
            const s = p.scale ?? 1.0;
            const w = p.text.length * CHAR_W * s, h = LINE_H * s;
            return { x: p.position[0], y: p.position[1], hw: w / 2, hh: h / 2, t: p.text as string };
        });
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i], b = boxes[j];
                const ox = a.hw + b.hw - Math.abs(a.x - b.x);
                const oy = a.hh + b.hh - Math.abs(a.y - b.y);
                check(!(ox > 0.05 && oy > 0.05),
                      `#${id}: labels ${JSON.stringify(a.t)} and ${JSON.stringify(b.t)} overlap ` +
                      `by ${ox.toFixed(2)} x ${oy.toFixed(2)} units even at the narrowest ` +
                      `plausible font width — they will render on top of each other`);
            }
        }
    }
}

// ── Label glyph coverage ────────────────────────────────────────────────
// Proof labels are drawn with the TEMPLATE Text3D, whose `font` is null — they
// render in Lens Studio's built-in default, and there is no font file to check
// coverage against. So the check runs the other way: restrict label text to
// characters seen rendering on device, plus ASCII and the common maths block.
//
// This began as one report — "e^(−r²) doesn't render" — which turned out to be
// two problems at once. The caret-and-brace notation rendered LITERALLY, and a
// sweep then found 22 distinct unproven characters across the catalogue:
// modifier letters (ᵐ ᵀ ˣ), subscript letters (ₑ ₓ ₜ ₙ), letterlike symbols
// (ℝ), pictograms (▫ ▭). Plain notation costs nothing and cannot fail.
const SAFE_LABEL_CHARS = new Set([
    ...Array.from({ length: 0x7F - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)),
    ...'αβγδεθλμνπρστφψωΓΔΘΛΠΣΦΨΩ',
    ...'−×÷±≤≥≠≈∞√∫∑∏∂∇∈∉⊂∪∩∅°·⋅→←↔⇒⇔∠∥⊥',
    ...'¹²³½¼¾',
]);

for (const id of Object.keys(PROOFS).map(Number)) {
    const proof: VisualProof = (PROOFS as any)[id];
    const texts: [string, string][] = [
        ['title', proof.title ?? ''],
        ['caption', proof.caption ?? ''],
        ...proof.primitives.filter(p => p.kind === 'label').map(p => ['label', (p as any).text] as [string, string]),
    ];
    for (const [kind, t] of texts) {
        for (const ch of t) {
            check(SAFE_LABEL_CHARS.has(ch),
                  `#${id}: ${kind} ${JSON.stringify(t)} uses ${JSON.stringify(ch)} ` +
                  `(U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}), ` +
                  `which is not known to render in the default label font`);
        }
        // Any caret or underscore at all, not just `^{` and `^(`.
        //
        // The narrower rule was the first fix, made after "e^(−r²)" was
        // reported, and it let `A^T` straight through — which then shipped in
        // #65, #79 and #80 and was reported in turn. A proof label is drawn by
        // the template Text3D as literal characters: there is no markup layer,
        // so `^` and `_` are just the characters `^` and `_` on screen. The
        // rule has to be the whole class.
        //
        // What to write instead: superscript 1, 2 and 3 render (they are in the
        // safe set above), so `ar²` is fine. Nothing else is, so a transpose is
        // a prime, an inverse is `inv(A)`, and a general exponent is spelled
        // out — "r to the n" — or moved into the caption where there is room.
        check(!/[\^_]/.test(t),
              `#${id}: ${kind} ${JSON.stringify(t)} uses ^ or _, which a plain-text ` +
              `label renders literally rather than as a superscript or subscript`);
    }
}

// hasProof must agree with the catalog, since the UI uses it to decide whether
// to offer the Proof button at all.
for (const f of MATH_FORMULAS) {
    check(hasProof(f.id) === (PROOFS[f.id] !== undefined),
          `hasProof(${f.id}) disagrees with the catalog`);
}

console.log(`\n${failures === 0 ? 'all proof data valid' : `${failures} problem(s)`}`);
process.exit(failures > 0 ? 1 : 0);

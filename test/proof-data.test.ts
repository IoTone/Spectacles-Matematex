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
    for (const p of proof.primitives) {
        if (p.kind === 'label') continue;
        for (const pt of pointsOf(p)) {
            minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]);
            minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
        }
    }
    return { minX, maxX, minY, maxY };
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
    console.log(`     ${marks} marks, ${labels} labels, ${w.toFixed(1)} x ${h.toFixed(1)} units`);

    check(!!formula, `#${id}: no formula in MathBookData has this id`);
    check(marks > 0, `#${id}: no drawable marks — a proof of only labels renders as floating text`);
    check(isFinite(w) && w > 0, `#${id}: zero or non-finite width`);
    check(isFinite(h) && h > 0, `#${id}: zero or non-finite height`);
    check(!!proof.title, `#${id}: no title`);

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

// hasProof must agree with the catalog, since the UI uses it to decide whether
// to offer the Proof button at all.
for (const f of MATH_FORMULAS) {
    check(hasProof(f.id) === (PROOFS[f.id] !== undefined),
          `hasProof(${f.id}) disagrees with the catalog`);
}

console.log(`\n${failures === 0 ? 'all proof data valid' : `${failures} problem(s)`}`);
process.exit(failures > 0 ? 1 : 0);

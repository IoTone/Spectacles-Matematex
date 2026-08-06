// MathProofData.ts — Visual proofs paired with formulas in the Book of Math.
//
// Each proof is keyed by formula id and rendered alongside the formula via
// MatematexProof.renderProof. Coordinates are in arbitrary "proof units"
// — the renderer scales them to world units via worldScale.
//
// Authoring guidelines:
//   - Origin at a meaningful anchor (right-angle vertex, circle center, etc.).
//   - Proofs are 2D in the XY plane (z=0). The user walks around the proof
//     in 3D space; the figure itself stays planar for v1.
//   - Use the COLOR_* constants for visual consistency.
//   - Author bounds-aware proofs: keep coords roughly in [-10, +10] so a
//     worldScale of ~1 gives a sensible default size.

import {
    VisualProof,
    ProofPrimitive,
    COLOR_INK,
    COLOR_BLUE, COLOR_RED, COLOR_GREEN, COLOR_AMBER,
    COLOR_BLUE_FILL, COLOR_RED_FILL, COLOR_GREEN_FILL,
} from './MatematexProof';

// ─── Pythagoras (formula #1: a² + b² = c²) ──────────────────────────────
//
// Classic "look-see" proof: right triangle with squares built outward on
// each side. The visible areas of the squares satisfy a² + b² = c².
//
// Layout (units = ~1 inch each, triangle is 3-4-5):
//   - Right angle at origin (0,0)
//   - Horizontal leg a=3 along +x to (3,0)
//   - Vertical leg b=4 along +y to (0,4)
//   - Hypotenuse c=5 from (3,0) to (0,4)
//   - a-square below: y from 0 down to -3
//   - b-square left:  x from 0 left to -4
//   - c-square outward NE of hypotenuse: corners (3,0),(0,4),(4,7),(7,3)

const PROOF_PYTHAGORAS: VisualProof = {
    title: 'Pythagorean Theorem',
    caption: 'a² + b² = c²',
    primitives: [
        // Square on leg a (below horizontal leg) — blue
        {
            kind: 'polygon',
            points: [[0, 0, 0], [3, 0, 0], [3, -3, 0], [0, -3, 0]],
            fill: COLOR_BLUE_FILL,
            stroke: COLOR_BLUE,
            strokeThickness: 0.05,
        },
        // Square on leg b (left of vertical leg) — red
        {
            kind: 'polygon',
            points: [[0, 0, 0], [-4, 0, 0], [-4, 4, 0], [0, 4, 0]],
            fill: COLOR_RED_FILL,
            stroke: COLOR_RED,
            strokeThickness: 0.05,
        },
        // Square on hypotenuse c (outward, NE) — green
        {
            kind: 'polygon',
            points: [[3, 0, 0], [0, 4, 0], [4, 7, 0], [7, 3, 0]],
            fill: COLOR_GREEN_FILL,
            stroke: COLOR_GREEN,
            strokeThickness: 0.05,
        },
        // The right triangle itself — outlined, no fill
        {
            kind: 'polygon',
            points: [[0, 0, 0], [3, 0, 0], [0, 4, 0]],
            stroke: COLOR_INK,
            strokeThickness: 0.06,
        },
        // Right-angle marker (small square at the vertex)
        {
            kind: 'polygon',
            points: [[0, 0, 0], [0.35, 0, 0], [0.35, 0.35, 0], [0, 0.35, 0]],
            stroke: COLOR_INK,
            strokeThickness: 0.04,
        },
        // Side labels
        { kind: 'label', position: [1.5, 0.4, 0], text: 'a',  scale: 0.9, color: COLOR_INK },
        { kind: 'label', position: [-0.5, 2, 0], text: 'b',  scale: 0.9, color: COLOR_INK },
        { kind: 'label', position: [2.0, 2.6, 0], text: 'c',  scale: 0.9, color: COLOR_INK },
        // Area labels in the centers of the squares
        { kind: 'label', position: [1.5, -1.5, 0], text: 'a²', scale: 1.1, color: COLOR_BLUE },
        { kind: 'label', position: [-2, 2, 0], text: 'b²', scale: 1.1, color: COLOR_RED },
        { kind: 'label', position: [3.5, 3.5, 0], text: 'c²', scale: 1.1, color: COLOR_GREEN },
    ],
};

// ─── Difference of squares (formula #22: a² − b² = (a+b)(a−b)) ──────────
//
// The dissection proof. Start with an a×a square and cut a b×b square out of
// one corner. The remaining L-shape splits into two rectangles that reassemble
// into a single (a+b)×(a−b) rectangle — so the L's area is both a²−b² and
// (a+b)(a−b).
//
// Drawn with a=5, b=2, origin at the big square's bottom-left. The two pieces
// are coloured separately so the reader can follow where each one goes.

const PROOF_DIFFERENCE_OF_SQUARES: VisualProof = {
    title: 'Difference of Squares',
    caption: 'a² − b² = (a+b)(a−b)',
    primitives: [
        // Piece 1 — the full-width strip below the cut, 5 × 3
        { kind: 'polygon', points: [[0, 0, 0], [5, 0, 0], [5, 3, 0], [0, 3, 0]],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.05 },
        // Piece 2 — the remaining block left of the cut, 3 × 2
        { kind: 'polygon', points: [[0, 3, 0], [3, 3, 0], [3, 5, 0], [0, 5, 0]],
          fill: COLOR_GREEN_FILL, stroke: COLOR_GREEN, strokeThickness: 0.05 },
        // The removed b×b corner — outlined only, since it is what's taken away
        { kind: 'polygon', points: [[3, 3, 0], [5, 3, 0], [5, 5, 0], [3, 5, 0]],
          stroke: COLOR_RED, strokeThickness: 0.05 },

        { kind: 'label', position: [2.5, -0.6, 0], text: 'a',       scale: 0.9, color: COLOR_INK },
        { kind: 'label', position: [-0.6, 2.5, 0], text: 'a',       scale: 0.9, color: COLOR_INK },
        { kind: 'label', position: [4.0, 5.6, 0],  text: 'b',       scale: 0.9, color: COLOR_RED },
        { kind: 'label', position: [5.7, 4.0, 0],  text: 'b',       scale: 0.9, color: COLOR_RED },
        { kind: 'label', position: [2.5, 1.5, 0],  text: 'a(a−b)',  scale: 0.8, color: COLOR_BLUE },
        { kind: 'label', position: [1.5, 4.0, 0],  text: 'b(a−b)',  scale: 0.8, color: COLOR_GREEN },
        { kind: 'label', position: [4.0, 4.0, 0],  text: 'b²',      scale: 0.8, color: COLOR_RED },
    ],
};

// ─── Distance formula (formula #10) ─────────────────────────────────────
//
// Straight from Pythagoras: the segment between two points is the hypotenuse
// of the right triangle whose legs are the coordinate differences.

const PROOF_DISTANCE: VisualProof = {
    title: 'Distance Formula',
    caption: 'd = √((x₂−x₁)² + (y₂−y₁)²)',
    primitives: [
        { kind: 'polygon', points: [[0, 0, 0], [4, 0, 0], [4, 3, 0]],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.05 },
        // Right-angle marker at the corner where the legs meet
        { kind: 'polygon', points: [[3.6, 0, 0], [4, 0, 0], [4, 0.4, 0], [3.6, 0.4, 0]],
          stroke: COLOR_INK, strokeThickness: 0.04 },
        { kind: 'line', p1: [0, 0, 0], p2: [4, 3, 0], color: COLOR_AMBER, thickness: 0.07 },

        { kind: 'label', position: [-0.5, -0.5, 0], text: '(x₁, y₁)', scale: 0.7, color: COLOR_INK },
        { kind: 'label', position: [4.6, 3.3, 0],   text: '(x₂, y₂)', scale: 0.7, color: COLOR_INK },
        { kind: 'label', position: [2.0, -0.7, 0],  text: 'x₂ − x₁',  scale: 0.75, color: COLOR_BLUE },
        { kind: 'label', position: [5.0, 1.5, 0],   text: 'y₂ − y₁',  scale: 0.75, color: COLOR_BLUE },
        { kind: 'label', position: [1.6, 2.0, 0],   text: 'd',        scale: 0.95, color: COLOR_AMBER },
    ],
};

// ─── Area of a circle (formula #5: A = πr²) ─────────────────────────────
//
// The sector-dissection argument: cut the disc into equal wedges and interleave
// them, and the result approaches a rectangle of height r and width half the
// circumference, πr — so the area is πr². Here the wedges are drawn in place;
// the caption carries the rearrangement.

const CIRCLE_SECTORS = 12;
const circleSectorLines = (): ProofPrimitive[] => {
    const out: ProofPrimitive[] = [];
    for (let i = 0; i < CIRCLE_SECTORS; i++) {
        const t = (i / CIRCLE_SECTORS) * Math.PI * 2;
        out.push({
            kind: 'line',
            p1: [0, 0, 0],
            p2: [Math.cos(t) * 3, Math.sin(t) * 3, 0],
            color: i % 2 === 0 ? COLOR_BLUE : COLOR_GREEN,
            thickness: 0.035,
        });
    }
    return out;
};

const PROOF_CIRCLE_AREA: VisualProof = {
    title: 'Area of a Circle',
    caption: 'cut into wedges, they reassemble into an r × πr rectangle',
    primitives: [
        { kind: 'circle', center: [0, 0, 0], radius: 3, segments: 48,
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.05 },
        ...circleSectorLines(),
        { kind: 'line', p1: [0, 0, 0], p2: [3, 0, 0], color: COLOR_AMBER, thickness: 0.08 },
        { kind: 'label', position: [1.5, 0.5, 0],  text: 'r',    scale: 0.95, color: COLOR_AMBER },
        { kind: 'label', position: [0, -3.8, 0],   text: 'A = πr²', scale: 0.9, color: COLOR_INK },
    ],
};

// ─── Heron's formula (formula #13) ──────────────────────────────────────
//
// Not a derivation — a labelling of the quantities the formula consumes, so the
// reader can see what s, and each (s − side), refer to on an actual triangle.

const PROOF_HERON: VisualProof = {
    title: "Heron's Formula",
    caption: 's = (a+b+c)/2,  A = √(s(s−a)(s−b)(s−c))',
    primitives: [
        { kind: 'polygon', points: [[0, 0, 0], [6, 0, 0], [4.2, 3.6, 0]],
          fill: COLOR_GREEN_FILL, stroke: COLOR_GREEN, strokeThickness: 0.06 },
        { kind: 'label', position: [3.0, -0.7, 0], text: 'c', scale: 0.95, color: COLOR_INK },
        { kind: 'label', position: [5.6, 2.0, 0],  text: 'a', scale: 0.95, color: COLOR_INK },
        { kind: 'label', position: [1.7, 2.1, 0],  text: 'b', scale: 0.95, color: COLOR_INK },
        { kind: 'label', position: [3.0, 1.3, 0],  text: 'A', scale: 1.1,  color: COLOR_GREEN },
    ],
};

// ─── Catalog ────────────────────────────────────────────────────────────
//
// Keyed by formula id (1-based, matches MathFormula.id). Look up via
// PROOFS[formula.id] — undefined means no proof available.

export const PROOFS: { [id: number]: VisualProof } = {
    1:  PROOF_PYTHAGORAS,
    5:  PROOF_CIRCLE_AREA,
    10: PROOF_DISTANCE,
    13: PROOF_HERON,
    22: PROOF_DIFFERENCE_OF_SQUARES,
    // Future: 18 (Euler polyhedron) needs out-of-plane primitives — the
    // renderer is XY-planar today, so a polyhedron would have to be drawn in
    // an oblique projection by hand. Scoped with Phase 7.2.
};

/** Formula ids that have a visual proof, for UI that needs to know whether to
 *  offer a "Proof" affordance before rendering anything. */
export function hasProof(formulaId: number): boolean {
    return PROOFS[formulaId] !== undefined;
}

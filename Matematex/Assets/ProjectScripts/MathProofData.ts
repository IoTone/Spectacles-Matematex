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

// ─── Catalog ────────────────────────────────────────────────────────────
//
// Keyed by formula id (1-based, matches MathFormula.id). Look up via
// PROOFS[formula.id] — undefined means no proof available.

export const PROOFS: { [id: number]: VisualProof } = {
    1: PROOF_PYTHAGORAS,
    // Future: 13 (Heron), 18 (Euler polyhedron), 5 (circle area), etc.
};

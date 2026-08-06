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
    Vec3, Color,
    boxFaces, boxEdges, boxCentre, opaque, revolve,
    COLOR_INK,
    COLOR_BLUE, COLOR_RED, COLOR_GREEN, COLOR_AMBER,
    COLOR_BLUE_FILL, COLOR_RED_FILL, COLOR_GREEN_FILL, COLOR_AMBER_FILL,
} from './MatematexProof';
import {
    rectPieces, dimension, rightAngle, angleArc, PIECE_COLORS,
    matrixGrid, GridCell, unitSquareImage,
} from './MathProofTemplates';

// ─── Pythagoras (formula #1: a² + b² = c²) ──────────────────────────────
//
// The rearrangement proof, not the usual "squares on the sides" picture. That
// picture draws squares of area a², b², c² and labels them — which states the
// theorem without giving any reason to believe it. Nothing in it shows WHY the
// two smaller areas sum to the larger.
//
// This one does. Two squares, each (a+b) on a side, so each has the same total
// area. Both hold the SAME four copies of the a-b-c right triangle. Whatever
// is left over must therefore be equal — and on the left the leftover is one
// tilted c×c square, while on the right it is an a×a and a b×b square.
// Hence c² = a² + b², by subtracting equals from equals.
//
// Drawn at a=3, b=4 (so a+b=7, c=5), the two squares side by side with a gap:
//   left  square (0,0)-(7,7)    four triangles in the corners, c² tilted inside
//   right square (9,0)-(16,7)   b² lower-left, a² upper-right, four triangles
//
// The triangles are all one colour on purpose: they have to read as four copies
// of one shape, present in both squares, or the argument does not land.

const PY_A = 3, PY_B = 4, PY_S = PY_A + PY_B;   // legs and the big square's side
const PY_GAP = 2;
const RX = PY_S + PY_GAP;                        // x-origin of the right square

/** One copy of the a-b-c triangle, as a filled polygon. */
const pyTriangle = (pts: Vec3[]): ProofPrimitive => ({
    kind: 'polygon',
    points: pts,
    fill: COLOR_AMBER_FILL,
    stroke: COLOR_AMBER,
    strokeThickness: 0.05,
});

const PROOF_PYTHAGORAS: VisualProof = {
    title: 'Pythagorean Theorem',
    caption: 'same (a+b)² square, same four triangles - so c² = a² + b²',
    family: 'B',
    primitives: [
        // ── Left square: four triangles pinwheeled around a tilted c² ──
        {
            kind: 'polygon',
            points: [[0, 0, 0], [PY_S, 0, 0], [PY_S, PY_S, 0], [0, PY_S, 0]],
            stroke: COLOR_INK,
            strokeThickness: 0.06,
        },
        // The leftover: a square on the hypotenuse, area c².
        {
            kind: 'polygon',
            points: [[PY_A, 0, 0], [PY_S, PY_A, 0], [PY_B, PY_S, 0], [0, PY_B, 0]],
            fill: COLOR_GREEN_FILL,
            stroke: COLOR_GREEN,
            strokeThickness: 0.06,
        },
        pyTriangle([[0, 0, 0], [PY_A, 0, 0], [0, PY_B, 0]]),
        pyTriangle([[PY_A, 0, 0], [PY_S, 0, 0], [PY_S, PY_A, 0]]),
        pyTriangle([[PY_S, PY_A, 0], [PY_S, PY_S, 0], [PY_B, PY_S, 0]]),
        pyTriangle([[PY_B, PY_S, 0], [0, PY_S, 0], [0, PY_B, 0]]),

        // ── Right square: the same four triangles, packed into two corners ──
        {
            kind: 'polygon',
            points: [[RX, 0, 0], [RX + PY_S, 0, 0], [RX + PY_S, PY_S, 0], [RX, PY_S, 0]],
            stroke: COLOR_INK,
            strokeThickness: 0.06,
        },
        // The leftovers: a b×b square and an a×a square.
        {
            kind: 'polygon',
            points: [[RX, 0, 0], [RX + PY_B, 0, 0], [RX + PY_B, PY_B, 0], [RX, PY_B, 0]],
            fill: COLOR_RED_FILL,
            stroke: COLOR_RED,
            strokeThickness: 0.06,
        },
        {
            kind: 'polygon',
            points: [[RX + PY_B, PY_B, 0], [RX + PY_S, PY_B, 0], [RX + PY_S, PY_S, 0], [RX + PY_B, PY_S, 0]],
            fill: COLOR_BLUE_FILL,
            stroke: COLOR_BLUE,
            strokeThickness: 0.06,
        },
        pyTriangle([[RX + PY_B, 0, 0], [RX + PY_S, 0, 0], [RX + PY_B, PY_B, 0]]),
        pyTriangle([[RX + PY_S, 0, 0], [RX + PY_S, PY_B, 0], [RX + PY_B, PY_B, 0]]),
        pyTriangle([[RX, PY_B, 0], [RX + PY_B, PY_B, 0], [RX, PY_S, 0]]),
        pyTriangle([[RX + PY_B, PY_B, 0], [RX + PY_B, PY_S, 0], [RX, PY_S, 0]]),

        // Leftover areas — the whole point of the figure.
        { kind: 'label', position: [PY_S / 2, PY_S / 2, 0], text: 'c²', scale: 1.2, color: COLOR_GREEN },
        { kind: 'label', position: [RX + PY_B / 2, PY_B / 2, 0], text: 'b²', scale: 1.2, color: COLOR_RED },
        { kind: 'label', position: [RX + PY_B + PY_A / 2, PY_B + PY_A / 2, 0], text: 'a²', scale: 1.2, color: COLOR_BLUE },
        // Both squares are the same size — say so, since it is the hinge.
        { kind: 'label', position: [PY_S / 2, -0.9, 0], text: '(a+b)²', scale: 0.85, color: COLOR_INK },
        { kind: 'label', position: [RX + PY_S / 2, -0.9, 0], text: '(a+b)²', scale: 0.85, color: COLOR_INK },
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
    family: 'A',
    claim: { total: 5 * 3 + 3 * 2 },
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
    caption: 'd = √((x2−x1)² + (y2−y1)²)',
    family: 'E',
    primitives: [
        { kind: 'polygon', points: [[0, 0, 0], [4, 0, 0], [4, 3, 0]],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.05 },
        rightAngle([4, 0, 0], [-1, 0, 0], [0, 1, 0], 0.4),
        { kind: 'line', p1: [0, 0, 0], p2: [4, 3, 0], color: COLOR_AMBER, thickness: 0.07 },

        { kind: 'label', position: [-0.7, -0.55, 0], text: '(x1, y1)', scale: 0.7, color: COLOR_INK },
        { kind: 'label', position: [4.6, 3.3, 0],   text: '(x2, y2)', scale: 0.7, color: COLOR_INK },
        // Clear of the corner label above it: both are wide, and at their old
        // y they sat 0.2 units apart — effectively on the same line.
        { kind: 'label', position: [2.0, -1.6, 0],  text: 'x2 − x1',  scale: 0.75, color: COLOR_BLUE },
        { kind: 'label', position: [5.0, 1.5, 0],   text: 'y2 − y1',  scale: 0.75, color: COLOR_BLUE },
        { kind: 'label', position: [1.6, 2.0, 0],   text: 'd',        scale: 0.95, color: COLOR_AMBER },
    ],
};

// ─── Area of a circle (formula #5: A = πr²) ─────────────────────────────
//
// The sector-dissection argument, with the dissection actually drawn. The
// previous version showed a disc scored into twelve wedges and left the whole
// argument — that the wedges interleave into a rectangle — to the caption. The
// reader was told the conclusion rather than shown it.
//
// Here both halves are on screen: the disc cut into twelve equal wedges, and
// beside it those same twelve wedges interleaved apex-up / apex-down into a
// strip. The strip is r tall (each wedge's radius) and πr wide (six arcs along
// each edge, half the circumference of 2πr) — so A = r · πr = πr².
//
// Wedges are drawn as polygons with a real arc, not flat triangles, so the
// strip's edges are visibly scalloped. That is honest: the identity is exact
// only in the limit, and with twelve wedges you can see the approximation.

const CIRCLE_R = 2.5;
const CIRCLE_SECTORS = 12;
const SECTOR_ANGLE = (Math.PI * 2) / CIRCLE_SECTORS;
const ARC_STEPS = 4;
/** Arc length of one wedge — the spacing that makes the strip exactly πr wide. */
const WEDGE_W = (Math.PI * CIRCLE_R) / (CIRCLE_SECTORS / 2);
const DISC_CX = -6.2;
const STRIP_X0 = -1.0;
const STRIP_HALF_H = CIRCLE_R / 2;

/** A wedge with apex at (cx, cy), its arc centred on `bisector` radians. */
function wedge(cx: number, cy: number, bisector: number, color: Color, fill: Color): ProofPrimitive {
    const pts: Vec3[] = [[cx, cy, 0]];
    for (let k = 0; k <= ARC_STEPS; k++) {
        const t = bisector - SECTOR_ANGLE / 2 + (k / ARC_STEPS) * SECTOR_ANGLE;
        pts.push([cx + Math.cos(t) * CIRCLE_R, cy + Math.sin(t) * CIRCLE_R, 0]);
    }
    return { kind: 'polygon', points: pts, fill, stroke: color, strokeThickness: 0.04 };
}

const wedgeColor = (i: number) => (i % 2 === 0 ? COLOR_BLUE : COLOR_GREEN);
const wedgeFill  = (i: number) => (i % 2 === 0 ? COLOR_BLUE_FILL : COLOR_GREEN_FILL);

/** The disc: twelve wedges sharing an apex at the centre. */
const discWedges = (): ProofPrimitive[] => {
    const out: ProofPrimitive[] = [];
    for (let i = 0; i < CIRCLE_SECTORS; i++) {
        out.push(wedge(DISC_CX, 0, (i + 0.5) * SECTOR_ANGLE, wedgeColor(i), wedgeFill(i)));
    }
    return out;
};

/** The same twelve wedges, interleaved into a strip: even ones point up from
 *  the bottom edge, odd ones point down from the top, so their arcs tile the
 *  two edges alternately. */
const stripWedges = (): ProofPrimitive[] => {
    const out: ProofPrimitive[] = [];
    for (let i = 0; i < CIRCLE_SECTORS; i++) {
        const j = Math.floor(i / 2);
        if (i % 2 === 0) {
            // apex on the bottom edge, arc opening upward
            out.push(wedge(STRIP_X0 + j * WEDGE_W, -STRIP_HALF_H, Math.PI / 2, wedgeColor(i), wedgeFill(i)));
        } else {
            // apex on the top edge, arc opening downward, offset half a wedge
            out.push(wedge(STRIP_X0 + (j + 0.5) * WEDGE_W, STRIP_HALF_H, -Math.PI / 2, wedgeColor(i), wedgeFill(i)));
        }
    }
    return out;
};

const STRIP_RIGHT = STRIP_X0 + 5.5 * WEDGE_W;

const PROOF_CIRCLE_AREA: VisualProof = {
    title: 'Area of a Circle',
    caption: 'the same wedges, interleaved: r tall, πr wide - so A = πr²',
    family: 'D',
    primitives: [
        ...discWedges(),
        // The radius, so `r` is anchored to something concrete on the disc.
        { kind: 'line', p1: [DISC_CX, 0, 0], p2: [DISC_CX + CIRCLE_R, 0, 0],
          color: COLOR_AMBER, thickness: 0.07 },
        { kind: 'label', position: [DISC_CX + CIRCLE_R / 2, 0.45, 0], text: 'r', scale: 0.9, color: COLOR_AMBER },

        // Gap sized so the arrow has a shaft: the disc's right edge is at
        // DISC_CX+r and the strip's leftmost arc point sits half a chord left
        // of STRIP_X0, so aim between them rather than at the nominal origins.
        { kind: 'arrow', from: [DISC_CX + CIRCLE_R + 0.4, 0, 0],
          to: [STRIP_X0 - CIRCLE_R * Math.sin(SECTOR_ANGLE / 2) - 0.4, 0, 0],
          color: COLOR_INK, thickness: 0.05, headSize: 0.3 },

        ...stripWedges(),
        // The strip's two dimensions — the entire content of the argument.
        { kind: 'label', position: [STRIP_RIGHT + 1.15, 0, 0], text: 'r', scale: 0.9, color: COLOR_AMBER },
        { kind: 'label', position: [STRIP_X0 + 2.5 * WEDGE_W, -STRIP_HALF_H - 1.0, 0],
          text: 'πr', scale: 0.9, color: COLOR_AMBER },
    ],
};

// ─── Heron's formula (formula #13) ──────────────────────────────────────
//
// The incircle figure. The previous version just labelled a triangle's sides
// a, b, c and its area A — which shows where the formula's inputs live but
// derives nothing, and leaves s−a, s−b, s−c as pure algebra with no picture.
//
// The incircle is what makes them geometric. The two tangent segments from any
// vertex are equal (both are legs of congruent right triangles sharing the
// hypotenuse to the incentre), so the six segments come in three pairs x, y, z
// with x+y+z = s. The pair at A is then s−a, at B is s−b, at C is s−c — and
// side c is visibly cut into exactly (s−a) + (s−b), which is the fact the
// figure is drawn to show.
//
// Dropping the inradius to each side splits the triangle into three slivers of
// area ½r·(side), so A = r·s. Heron follows from r² = (s−a)(s−b)(s−c)/s, which
// is the one algebraic step the figure cannot draw — so the caption states it
// rather than pretending the picture is a complete derivation.
//
// Positions are computed, not transcribed: the incentre and the three tangent
// points must sit exactly on the sides or the figure quietly lies.

const HERON_TRI: Vec3[] = [[0, 0, 0], [6, 0, 0], [4.2, 3.6, 0]];

const heronGeometry = () => {
    const [A, B, C] = HERON_TRI;
    const d = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const a = d(B, C), b = d(C, A), c = d(A, B);
    const per = a + b + c;
    const I: Vec3 = [(a * A[0] + b * B[0] + c * C[0]) / per, (a * A[1] + b * B[1] + c * C[1]) / per, 0];
    const s = per / 2;
    const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
    const r = area / s;
    /** Foot of the perpendicular from the incentre to segment PQ — the point
     *  where the incircle touches that side. */
    const touch = (P: Vec3, Q: Vec3): Vec3 => {
        const vx = Q[0] - P[0], vy = Q[1] - P[1];
        const t = ((I[0] - P[0]) * vx + (I[1] - P[1]) * vy) / (vx * vx + vy * vy);
        return [P[0] + t * vx, P[1] + t * vy, 0];
    };
    return { A, B, C, a, b, c, s, r, I, area,
             tAB: touch(A, B), tBC: touch(B, C), tCA: touch(C, A) };
};

const HG = heronGeometry();

/** The inradius, drawn to one side, plus a dot marking each tangency. */
const heronIncircleMarks = (): ProofPrimitive[] => [
    { kind: 'circle', center: HG.I, radius: HG.r, segments: 40,
      stroke: COLOR_AMBER, strokeThickness: 0.05 },
    { kind: 'line', p1: HG.I, p2: HG.tAB, color: COLOR_AMBER, thickness: 0.05 },
    ...([HG.tAB, HG.tBC, HG.tCA] as Vec3[]).map((p): ProofPrimitive => ({
        kind: 'circle', center: p, radius: 0.09, segments: 10,
        fill: COLOR_AMBER, stroke: COLOR_AMBER, strokeThickness: 0.02,
    })),
];

const PROOF_HERON: VisualProof = {
    title: "Heron's Formula",
    caption: 'the incircle cuts the sides into s−a, s−b, s−c, and A = r·s',
    family: 'G',
    primitives: [
        { kind: 'polygon', points: HERON_TRI,
          fill: COLOR_GREEN_FILL, stroke: COLOR_GREEN, strokeThickness: 0.06 },
        ...heronIncircleMarks(),

        // Side c is split by the tangency into exactly (s−a) + (s−b).
        { kind: 'label', position: [(HG.A[0] + HG.tAB[0]) / 2, -0.5, 0],
          text: 's−a', scale: 0.75, color: COLOR_AMBER },
        { kind: 'label', position: [(HG.B[0] + HG.tAB[0]) / 2, -0.5, 0],
          text: 's−b', scale: 0.75, color: COLOR_AMBER },
        { kind: 'label', position: [5.15, 3.05, 0], text: 's−c', scale: 0.75, color: COLOR_AMBER },
        { kind: 'label', position: [HG.I[0] + 0.42, HG.r / 2, 0], text: 'r', scale: 0.8, color: COLOR_AMBER },

        // The sides themselves, outside the triangle so they clear the incircle.
        { kind: 'label', position: [5.75, 2.05, 0], text: 'a', scale: 0.95, color: COLOR_INK },
        { kind: 'label', position: [1.60, 2.30, 0], text: 'b', scale: 0.95, color: COLOR_INK },
        { kind: 'label', position: [3.00, -1.25, 0], text: 'c', scale: 0.95, color: COLOR_INK },
    ],
};

// ─── Difference of cubes (formula #24: a³ − b³ = (a−b)(a²+ab+b²)) ───────
//
// The 3D counterpart of #22, and the first proof drawn as a solid. Cut a b×b×b
// corner out of an a×a×a cube; what remains falls into three rectangular
// slabs, each exactly (a−b) thick in one direction:
//
//   x from b to a, full y, full z   →  (a−b) · a · a
//   x below b, y from b to a, full z →  (a−b) · a · b
//   x,y below b, z from b to a       →  (a−b) · b · b
//
// so a³ − b³ = (a−b)(a² + ab + b²). Flattening this into a plane would mean
// drawing an oblique projection by hand and asking the reader to believe the
// hidden thirds; on a headset they can walk around it and check.
//
// The slabs are drawn pulled slightly apart along the axis each one extends
// in, so the seams between them are visible rather than butted invisibly
// together. CUBE_SLABS holds the true, unexploded decomposition — the test
// verifies the tiling from that, so the visual gap cannot hide an error.

const DC_A = 4, DC_B = 2;
// Far enough apart that no piece hides behind another from the default
// three-quarter view. At 0.55 the b³ corner sat directly behind slab 3 along
// the view axis and behind slab 1 as well — the proof-math test now checks
// this rather than leaving it to be discovered on the headset.
const DC_GAP = 1.3;

export const CUBE_SLABS: { min: Vec3, size: Vec3, shift: Vec3, label: string }[] = [
    { min: [DC_B, 0, 0], size: [DC_A - DC_B, DC_A, DC_A], shift: [DC_GAP, 0, 0], label: '(a−b)a²' },
    { min: [0, DC_B, 0], size: [DC_B, DC_A - DC_B, DC_A], shift: [0, DC_GAP, 0], label: '(a−b)ab' },
    { min: [0, 0, DC_B], size: [DC_B, DC_B, DC_A - DC_B], shift: [0, 0, DC_GAP], label: '(a−b)b²' },
];

// Opaque, not the 0.35-alpha fills the flat proofs use: a see-through solid
// reads as a tinted pane rather than a block, and the per-face shading that
// gives it its shape is washed out by whatever shows through.
const DC_COLORS: [Color, Color][] = [
    [opaque(COLOR_BLUE_FILL), COLOR_BLUE],
    [opaque(COLOR_GREEN_FILL), COLOR_GREEN],
    [opaque(COLOR_AMBER_FILL), COLOR_AMBER],
];

// Labels are lightened well clear of the face they name. Shading darkens a
// face to between 0.62 and 0.87 of its base colour, so a label in that same
// base colour sits only a little above its own slab; the drop shadow does the
// rest of the work.
const lighten = (c: Color, k: number): Color =>
    [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k, 1.0];

const shifted = (v: Vec3, by: Vec3): Vec3 => [v[0] + by[0], v[1] + by[1], v[2] + by[2]];

const PROOF_DIFFERENCE_OF_CUBES: VisualProof = {
    title: 'Difference of Cubes',
    caption: 'a³ − b³ splits into three slabs, each (a−b) thick',
    family: 'A',
    spatial: true,
    primitives: [
        // The b³ corner that was removed — wireframe, because it is the part
        // that is NOT there. A filled box would read as a fourth piece.
        ...boxEdges([0, 0, 0], [DC_B, DC_B, DC_B], COLOR_RED, 0.06),

        ...CUBE_SLABS.flatMap((sl, i) =>
            boxFaces(shifted(sl.min, sl.shift), sl.size,
                     DC_COLORS[i][0], DC_COLORS[i][1], 0.05)),

        // Labels sit past the far end of each slab, along the axis that slab
        // was pulled out on, so each one reads as belonging to its own piece.
        //
        // Scale is well below the 0.75 used on flat proofs: a proof label is
        // drawn at a fixed world size rather than scaling with the figure, and
        // at 0.75 a seven-character label came out nearly half the width of the
        // whole solid.
        { kind: 'label', position: [DC_A + DC_GAP + 1.4, DC_A / 2, DC_A / 2],
          text: CUBE_SLABS[0].label, scale: 0.45, color: lighten(COLOR_BLUE, 0.45) },
        { kind: 'label', position: [DC_B / 2, DC_A + DC_GAP + 1.4, DC_A / 2],
          text: CUBE_SLABS[1].label, scale: 0.45, color: lighten(COLOR_GREEN, 0.45) },
        { kind: 'label', position: [DC_B / 2, DC_B / 2, DC_A + DC_GAP + 1.4],
          text: CUBE_SLABS[2].label, scale: 0.45, color: lighten(COLOR_AMBER, 0.45) },
        { kind: 'label', position: [-1.7, DC_B / 2, DC_B / 2], text: 'b³',
          scale: 0.5, color: lighten(COLOR_RED, 0.35) },
    ],
};

// ─── Cross product magnitude (formula #74: |a×b| = |a||b| sin θ) ────────
//
// The second spatial proof, and a deliberately different shape of problem from
// #24: nothing here is axis-aligned. The parallelogram sits at a slant, the
// height drops at an angle to it, and a×b leaves the plane entirely — which is
// what a cross product is FOR, and why no flat drawing can carry it.
//
// What the figure argues: the parallelogram spanned by a and b has base |a|.
// Dropping a perpendicular from the tip of b to the line of a makes a right
// triangle whose hypotenuse is b, so that height is |b| sin θ. Area of a
// parallelogram is base times height, hence |a||b| sin θ. The product vector is
// drawn perpendicular to the plane AT ITS TRUE LENGTH, so the reader can see
// that its length is that same area rather than being told so.
//
// Identifying |a×b| with the area is the definition of the cross product's
// magnitude; the figure shows what that definition amounts to and does not
// pretend to derive it. The caption says as much.

const CP_ALEN = 3.0;
const CP_BLEN = 2.0;
const CP_THETA = 55 * Math.PI / 180;

const CP_A: Vec3 = [CP_ALEN, 0, 0];
const CP_B: Vec3 = [CP_BLEN * Math.cos(CP_THETA), CP_BLEN * Math.sin(CP_THETA), 0];
const CP_AB: Vec3 = [CP_A[0] + CP_B[0], CP_A[1] + CP_B[1], 0];
/** a×b for two vectors in the z=0 plane: only the z component survives. */
const CP_CROSS: Vec3 = [0, 0, CP_A[0] * CP_B[1] - CP_A[1] * CP_B[0]];
/** Foot of the perpendicular from the tip of b onto the line of a. */
const CP_FOOT: Vec3 = [CP_B[0], 0, 0];
/** Annotations drawn ON the parallelogram need lifting clear of its face, the
 *  same way strokes ride proud of their fill. */
const CP_LIFT = 0.03;

const PROOF_CROSS_PRODUCT: VisualProof = {
    title: 'Cross Product Magnitude',
    caption: '|a×b| = the shaded area = |a| × |b| sin θ, at true length',
    family: 'E',
    spatial: true,
    primitives: [
        // The parallelogram a and b span. outwardFrom sits below its plane so
        // the face is shaded rather than flat-filled.
        {
            kind: 'polygon',
            points: [[0, 0, 0], CP_A, CP_AB, CP_B],
            fill: opaque(COLOR_BLUE_FILL),
            stroke: COLOR_BLUE,
            strokeThickness: 0.05,
            outwardFrom: [CP_AB[0] / 2, CP_AB[1] / 2, -2],
        },

        // Height: perpendicular from the tip of b down to the line of a, with a
        // right-angle mark at the foot. This is the step that turns |b| into
        // |b| sin θ.
        { kind: 'line', p1: [CP_B[0], CP_B[1], CP_LIFT], p2: [CP_FOOT[0], CP_FOOT[1], CP_LIFT],
          color: COLOR_INK, thickness: 0.045 },
        rightAngle([CP_FOOT[0], CP_FOOT[1], CP_LIFT], [-1, 0, 0], [0, 1, 0], 0.32),

        // The angle θ between a and b.
        ...Array.from({ length: 9 }, (_, k): ProofPrimitive => {
            const t0 = (k / 9) * CP_THETA, t1 = ((k + 1) / 9) * CP_THETA;
            return {
                kind: 'line',
                p1: [Math.cos(t0) * 0.75, Math.sin(t0) * 0.75, CP_LIFT],
                p2: [Math.cos(t1) * 0.75, Math.sin(t1) * 0.75, CP_LIFT],
                color: COLOR_INK, thickness: 0.035,
            };
        }),

        // The two vectors, and the product leaving the plane.
        { kind: 'arrow', from: [0, 0, CP_LIFT], to: [CP_A[0], CP_A[1], CP_LIFT],
          color: COLOR_GREEN, thickness: 0.07, headSize: 0.4 },
        { kind: 'arrow', from: [0, 0, CP_LIFT], to: [CP_B[0], CP_B[1], CP_LIFT],
          color: COLOR_AMBER, thickness: 0.07, headSize: 0.4 },
        { kind: 'arrow', from: [0, 0, 0], to: CP_CROSS,
          color: COLOR_RED, thickness: 0.08, headSize: 0.5 },

        { kind: 'label', position: [CP_ALEN / 2, -0.6, 0], text: 'a',
          scale: 0.5, color: lighten(COLOR_GREEN, 0.45) },
        { kind: 'label', position: [CP_B[0] - 0.85, CP_B[1] + 0.35, 0], text: 'b',
          scale: 0.5, color: lighten(COLOR_AMBER, 0.45) },
        { kind: 'label', position: [1.05, 0.42, 0], text: 'θ',
          scale: 0.45, color: COLOR_INK },
        { kind: 'label', position: [CP_B[0] + 1.35, CP_B[1] / 2, 0], text: '|b| sin θ',
          scale: 0.4, color: COLOR_INK },
        { kind: 'label', position: [-0.5, -0.35, CP_CROSS[2] + 0.9], text: 'a × b',
          scale: 0.5, color: lighten(COLOR_RED, 0.4) },
    ],
};

// ─── Volume of a sphere (formula #8: V = 4πr³/3) ────────────────────────
//
// Archimedes, and the reason the whole spatial renderer exists. It cannot be
// drawn flat at all: the argument is that two DIFFERENT solids have matching
// horizontal cross-sections at every height, and a plane figure has no heights
// to compare.
//
// A hemisphere of radius r, beside a cylinder of radius r and height r with a
// cone bored out of it (apex at the centre of the base, opening to the full
// rim at the top). Slice both at height y:
//
//   hemisphere   a disc of radius √(r²−y²)      area π(r²−y²)
//   cut cylinder an annulus from y out to r     area πr² − πy²
//
// The same number at every height, so the solids have the same volume — and
// the cut cylinder's is one you already know, πr³ − πr³/3. Hence the
// hemisphere is 2πr³/3 and the sphere twice that.
//
// The slices are drawn pulled out and set down below their solids, because the
// solids are opaque: a cross-section left in place would be sealed inside.

const SP_R = 2;
const SP_Y = 1.0;                       // the height sliced at
const SP_SEG = 20;                      // azimuthal segments — see the face budget in the tests
const SP_BANDS = 12;                    // bands up the dome — see the tessellation note in the tests
const SP_LEFT = -3.4, SP_RIGHT = 3.4;   // where each solid stands
const SP_SLICE_Y = -1.7;                // where the extracted slices sit
const SP_DISC_R = Math.sqrt(SP_R * SP_R - SP_Y * SP_Y);

const shift = (fs: ProofPrimitive[], dx: number): ProofPrimitive[] => fs.map(f => {
    if (f.kind !== 'polygon') return f;
    return {
        ...f,
        points: f.points.map((q): Vec3 => [q[0] + dx, q[1], q[2]]),
        outwardFrom: f.outwardFrom
            ? [f.outwardFrom[0] + dx, f.outwardFrom[1], f.outwardFrom[2]] as Vec3
            : undefined,
    };
});

/** Silhouette of a solid hemisphere: a flat base disc, then the dome. */
const hemisphereProfile = (): [number, number][] => {
    const p: [number, number][] = [[0, 0], [SP_R, 0]];
    for (let i = 1; i <= SP_BANDS; i++) {
        const y = (SP_R * i) / SP_BANDS;
        p.push([Math.sqrt(Math.max(0, SP_R * SP_R - y * y)), y]);
    }
    return p;
};

/** A flat horizontal ring (or disc, from radius 0) lying at height y. */
const flatRing = (r0: number, r1: number, y: number, fill: Color, piece: string): ProofPrimitive[] =>
    revolve([[r0, y], [r1, y]], SP_SEG, 'out', fill, [0, y - 1, 0], piece);

const PROOF_SPHERE_VOLUME: VisualProof = {
    title: 'Volume of a Sphere',
    caption: 'every slice matches, so hemisphere = cylinder − cone = 2πr³/3',
    family: 'C',
    spatial: true,
    primitives: [
        // Left: the hemisphere.
        ...shift(revolve(hemisphereProfile(), SP_SEG, 'out', opaque(COLOR_BLUE_FILL), undefined, 'hemisphere'), SP_LEFT),

        // Right: a cylinder with a cone bored out. The cavity faces INWARD —
        // it is the inside of a hole, not the outside of a cone.
        ...shift(revolve([[SP_R, 0], [SP_R, SP_R]], SP_SEG, 'out', opaque(COLOR_GREEN_FILL), undefined, 'cylinder'), SP_RIGHT),
        ...shift(revolve([[0, 0], [SP_R, 0]], SP_SEG, 'out', opaque(COLOR_GREEN_FILL),
                         [0, SP_R / 2, 0], 'cylinder'), SP_RIGHT),
        ...shift(revolve([[0, 0], [SP_R, SP_R]], SP_SEG, 'in', opaque(COLOR_RED_FILL), undefined, 'cone-cavity'), SP_RIGHT),

        // The two slices, lifted out and set down where they can be seen.
        ...shift(flatRing(0, SP_DISC_R, SP_SLICE_Y, opaque(COLOR_AMBER_FILL), 'slice:disc'), SP_LEFT),
        ...shift(flatRing(SP_Y, SP_R, SP_SLICE_Y, opaque(COLOR_AMBER_FILL), 'slice:ring'), SP_RIGHT),

        // Where each came from.
        { kind: 'line', p1: [SP_LEFT, SP_Y, 0], p2: [SP_LEFT, SP_SLICE_Y + 0.1, 0],
          color: COLOR_AMBER, thickness: 0.04 },
        { kind: 'line', p1: [SP_RIGHT, SP_Y, 0], p2: [SP_RIGHT, SP_SLICE_Y + 0.1, 0],
          color: COLOR_AMBER, thickness: 0.04 },

        { kind: 'label', position: [SP_LEFT, SP_SLICE_Y - 1.1, 0], text: 'π(r²−y²)',
          scale: 0.42, color: lighten(COLOR_AMBER, 0.4) },
        { kind: 'label', position: [0, SP_SLICE_Y - 1.1, 0], text: '=',
          scale: 0.5, color: COLOR_INK },
        { kind: 'label', position: [SP_RIGHT, SP_SLICE_Y - 1.1, 0], text: 'πr²−πy²',
          scale: 0.42, color: lighten(COLOR_AMBER, 0.4) },
        { kind: 'label', position: [SP_LEFT - SP_R - 0.9, SP_Y, 0], text: 'y',
          scale: 0.42, color: COLOR_INK },
    ],
};

// ─── Family A batch: axis-aligned dissections ───────────────────────────
//
// Each of these is one production of the grammar (see matematex-proof-grammar.md,
// family A): a single region partitioned two ways, with every piece labelled by
// its own measure. `claim.total` is what the pieces must add up to, and the
// generic family-A test checks both that and that no two pieces overlap — so
// none of these needs an invariant test of its own.

// #23  (a+b)² = a² + 2ab + b²   — the square in four pieces, a=3, b=2
const PS_A = 3, PS_B = 2;
const PROOF_PERFECT_SQUARE: VisualProof = {
    title: 'Perfect Square Trinomial',
    caption: 'the (a+b) square splits into a², b², and two ab rectangles',
    family: 'A',
    claim: { total: (PS_A + PS_B) ** 2 },
    primitives: [
        ...rectPieces([
            { x: 0,     y: 0,     w: PS_A, h: PS_A, label: 'a²',  color: 0 },
            { x: PS_A,  y: 0,     w: PS_B, h: PS_A, label: 'ab',  color: 2 },
            { x: 0,     y: PS_A,  w: PS_A, h: PS_B, label: 'ab',  color: 2 },
            { x: PS_A,  y: PS_A,  w: PS_B, h: PS_B, label: 'b²',  color: 1 },
        ]),
        ...dimension([0, 0, 0], [PS_A, 0, 0], 'a', [0, -0.75, 0]),
        ...dimension([PS_A, 0, 0], [PS_A + PS_B, 0, 0], 'b', [0, -0.75, 0]),
    ],
};

// #4  A = ½bh   — the box splits into four triangles, in congruent pairs
//
// Not "draw the triangle on a rectangle": that is a picture, and the pieces
// overlap. The apex's vertical drops the b × h box into two smaller boxes, and
// the triangle's own edges cut each of those along a diagonal — so each small
// box is halved, and therefore so is the whole.
const AT_B = 5, AT_H = 3, AT_APEX = 3;
const PROOF_TRIANGLE_AREA: VisualProof = {
    title: 'Area of a Triangle',
    caption: 'the apex line halves each box along a diagonal - so half of b × h',
    family: 'A',
    claim: { total: AT_B * AT_H },
    primitives: [
        { kind: 'polygon', points: [[0, 0, 0], [AT_APEX, 0, 0], [AT_APEX, AT_H, 0]],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.05 },
        { kind: 'polygon', points: [[0, 0, 0], [AT_APEX, AT_H, 0], [0, AT_H, 0]],
          fill: COLOR_AMBER_FILL, stroke: COLOR_AMBER, strokeThickness: 0.05 },
        { kind: 'polygon', points: [[AT_APEX, 0, 0], [AT_B, 0, 0], [AT_APEX, AT_H, 0]],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.05 },
        { kind: 'polygon', points: [[AT_B, 0, 0], [AT_B, AT_H, 0], [AT_APEX, AT_H, 0]],
          fill: COLOR_AMBER_FILL, stroke: COLOR_AMBER, strokeThickness: 0.05 },
        { kind: 'line', p1: [AT_APEX, 0, 0], p2: [AT_APEX, AT_H, 0],
          color: COLOR_INK, thickness: 0.045 },
        rightAngle([AT_APEX, 0, 0], [1, 0, 0], [0, 1, 0]),
        ...dimension([0, 0, 0], [AT_B, 0, 0], 'b', [0, -0.8, 0]),
        ...dimension([AT_B, 0, 0], [AT_B, AT_H, 0], 'h', [0.85, 0, 0]),
        { kind: 'label', position: [1.55, 0.75, 0], text: '½bh', scale: 0.45, color: COLOR_BLUE },
        { kind: 'label', position: [1.05, 2.3, 0], text: '=', scale: 0.45, color: COLOR_AMBER },
        { kind: 'label', position: [4.15, 2.3, 0], text: '=', scale: 0.45, color: COLOR_AMBER },
    ],
};

// #43  (fg)' = f'g + fg'   — the growing rectangle
const PR_U = 3.2, PR_V = 2.4, PR_D = 1.0;
const PROOF_PRODUCT_RULE: VisualProof = {
    title: 'Product Rule',
    caption: 'growing a u × v box adds u·dv and v·du (and du·dv, which vanishes)',
    family: 'A',
    claim: { total: (PR_U + PR_D) * (PR_V + PR_D) },
    primitives: [
        ...rectPieces([
            { x: 0,     y: 0,     w: PR_U, h: PR_V, label: 'uv',    color: 0 },
            { x: PR_U,  y: 0,     w: PR_D, h: PR_V, label: 'v·du',  color: 1 },
            { x: 0,     y: PR_V,  w: PR_U, h: PR_D, label: 'u·dv',  color: 2 },
            { x: PR_U,  y: PR_V,  w: PR_D, h: PR_D, label: 'du·dv', color: 3, labelScale: 0.34 },
        ]),
        ...dimension([0, 0, 0], [PR_U, 0, 0], 'u', [0, -0.75, 0]),
        ...dimension([PR_U, 0, 0], [PR_U + PR_D, 0, 0], 'du', [0, -0.75, 0], 0.4),
        ...dimension([0, 0, 0], [0, PR_V, 0], 'v', [-0.75, 0, 0]),
        ...dimension([0, PR_V, 0], [0, PR_V + PR_D, 0], 'dv', [-0.75, 0, 0], 0.4),
    ],
};

// #46  ∫u dv = uv − ∫v du   — the same rectangle, read as two areas
const PROOF_PARTS: VisualProof = {
    title: 'Integration by Parts',
    caption: 'the uv box less the ∫v du region is what is left for ∫u dv',
    family: 'A',
    claim: { total: 4.2 * 3.0 },
    primitives: [
        // The curve v(u) cuts the uv box in two: below it ∫v du, above it ∫u dv.
        ...(() => {
            const W = 4.2, H = 3.0, N = 24;
            const curve = (t: number) => H * Math.pow(t / W, 0.55);
            const under: Vec3[] = [[0, 0, 0]];
            for (let i = 0; i <= N; i++) { const x = (W * i) / N; under.push([x, curve(x), 0]); }
            under.push([W, 0, 0]);
            const over: Vec3[] = [[0, 0, 0]];
            for (let i = 0; i <= N; i++) { const x = (W * i) / N; over.push([x, curve(x), 0]); }
            over.push([W, H, 0]); over.push([0, H, 0]);
            return [
                { kind: 'polygon' as const, points: under, fill: COLOR_BLUE_FILL,
                  stroke: COLOR_BLUE, strokeThickness: 0.05 },
                { kind: 'polygon' as const, points: over, fill: COLOR_GREEN_FILL,
                  stroke: COLOR_GREEN, strokeThickness: 0.05 },
            ];
        })(),
        { kind: 'label', position: [3.1, 0.75, 0], text: '∫v du', scale: 0.5, color: COLOR_BLUE },
        { kind: 'label', position: [1.3, 2.3, 0],  text: '∫u dv', scale: 0.5, color: COLOR_GREEN },
        ...dimension([0, 0, 0], [4.2, 0, 0], 'u', [0, -0.8, 0]),
        ...dimension([4.2, 0, 0], [4.2, 3.0, 0], 'v', [0.8, 0, 0]),
        { kind: 'label', position: [2.1, 3.7, 0], text: 'uv', scale: 0.55, color: COLOR_INK },
    ],
};

// #27  S_n = n(a₁+aₙ)/2   — two staircases make a rectangle, n=6
const AS_N = 6;
const PROOF_ARITHMETIC_SERIES: VisualProof = {
    title: 'Arithmetic Series',
    caption: 'two copies of the staircase interlock into an n by (a1 + an) block',
    family: 'A',
    claim: { total: AS_N * (1 + AS_N) },
    primitives: [
        ...rectPieces(Array.from({ length: AS_N }, (_, i) => ({
            x: i, y: 0, w: 1, h: i + 1, color: 0,
        }))),
        ...rectPieces(Array.from({ length: AS_N }, (_, i) => ({
            x: i, y: i + 1, w: 1, h: AS_N - i, color: 1,
        }))),
        ...dimension([0, 0, 0], [AS_N, 0, 0], 'n', [0, -0.8, 0]),
        ...dimension([AS_N, 0, 0], [AS_N, AS_N + 1, 0], 'a1 + an', [1.0, 0, 0], 0.42),
        { kind: 'label', position: [AS_N * 0.30, AS_N * 0.28, 0], text: 'S',
          scale: 0.55, color: COLOR_BLUE },
        { kind: 'label', position: [AS_N * 0.70, AS_N * 0.78, 0], text: 'S',
          scale: 0.55, color: COLOR_GREEN },
    ],
};

// #66  det = ad − bc   — the columns' parallelogram inside its bounding box
//
// The (a+c) by (b+d) box holds the parallelogram plus six trimmings: two
// triangles of ab/2, two of cd/2, and two bc rectangles. Adding those up,
//   (a+c)(b+d) = (ad − bc) + ab + cd + 2bc
// which is the identity, rearranged. Drawing the parallelogram ON a filled box
// is not this proof — the pieces have to partition the box, and the first
// attempt here did not, which the family-A invariant caught immediately.
const DT_A = 3.0, DT_B = 1.0, DT_C = 0.8, DT_D = 2.6;
const DT_W = DT_A + DT_C, DT_H = DT_B + DT_D;
const PROOF_DET2: VisualProof = {
    title: 'Determinant of 2×2',
    caption: 'ad − bc is the area the two columns span',
    family: 'A',
    claim: { total: DT_W * DT_H },
    primitives: [
        { kind: 'polygon',
          points: [[0, 0, 0], [DT_A, DT_B, 0], [DT_W, DT_H, 0], [DT_C, DT_D, 0]],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.06 },
        // Lower-right trimmings.
        { kind: 'polygon', points: [[0, 0, 0], [DT_A, 0, 0], [DT_A, DT_B, 0]],
          fill: COLOR_AMBER_FILL, stroke: COLOR_AMBER, strokeThickness: 0.05 },
        { kind: 'polygon', points: [[DT_A, 0, 0], [DT_W, 0, 0], [DT_W, DT_B, 0], [DT_A, DT_B, 0]],
          fill: COLOR_RED_FILL, stroke: COLOR_RED, strokeThickness: 0.05 },
        { kind: 'polygon', points: [[DT_A, DT_B, 0], [DT_W, DT_B, 0], [DT_W, DT_H, 0]],
          fill: COLOR_GREEN_FILL, stroke: COLOR_GREEN, strokeThickness: 0.05 },
        // Upper-left trimmings — the same three, rotated half a turn.
        { kind: 'polygon', points: [[0, 0, 0], [0, DT_D, 0], [DT_C, DT_D, 0]],
          fill: COLOR_GREEN_FILL, stroke: COLOR_GREEN, strokeThickness: 0.05 },
        { kind: 'polygon', points: [[0, DT_D, 0], [DT_C, DT_D, 0], [DT_C, DT_H, 0], [0, DT_H, 0]],
          fill: COLOR_RED_FILL, stroke: COLOR_RED, strokeThickness: 0.05 },
        { kind: 'polygon', points: [[DT_C, DT_D, 0], [DT_C, DT_H, 0], [DT_W, DT_H, 0]],
          fill: COLOR_AMBER_FILL, stroke: COLOR_AMBER, strokeThickness: 0.05 },

        { kind: 'arrow', from: [0, 0, 0], to: [DT_A, DT_B, 0],
          color: COLOR_INK, thickness: 0.055, headSize: 0.32 },
        { kind: 'arrow', from: [0, 0, 0], to: [DT_C, DT_D, 0],
          color: COLOR_INK, thickness: 0.055, headSize: 0.32 },
        { kind: 'label', position: [DT_A * 0.62, DT_B * 0.30, 0], text: '(a,b)',
          scale: 0.33, color: COLOR_INK },
        { kind: 'label', position: [DT_C * 0.30, DT_D * 0.70, 0], text: '(c,d)',
          scale: 0.33, color: COLOR_INK },
        { kind: 'label', position: [DT_W / 2 - 0.15, DT_H / 2 + 0.1, 0], text: 'ad − bc',
          scale: 0.44, color: COLOR_BLUE },
        { kind: 'label', position: [DT_A * 0.62, -0.55, 0], text: 'ab/2', scale: 0.3, color: COLOR_AMBER },
        { kind: 'label', position: [DT_W + 0.62, DT_B * 0.5, 0], text: 'bc', scale: 0.3, color: COLOR_RED },
        { kind: 'label', position: [DT_W + 0.72, DT_B + DT_D * 0.45, 0], text: 'cd/2', scale: 0.3, color: COLOR_GREEN },
    ],
};

// ─── Family E batch: projections ────────────────────────────────────────
//
// Each one turns a length into a trig ratio by dropping a single perpendicular.
// The generic family-E invariant checks that every right-angle mark sits on two
// real segments of its figure — a mark always LOOKS square, so a misplaced one
// is invisible to the eye and only a test can catch it.

// #2  c² = a² + b² − 2ab cos C   — Pythagoras plus the foot of the altitude
//
// Drop the altitude from B onto side b. It splits b into a·cos C and
// b − a·cos C, and the height is a·sin C. Pythagoras on the right piece:
//   c² = (a sin C)² + (b − a cos C)² = a² + b² − 2ab cos C.
const LC_B = 5.0, LC_A = 3.2;
const LC_BX = 1.695742, LC_BY = 2.713754;
const PROOF_LAW_OF_COSINES: VisualProof = {
    title: 'Law of Cosines',
    caption: 'the altitude cuts b into a cos C and the rest - then Pythagoras',
    family: 'E',
    primitives: [
        { kind: 'polygon', points: [[0, 0, 0], [LC_B, 0, 0], [LC_BX, LC_BY, 0]],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.06 },
        { kind: 'line', p1: [LC_BX, LC_BY, 0], p2: [LC_BX, 0, 0],
          color: COLOR_AMBER, thickness: 0.05 },
        { kind: 'line', p1: [0, 0, 0], p2: [LC_B, 0, 0], color: COLOR_INK, thickness: 0.04 },
        rightAngle([LC_BX, 0, 0], [1, 0, 0], [0, 1, 0]),
        ...angleArc([0, 0, 0], 0, Math.atan2(LC_BY, LC_BX), 0.8),
        { kind: 'label', position: [1.05, 0.4, 0], text: 'C', scale: 0.42, color: COLOR_INK },
        { kind: 'label', position: [LC_BX / 2 - 0.45, LC_BY / 2 + 0.3, 0], text: 'a', scale: 0.45, color: COLOR_INK },
        { kind: 'label', position: [(LC_B + LC_BX) / 2 + 0.35, LC_BY / 2 + 0.35, 0], text: 'c', scale: 0.45, color: COLOR_INK },
        { kind: 'label', position: [LC_BX / 2, -0.95, 0], text: 'a cos C', scale: 0.34, color: COLOR_AMBER },
        { kind: 'label', position: [(LC_BX + LC_B) / 2, -0.95, 0], text: 'b − a cos C', scale: 0.34, color: COLOR_AMBER },
        { kind: 'label', position: [LC_BX + 0.85, LC_BY / 2, 0], text: 'a sin C', scale: 0.34, color: COLOR_AMBER },
        ...dimension([0, 0, 0], [LC_B, 0, 0], 'b', [0, -1.75, 0], 0.45),
    ],
};

// #12  m = (y₂−y₁)/(x₂−x₁)   — rise over run
const SL_1X = 1, SL_1Y = 1, SL_2X = 6, SL_2Y = 4;
const PROOF_SLOPE: VisualProof = {
    title: 'Slope Formula',
    caption: 'slope is the rise over the run between the two points',
    family: 'E',
    primitives: [
        { kind: 'polygon', points: [[SL_1X, SL_1Y, 0], [SL_2X, SL_1Y, 0], [SL_2X, SL_2Y, 0]],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.05 },
        { kind: 'line', p1: [0, 0.4, 0], p2: [7, 4.6, 0], color: COLOR_AMBER, thickness: 0.06 },
        rightAngle([SL_2X, SL_1Y, 0], [-1, 0, 0], [0, 1, 0]),
        { kind: 'label', position: [SL_1X - 0.75, SL_1Y - 0.55, 0], text: '(x1,y1)', scale: 0.34, color: COLOR_INK },
        { kind: 'label', position: [SL_2X + 0.35, SL_2Y + 0.55, 0], text: '(x2,y2)', scale: 0.34, color: COLOR_INK },
        { kind: 'label', position: [(SL_1X + SL_2X) / 2, SL_1Y - 0.6, 0], text: 'x2 − x1', scale: 0.36, color: COLOR_BLUE },
        { kind: 'label', position: [SL_2X + 1.05, (SL_1Y + SL_2Y) / 2, 0], text: 'y2 − y1', scale: 0.36, color: COLOR_BLUE },
    ],
};

// #14  (x−h)² + (y−k)² = r²   — Pythagoras on the radius
const CE_H = 2.5, CE_K = 2.0, CE_R = 2.6;
const CE_PX = 4.491716, CE_PY = 3.671248;
const PROOF_CIRCLE_EQ: VisualProof = {
    title: 'Circle Equation',
    caption: 'each point is the hypotenuse of an (x−h), (y−k) triangle',
    family: 'E',
    primitives: [
        { kind: 'circle', center: [CE_H, CE_K, 0], radius: CE_R, segments: 48,
          stroke: COLOR_BLUE, strokeThickness: 0.055 },
        { kind: 'polygon', points: [[CE_H, CE_K, 0], [CE_PX, CE_K, 0], [CE_PX, CE_PY, 0]],
          fill: COLOR_GREEN_FILL, stroke: COLOR_GREEN, strokeThickness: 0.05 },
        rightAngle([CE_PX, CE_K, 0], [-1, 0, 0], [0, 1, 0]),
        { kind: 'label', position: [CE_H - 0.75, CE_K - 0.45, 0], text: '(h,k)', scale: 0.34, color: COLOR_INK },
        { kind: 'label', position: [CE_PX + 0.55, CE_PY + 0.4, 0], text: '(x,y)', scale: 0.34, color: COLOR_INK },
        { kind: 'label', position: [(CE_H + CE_PX) / 2, CE_K - 0.55, 0], text: 'x−h', scale: 0.34, color: COLOR_GREEN },
        { kind: 'label', position: [CE_PX + 0.95, (CE_K + CE_PY) / 2, 0], text: 'y−k', scale: 0.34, color: COLOR_GREEN },
        { kind: 'label', position: [(CE_H + CE_PX) / 2 - 0.35, (CE_K + CE_PY) / 2 + 0.4, 0], text: 'r', scale: 0.4, color: COLOR_BLUE },
    ],
};

// #73  a·b = |a||b| cos θ   — b projected onto a
const DP_A = 4.0, DP_BX = 1.799805, DP_BY = 2.144924;
const PROOF_DOT_PRODUCT: VisualProof = {
    title: 'Dot Product',
    caption: 'a·b is |a| times the shadow b casts along a, which is |b| cos θ',
    family: 'E',
    primitives: [
        { kind: 'line', p1: [0, 0, 0], p2: [DP_A, 0, 0], color: COLOR_INK, thickness: 0.035 },
        { kind: 'line', p1: [DP_BX, DP_BY, 0], p2: [DP_BX, 0, 0], color: COLOR_INK, thickness: 0.04 },
        { kind: 'polygon', points: [[0, 0, 0], [DP_BX, 0, 0], [DP_BX, DP_BY, 0]],
          fill: COLOR_GREEN_FILL, stroke: COLOR_GREEN, strokeThickness: 0.04 },
        rightAngle([DP_BX, 0, 0], [-1, 0, 0], [0, 1, 0]),
        ...angleArc([0, 0, 0], 0, Math.atan2(DP_BY, DP_BX), 0.7),
        { kind: 'arrow', from: [0, 0, 0], to: [DP_A, 0, 0], color: COLOR_BLUE, thickness: 0.07, headSize: 0.4 },
        { kind: 'arrow', from: [0, 0, 0], to: [DP_BX, DP_BY, 0], color: COLOR_AMBER, thickness: 0.07, headSize: 0.4 },
        { kind: 'label', position: [DP_A - 0.5, -0.6, 0], text: 'a', scale: 0.45, color: COLOR_BLUE },
        { kind: 'label', position: [DP_BX - 0.6, DP_BY + 0.35, 0], text: 'b', scale: 0.45, color: COLOR_AMBER },
        { kind: 'label', position: [0.95, 0.32, 0], text: 'θ', scale: 0.36, color: COLOR_INK },
        { kind: 'label', position: [DP_BX / 2, -0.75, 0], text: '|b| cos θ', scale: 0.34, color: COLOR_GREEN },
    ],
};

// #56  γ = 1/√(1 − v²/c²)   — the light clock
//
// A photon crosses the clock while the clock moves. In the moving frame it goes
// straight up, a distance ct′; on the ground its path is the hypotenuse, ct,
// and the clock has slid vt sideways. Pythagoras gives t′ = t√(1 − v²/c²).
const LZ_V = 2.4, LZ_C = 3.2;
const PROOF_LORENTZ: VisualProof = {
    title: 'Lorentz Factor',
    caption: "the photon's path is the hypotenuse: (ct)² = (ct')² + (vt)²",
    family: 'E',
    primitives: [
        { kind: 'polygon', points: [[0, 0, 0], [LZ_V, 0, 0], [LZ_V, LZ_C, 0]],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.05 },
        { kind: 'line', p1: [0, 0, 0], p2: [LZ_V, 0, 0], color: COLOR_INK, thickness: 0.04 },
        rightAngle([LZ_V, 0, 0], [-1, 0, 0], [0, 1, 0]),
        { kind: 'arrow', from: [0, 0, 0], to: [LZ_V, LZ_C, 0], color: COLOR_AMBER, thickness: 0.07, headSize: 0.4 },
        { kind: 'label', position: [LZ_V / 2, -0.6, 0], text: 'vt', scale: 0.42, color: COLOR_INK },
        { kind: 'label', position: [LZ_V + 0.85, LZ_C / 2, 0], text: "ct'", scale: 0.42, color: COLOR_BLUE },
        { kind: 'label', position: [LZ_V / 2 - 0.75, LZ_C / 2 + 0.25, 0], text: 'ct', scale: 0.42, color: COLOR_AMBER },
    ],
};

// #76  ‖x‖ = √(x₁²+x₂²+x₃²)   — Pythagoras twice, in a box
//
// Spatial because it has to be: the first right angle lies in the floor, the
// second stands up out of it, and no single plane holds both.
const VN_X = 2.6, VN_Y = 1.9, VN_Z = 1.5;
const PROOF_VECTOR_NORM: VisualProof = {
    title: 'Vector Norm',
    caption: 'Pythagoras in the floor, then again standing up',
    family: 'E',
    spatial: true,
    primitives: [
        ...boxEdges([0, 0, 0], [VN_X, VN_Y, VN_Z], COLOR_INK, 0.035),
        // Outlined, not filled. Two opaque faces inside a box hide everything
        // behind them — including both right-angle marks, which the occlusion
        // test flagged. The claim here is about the two hypotenuses, not about
        // any area, so the areas were never carrying their weight.
        { kind: 'polygon', points: [[0, 0, 0], [VN_X, 0, 0], [VN_X, 0, VN_Z]],
          stroke: COLOR_GREEN, strokeThickness: 0.05 },
        { kind: 'polygon', points: [[0, 0, 0], [VN_X, 0, VN_Z], [VN_X, VN_Y, VN_Z]],
          stroke: COLOR_BLUE, strokeThickness: 0.055 },
        rightAngle([VN_X, 0, 0], [-1, 0, 0], [0, 0, 1]),
        // The leg must follow the floor diagonal itself, not a guessed 45°:
        // the invariant caught this exact slip.
        rightAngle([VN_X, 0, VN_Z], [-VN_X, 0, -VN_Z], [0, 1, 0]),
        { kind: 'label', position: [VN_X / 2, -0.55, 0], text: 'x1', scale: 0.36, color: COLOR_INK },
        { kind: 'label', position: [VN_X + 0.55, 0, VN_Z / 2], text: 'x3', scale: 0.36, color: COLOR_INK },
        { kind: 'label', position: [VN_X + 0.55, VN_Y / 2, VN_Z], text: 'x2', scale: 0.36, color: COLOR_INK },
        { kind: 'label', position: [VN_X / 2 + 0.3, -0.5, VN_Z / 2], text: '√(x1²+x3²)', scale: 0.3, color: COLOR_GREEN },
        { kind: 'label', position: [VN_X / 2 - 0.4, VN_Y / 2 + 0.5, VN_Z / 2], text: '|x|', scale: 0.4, color: COLOR_BLUE },
    ],
};

// ─── Family I batch: counting one set two ways ──────────────────────────
//
// Every cell drawn is one member of a finite set, so `claim.cells` is checkable
// against the figure and the arithmetic is checkable by enumerating the set in
// full. The one family where the test can be exhaustive rather than a sample.

// #31  aᵐ · aⁿ = aᵐ⁺ⁿ   — two runs of factors laid end to end
const EX_M = 3, EX_N = 4;
const PROOF_EXPONENT_PRODUCT: VisualProof = {
    title: 'Exponent Product Rule',
    caption: 'm factors then n more is m+n factors in a row',
    family: 'I',
    claim: { cells: EX_M + EX_N },
    primitives: [
        ...rectPieces([
            ...Array.from({ length: EX_M }, (_, i) => ({ x: i, y: 0, w: 1, h: 1, label: 'a', color: 0, labelScale: 0.4 })),
            ...Array.from({ length: EX_N }, (_, i) => ({ x: EX_M + i, y: 0, w: 1, h: 1, label: 'a', color: 1, labelScale: 0.4 })),
        ]),
        ...dimension([0, 0, 0], [EX_M, 0, 0], 'm factors', [0, -0.7, 0], 0.42),
        ...dimension([EX_M, 0, 0], [EX_M + EX_N, 0, 0], 'n factors', [0, -0.7, 0], 0.42),
        { kind: 'label', position: [(EX_M + EX_N) / 2, -1.7, 0], text: 'm+n factors', scale: 0.5, color: COLOR_INK },
    ],
};

// #32  (aᵐ)ⁿ = aᵐⁿ   — n rows of m factors is an m × n block
const PW_M = 3, PW_N = 4;
const PROOF_POWER_OF_POWER: VisualProof = {
    title: 'Power of a Power',
    caption: 'n rows of m factors is an m by n block of them',
    family: 'I',
    claim: { cells: PW_M * PW_N },
    primitives: [
        ...rectPieces(Array.from({ length: PW_N }, (_, r) =>
            Array.from({ length: PW_M }, (_, c) => ({
                x: c, y: r, w: 1, h: 1, label: 'a', color: r % 2, labelScale: 0.36,
            }))).flat()),
        ...dimension([0, 0, 0], [PW_M, 0, 0], 'm factors', [0, -0.7, 0], 0.42),
        ...dimension([PW_M, 0, 0], [PW_M, PW_N, 0], 'n rows', [0.95, 0, 0], 0.36),
        { kind: 'label', position: [PW_M / 2, PW_N + 0.75, 0], text: 'mn factors', scale: 0.5, color: COLOR_INK },
    ],
};

// #37  P(n,r) = n!/(n−r)!   — ordered pairs of distinct items, n = 4, r = 2
//
// The grid of all ordered pairs, with the diagonal cut out: you cannot pick the
// same item twice. 4 × 4 − 4 = 12 = 4·3 = 4!/2!.
const PM_N = 4;
const PROOF_PERMUTATIONS: VisualProof = {
    title: 'Permutations',
    caption: 'all ordered pairs less the diagonal: n choices then n−1',
    family: 'I',
    claim: { cells: PM_N * (PM_N - 1) },
    primitives: [
        ...rectPieces(Array.from({ length: PM_N }, (_, r) =>
            Array.from({ length: PM_N }, (_, c) => ({ x: c, y: r, w: 1, h: 1, color: c === r ? undefined : 0 })))
            .flat()),
        ...dimension([0, 0, 0], [PM_N, 0, 0], 'first', [0, -0.7, 0], 0.36),
        ...dimension([PM_N, 0, 0], [PM_N, PM_N, 0], 'second', [1.0, 0, 0], 0.36),
        { kind: 'label', position: [PM_N / 2, PM_N + 0.8, 0], text: 'n(n−1) = n!/(n−r)!', scale: 0.36, color: COLOR_INK },
        { kind: 'label', position: [PM_N + 1.6, PM_N / 2 - 1.3, 0], text: 'same twice:', scale: 0.28, color: COLOR_RED },
        { kind: 'label', position: [PM_N + 1.6, PM_N / 2 - 1.9, 0], text: 'excluded', scale: 0.28, color: COLOR_RED },
    ],
};

// #38  C(n,r) = n!/(r!(n−r)!)   — the same grid, with order forgotten
//
// Above the diagonal and below it are the same pairs in the other order, so
// each unordered pair is drawn twice: C(4,2) = 12/2 = 6.
const PROOF_COMBINATIONS: VisualProof = {
    title: 'Combinations',
    caption: 'each pair appears twice - once each way round - so divide by r!',
    family: 'I',
    claim: { cells: PM_N * (PM_N - 1) },
    primitives: [
        ...rectPieces(Array.from({ length: PM_N }, (_, r) =>
            Array.from({ length: PM_N }, (_, c) => ({
                x: c, y: r, w: 1, h: 1,
                color: c === r ? undefined : (c > r ? 0 : 2),
            }))).flat()),
        { kind: 'label', position: [PM_N * 0.74, PM_N * 0.26, 0], text: '{i,j}', scale: 0.34, color: COLOR_BLUE },
        { kind: 'label', position: [PM_N * 0.26, PM_N * 0.74, 0], text: '{j,i}', scale: 0.34, color: COLOR_AMBER },
        { kind: 'label', position: [PM_N / 2, PM_N + 0.8, 0], text: 'C(n,r) = P(n,r) / r!', scale: 0.36, color: COLOR_INK },
    ],
};

// #39  Fₙ = Fₙ₋₁ + Fₙ₋₂   — tilings of a strip, split by the last tile
//
// Every tiling of a 1×4 strip by squares and dominoes ends in exactly one of
// them. Chop that last tile off and what remains is a tiling of length 3 or of
// length 2 — so the count of one is the sum of the counts of the other two.
const FIB_TILINGS: number[][] = [[1, 1, 1, 1], [1, 1, 2], [1, 2, 1], [2, 1, 1], [2, 2]];
const PROOF_FIBONACCI: VisualProof = {
    title: 'Fibonacci Recurrence',
    caption: 'every tiling ends in a square or a domino - chop it off',
    family: 'I',
    claim: { cells: FIB_TILINGS.reduce((t, r) => t + r.length, 0) },
    primitives: [
        ...rectPieces(FIB_TILINGS.flatMap((tiling, row) => {
            const y = (FIB_TILINGS.length - 1 - row) * 1.35;
            let x = 0;
            return tiling.map((w, i) => {
                const cell = {
                    x, y, w, h: 1,
                    // The last tile is what the split is on, so it gets its own
                    // colour; everything before it is one shape.
                    color: i === tiling.length - 1 ? (w === 1 ? 2 : 3) : 0,
                };
                x += w;
                return cell;
            });
        })),
        { kind: 'label', position: [5.6, 4 * 1.35 + 0.5, 0], text: 'F5 = 5', scale: 0.42, color: COLOR_INK },
        { kind: 'label', position: [5.9, 3.2 * 1.35, 0], text: '3 end in a square', scale: 0.3, color: COLOR_AMBER },
        { kind: 'label', position: [5.9, 0.7 * 1.35, 0], text: '2 end in a domino', scale: 0.3, color: COLOR_RED },
    ],
};

// #78  dim ker T + dim im T = dim V   — the domain splits
//
// Not a count of cells but of DIMENSIONS: the kernel takes some of the domain,
// and whatever is left over maps one-to-one onto the image. Each unit block is
// one dimension, which is what makes it countable at all.
const RN_KER = 2, RN_IM = 3;
const PROOF_RANK_NULLITY: VisualProof = {
    title: 'Rank-Nullity',
    caption: 'the kernel collapses; the rest maps one-to-one onto the image',
    family: 'I',
    claim: { cells: RN_KER + RN_IM + RN_IM },
    primitives: [
        ...rectPieces([
            ...Array.from({ length: RN_KER }, (_, i) => ({ x: i, y: 0, w: 1, h: 1, color: 3 })),
            ...Array.from({ length: RN_IM }, (_, i) => ({ x: RN_KER + i, y: 0, w: 1, h: 1, color: 0 })),
            ...Array.from({ length: RN_IM }, (_, i) => ({ x: RN_KER + i, y: -3.2, w: 1, h: 1, color: 0 })),
        ]),
        ...Array.from({ length: RN_IM }, (_, i): ProofPrimitive => ({
            kind: 'arrow',
            from: [RN_KER + i + 0.5, -0.25, 0],
            to: [RN_KER + i + 0.5, -2.95, 0],
            color: COLOR_BLUE, thickness: 0.045, headSize: 0.3,
        })),
        { kind: 'arrow', from: [RN_KER / 2, -0.25, 0], to: [RN_KER / 2, -2.95, 0],
          color: COLOR_RED, thickness: 0.045, headSize: 0.3 },
        { kind: 'label', position: [RN_KER / 2, -1.6, 0], text: '0', scale: 0.4, color: COLOR_RED },
        ...dimension([0, 0, 0], [RN_KER, 0, 0], 'dim ker T', [0, 0.75, 0], 0.32),
        ...dimension([RN_KER, 0, 0], [RN_KER + RN_IM, 0, 0], 'the rest', [0, 0.75, 0], 0.32),
        { kind: 'label', position: [(RN_KER + RN_IM) / 2, 1.85, 0], text: 'dim V', scale: 0.42, color: COLOR_INK },
        { kind: 'label', position: [RN_KER + RN_IM / 2, -4.1, 0], text: 'dim im T', scale: 0.38, color: COLOR_BLUE },
    ],
};

// ─── Family K batch: what a map does to a simple object ─────────────────
//
// Apply the transformation to something you already understand and watch. Each
// figure draws its stages left to right with an arrow between, and keeps a
// marked point visible throughout so the motion can be followed.

// #48  e^{ix} = cos x + i sin x   — the unit circle, in components
const EU_R = 2.6;
const EU_C = 1.600720, EU_S = 2.048828;
const PROOF_EULER_FORMULA: VisualProof = {
    title: "Euler's Formula",
    caption: 'exp(ix) rides the unit circle; its legs are cos x and sin x',
    family: 'K',
    primitives: [
        { kind: 'circle', center: [0, 0, 0], radius: EU_R, segments: 56,
          stroke: COLOR_BLUE, strokeThickness: 0.05 },
        { kind: 'line', p1: [-EU_R - 0.6, 0, 0], p2: [EU_R + 0.6, 0, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'line', p1: [0, -EU_R - 0.6, 0], p2: [0, EU_R + 0.6, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'line', p1: [0, 0, 0], p2: [EU_C, 0, 0], color: COLOR_GREEN, thickness: 0.055 },
        { kind: 'line', p1: [EU_C, 0, 0], p2: [EU_C, EU_S, 0], color: COLOR_AMBER, thickness: 0.055 },
        rightAngle([EU_C, 0, 0], [-1, 0, 0], [0, 1, 0], 0.3),
        ...angleArc([0, 0, 0], 0, Math.atan2(EU_S, EU_C), 0.75),
        { kind: 'arrow', from: [0, 0, 0], to: [EU_C, EU_S, 0], color: COLOR_RED, thickness: 0.07, headSize: 0.38 },
        { kind: 'label', position: [1.0, 0.35, 0], text: 'x', scale: 0.38, color: COLOR_INK },
        { kind: 'label', position: [EU_C / 2, -0.6, 0], text: 'cos x', scale: 0.36, color: COLOR_GREEN },
        { kind: 'label', position: [EU_C + 0.95, EU_S / 2, 0], text: 'sin x', scale: 0.36, color: COLOR_AMBER },
        { kind: 'label', position: [EU_C - 0.9, EU_S + 0.55, 0], text: 'exp(ix)', scale: 0.42, color: COLOR_RED },
    ],
};

// #28  e^{iπ} + 1 = 0   — half a turn lands on −1
const PROOF_EULER_IDENTITY: VisualProof = {
    title: "Euler's Identity",
    caption: 'half a turn round the circle carries 1 to −1',
    family: 'K',
    primitives: [
        { kind: 'circle', center: [0, 0, 0], radius: EU_R, segments: 56,
          stroke: COLOR_BLUE, strokeThickness: 0.05 },
        { kind: 'line', p1: [-EU_R - 0.7, 0, 0], p2: [EU_R + 0.7, 0, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'line', p1: [0, -EU_R - 0.7, 0], p2: [0, EU_R + 0.7, 0], color: COLOR_INK, thickness: 0.03 },
        ...angleArc([0, 0, 0], 0, Math.PI, EU_R * 0.55, COLOR_AMBER, 22),
        { kind: 'arrow', from: [0, 0, 0], to: [EU_R, 0, 0], color: COLOR_GREEN, thickness: 0.07, headSize: 0.38 },
        { kind: 'arrow', from: [0, 0, 0], to: [-EU_R, 0, 0], color: COLOR_RED, thickness: 0.07, headSize: 0.38 },
        { kind: 'label', position: [EU_R * 0.55, -0.6, 0], text: '1', scale: 0.45, color: COLOR_GREEN },
        { kind: 'label', position: [-EU_R * 0.55, -0.6, 0], text: 'exp(iπ) = −1', scale: 0.38, color: COLOR_RED },
        { kind: 'label', position: [0.15, EU_R * 0.72, 0], text: 'π', scale: 0.42, color: COLOR_AMBER },
    ],
};

// #40  (cos θ + i sin θ)ⁿ = cos nθ + i sin nθ   — powers turn by θ each time
const DM_T = 0.645772;
const PROOF_DE_MOIVRE: VisualProof = {
    title: "De Moivre's Theorem",
    caption: 'multiplying adds the angles, so the nth power turns n times',
    family: 'K',
    primitives: [
        { kind: 'circle', center: [0, 0, 0], radius: EU_R, segments: 56,
          stroke: COLOR_BLUE, strokeThickness: 0.05 },
        { kind: 'line', p1: [-EU_R - 0.6, 0, 0], p2: [EU_R + 0.6, 0, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'line', p1: [0, -EU_R - 0.6, 0], p2: [0, EU_R + 0.6, 0], color: COLOR_INK, thickness: 0.03 },
        ...[1, 2, 3].map((k): ProofPrimitive => ({
            kind: 'arrow',
            from: [0, 0, 0],
            to: [EU_R * Math.cos(DM_T * k), EU_R * Math.sin(DM_T * k), 0],
            color: [COLOR_GREEN, COLOR_AMBER, COLOR_RED][k - 1],
            thickness: 0.065, headSize: 0.36,
        })),
        ...[0, 1, 2].flatMap(k => angleArc([0, 0, 0], DM_T * k, DM_T * (k + 1), 1.0 + k * 0.32)),
        { kind: 'label', position: [EU_R * Math.cos(DM_T) + 0.55, EU_R * Math.sin(DM_T) - 0.2, 0], text: 'z', scale: 0.4, color: COLOR_GREEN },
        { kind: 'label', position: [EU_R * Math.cos(2 * DM_T) + 0.5, EU_R * Math.sin(2 * DM_T) + 0.25, 0], text: 'z²', scale: 0.4, color: COLOR_AMBER },
        { kind: 'label', position: [EU_R * Math.cos(3 * DM_T) - 0.1, EU_R * Math.sin(3 * DM_T) + 0.6, 0], text: 'z³', scale: 0.4, color: COLOR_RED },
        { kind: 'label', position: [1.5, 0.32, 0], text: 'θ', scale: 0.32, color: COLOR_INK },
    ],
};

// #15  x²/a² + y²/b² = 1   — the unit circle stretched
const EL_A = 3.4, EL_B = 2.0;
const PROOF_ELLIPSE: VisualProof = {
    title: 'Ellipse Equation',
    caption: 'stretch the unit circle by a across and b up',
    family: 'K',
    primitives: [
        { kind: 'circle', center: [0, 0, 0], radius: EL_B, segments: 56,
          stroke: COLOR_BLUE, strokeThickness: 0.045 },
        ...Array.from({ length: 56 }, (_, i): ProofPrimitive => {
            const t0 = (i / 56) * Math.PI * 2, t1 = ((i + 1) / 56) * Math.PI * 2;
            return {
                kind: 'line',
                p1: [EL_A * Math.cos(t0), EL_B * Math.sin(t0), 0],
                p2: [EL_A * Math.cos(t1), EL_B * Math.sin(t1), 0],
                color: COLOR_AMBER, thickness: 0.055,
            };
        }),
        { kind: 'arrow', from: [EL_B * Math.cos(0.9), EL_B * Math.sin(0.9), 0],
          to: [EL_A * Math.cos(0.9), EL_B * Math.sin(0.9), 0],
          color: COLOR_RED, thickness: 0.05, headSize: 0.3 },
        ...dimension([0, 0, 0], [EL_A, 0, 0], 'a', [0, -0.65, 0], 0.4),
        ...dimension([0, 0, 0], [0, EL_B, 0], 'b', [-0.65, 0, 0], 0.4),
        { kind: 'label', position: [0, EL_B + 0.85, 0], text: 'x/a and y/b land on the circle', scale: 0.28, color: COLOR_INK },
    ],
};

// #67  det(AB) = det A · det B   — area scale factors multiply
//
// The unit square has area 1. A takes it to a parallelogram of area det A; B
// then multiplies THAT area by det B. Applying them in turn scales area by the
// product, which is what det(AB) means.
const DP_S = 1.5;
const PROOF_DET_PRODUCT: VisualProof = {
    title: 'Determinant of a Product',
    caption: 'each map scales area by its determinant, so the scales multiply',
    family: 'K',
    claim: { detA: 2.090000, detB: 1.400000, detBA: 2.926000 },
    primitives: [
        { kind: 'polygon', points: [[0, 0, 0], [DP_S, 0, 0], [DP_S, DP_S, 0], [0, DP_S, 0]],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.05 },
        { kind: 'polygon',
          points: [[5, 0, 0], [5 + 1.6*DP_S, 0.5*DP_S, 0],
                   [5 + (1.6+0.3)*DP_S, (0.5+1.4)*DP_S, 0],
                   [5 + 0.3*DP_S, 1.4*DP_S, 0]],
          fill: COLOR_GREEN_FILL, stroke: COLOR_GREEN, strokeThickness: 0.05 },
        { kind: 'polygon',
          points: [[10.5, 0, 0], [10.5 + 1.7200*DP_S, 0.8700*DP_S, 0],
                   [10.5 + (1.7200+-0.2000)*DP_S, (0.8700+1.6000)*DP_S, 0],
                   [10.5 + -0.2000*DP_S, 1.6000*DP_S, 0]],
          fill: COLOR_AMBER_FILL, stroke: COLOR_AMBER, strokeThickness: 0.05 },
        { kind: 'arrow', from: [3.0, 1.4, 0], to: [4.4, 1.4, 0], color: COLOR_INK, thickness: 0.05, headSize: 0.32 },
        { kind: 'arrow', from: [8.6, 1.4, 0], to: [10.0, 1.4, 0], color: COLOR_INK, thickness: 0.05, headSize: 0.32 },
        { kind: 'label', position: [3.7, 1.95, 0], text: 'A', scale: 0.42, color: COLOR_INK },
        { kind: 'label', position: [9.3, 1.95, 0], text: 'B', scale: 0.42, color: COLOR_INK },
        { kind: 'label', position: [DP_S / 2, -0.7, 0], text: '1', scale: 0.4, color: COLOR_BLUE },
        { kind: 'label', position: [6.4, -0.7, 0], text: 'det A', scale: 0.36, color: COLOR_GREEN },
        { kind: 'label', position: [11.9, -0.7, 0], text: 'det A · det B', scale: 0.34, color: COLOR_AMBER },
    ],
};

// #69  Av = λv   — the direction the map does not turn
const EV_L = 1.7;
const PROOF_EIGENVALUE: VisualProof = {
    title: 'Eigenvalue Equation',
    caption: 'v keeps its direction and only stretches; w does not',
    family: 'K',
    primitives: [
        { kind: 'line', p1: [-0.6, -0.6 * 0.62, 0], p2: [4.6, 4.6 * 0.62, 0],
          color: COLOR_INK, thickness: 0.03 },
        { kind: 'arrow', from: [0, 0, 0], to: [1.9, 1.9 * 0.62, 0], color: COLOR_GREEN, thickness: 0.07, headSize: 0.36 },
        { kind: 'arrow', from: [0, 0, 0], to: [1.9 * EV_L, 1.9 * 0.62 * EV_L, 0], color: COLOR_BLUE, thickness: 0.055, headSize: 0.32 },
        { kind: 'arrow', from: [0, 0, 0], to: [0.5, 2.5, 0], color: COLOR_AMBER, thickness: 0.07, headSize: 0.36 },
        { kind: 'arrow', from: [0, 0, 0], to: [2.4, 1.6, 0], color: COLOR_RED, thickness: 0.055, headSize: 0.32 },
        { kind: 'label', position: [1.55, 1.9 * 0.62 - 0.5, 0], text: 'v', scale: 0.42, color: COLOR_GREEN },
        { kind: 'label', position: [1.9 * EV_L + 0.5, 1.9 * 0.62 * EV_L - 0.25, 0], text: 'Av = λv', scale: 0.34, color: COLOR_BLUE },
        { kind: 'label', position: [0.15, 2.85, 0], text: 'w', scale: 0.42, color: COLOR_AMBER },
        { kind: 'label', position: [2.9, 1.75, 0], text: 'Aw', scale: 0.36, color: COLOR_RED },
    ],
};

// ─── Family A/F remainder ───────────────────────────────────────────────

// #17  A = ½r²θ   — the sector is its share of the whole disc
//
// θ is 15 of the 72 segments the disc is drawn in, so the sector is exactly
// 15/72 of it — the claim is checked against the POLYGON's area, not πr², since
// a polygon is what is drawn.
const SC_R = 2.6, SC_N = 72, SC_SEG = 15;
const scArc = (from: number, to: number): Vec3[] => {
    const pts: Vec3[] = [[0, 0, 0]];
    for (let i = from; i <= to; i++) {
        const t = (i / SC_N) * Math.PI * 2;
        pts.push([Math.cos(t) * SC_R, Math.sin(t) * SC_R, 0]);
    }
    return pts;
};
const PROOF_SECTOR_AREA: VisualProof = {
    title: 'Sector Area',
    caption: 'the sector is θ/2π of the disc, so ½r²θ',
    family: 'A',
    claim: { total: 21.210222 },
    primitives: [
        { kind: 'polygon', points: scArc(SC_SEG, SC_N), fill: COLOR_BLUE_FILL,
          stroke: COLOR_BLUE, strokeThickness: 0.04 },
        { kind: 'polygon', points: scArc(0, SC_SEG), fill: COLOR_AMBER_FILL,
          stroke: COLOR_AMBER, strokeThickness: 0.05 },
        ...angleArc([0, 0, 0], 0, (SC_SEG / SC_N) * Math.PI * 2, 0.85),
        { kind: 'label', position: [1.35, 0.42, 0], text: 'θ', scale: 0.4, color: COLOR_INK },
        { kind: 'label', position: [SC_R * 0.62, SC_R * 0.33, 0], text: '½r²θ', scale: 0.36, color: COLOR_AMBER },
        { kind: 'label', position: [-SC_R * 0.45, -SC_R * 0.45, 0], text: 'πr²', scale: 0.4, color: COLOR_BLUE },
        ...dimension([0, 0, 0], [SC_R, 0, 0], 'r', [0, -0.5, 0], 0.34),
    ],
};

// #19  α + β + γ = π   — the parallel through the apex
//
// A line through the apex parallel to the base makes two alternate angles equal
// to the base angles. Those two plus γ fill a straight line, so they total π.
const AS_T: Vec3[] = [[0.00000, 0.00000, 0], [5.00000, 0.00000, 0], [1.80000, 3.00000, 0]];
const PROOF_ANGLE_SUM: VisualProof = {
    title: 'Angle Sum of a Triangle',
    caption: 'the parallel through the apex lays α, γ and β along a straight line',
    family: 'A',
    claim: { angleSum: Math.PI, alpha: 1.030376827, beta: 0.753151281, gamma: 1.358064546 },
    primitives: [
        { kind: 'polygon', points: AS_T, fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.06 },
        { kind: 'line', p1: [-1.6, 3.0, 0], p2: [4.6, 3.0, 0], color: COLOR_AMBER, thickness: 0.05 },
        ...angleArc([0, 0, 0], 0, 1.030377, 0.9),
        ...angleArc([5, 0, 0], Math.PI - 0.753151, Math.PI, 0.9),
        ...angleArc([1.8, 3.0, 0], Math.PI + Math.atan2(-3.0, -1.8), Math.PI * 2 + Math.atan2(-3.0, 3.2), 0.75),
        { kind: 'label', position: [0.95, 0.3, 0], text: 'α', scale: 0.4, color: COLOR_INK },
        { kind: 'label', position: [4.0, 0.3, 0], text: 'β', scale: 0.4, color: COLOR_INK },
        { kind: 'label', position: [1.8, 2.35, 0], text: 'γ', scale: 0.4, color: COLOR_INK },
        { kind: 'label', position: [0.55, 3.35, 0], text: 'α', scale: 0.4, color: COLOR_AMBER },
        { kind: 'label', position: [3.05, 3.35, 0], text: 'β', scale: 0.4, color: COLOR_AMBER },
    ],
};

// #20  θ_ext = α + β   — the exterior angle is what γ leaves over
const PROOF_EXTERIOR_ANGLE: VisualProof = {
    title: 'Exterior Angle Theorem',
    caption: 'γ and the exterior angle fill a straight line, and α+β+γ = π',
    family: 'A',
    claim: { angleSum: Math.PI, alpha: 1.030376827, beta: 0.753151281, ext: 1.783528107 },
    primitives: [
        { kind: 'polygon', points: AS_T, fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.06 },
        { kind: 'line', p1: [1.8, 3.0, 0], p2: [3.8700, 6.4500, 0],
          color: COLOR_AMBER, thickness: 0.05 },
        ...angleArc([0, 0, 0], 0, 1.030377, 0.9),
        ...angleArc([5, 0, 0], Math.PI - 0.753151, Math.PI, 0.9),
        ...angleArc([1.8, 3.0, 0], Math.atan2(3.0, 1.8), Math.PI * 2 + Math.atan2(-3.0, 3.2), 0.8, COLOR_AMBER, 16),
        { kind: 'label', position: [0.95, 0.3, 0], text: 'α', scale: 0.4, color: COLOR_INK },
        { kind: 'label', position: [4.0, 0.3, 0], text: 'β', scale: 0.4, color: COLOR_INK },
        { kind: 'label', position: [2.55, 3.15, 0], text: 'θ ext', scale: 0.34, color: COLOR_AMBER },
    ],
};

// #25  Sₙ = a(1−rⁿ)/(1−r)   — the terms laid end to end
const GS_TERMS = [2.000000, 1.200000, 0.720000, 0.432000, 0.259200];
const PROOF_GEOMETRIC_SUM: VisualProof = {
    title: 'Geometric Series Sum',
    caption: 'each term is r times the last; they reach a(1 − r to the n)/(1 − r)',
    family: 'A',
    claim: { total: 4.611200 },
    primitives: [
        ...rectPieces(GS_TERMS.map((w, i) => {
            const x = GS_TERMS.slice(0, i).reduce((t, v) => t + v, 0);
            return { x, y: 0, w, h: 1, color: i % 2, label: i < 3 ? ['a', 'ar', 'ar²'][i] : undefined,
                     labelScale: 0.3 };
        })),
        ...dimension([0, 0, 0], [4.611200, 0, 0], 'a + ar + ar² + ... = S', [0, -0.75, 0], 0.3),
    ],
};

// #29  log(ab) = log a + log b   — area under 1/x, which translation cannot change
//
// The area under 1/x from 1 to a is log a. Scaling x by a maps the strip
// [1, b] onto [a, ab] and leaves the area alone, because 1/x halves exactly as
// fast as dx doubles — so that second strip is log b too.
const LG_A = 2.0, LG_B = 3.0;
const PROOF_LOG_PRODUCT: VisualProof = {
    title: 'Logarithm Product Rule',
    caption: 'stretching x by a leaves area under 1/x alone, so the strips add',
    family: 'A',
    claim: { total: 5.375577 },
    primitives: [
        { kind: 'polygon', points: [[1.00000, 0.00000, 0], [1.00000, 3.00000, 0], [1.01667, 2.95082, 0], [1.03333, 2.90323, 0], [1.05000, 2.85714, 0], [1.06667, 2.81250, 0], [1.08333, 2.76923, 0], [1.10000, 2.72727, 0], [1.11667, 2.68657, 0], [1.13333, 2.64706, 0], [1.15000, 2.60870, 0], [1.16667, 2.57143, 0], [1.18333, 2.53521, 0], [1.20000, 2.50000, 0], [1.21667, 2.46575, 0], [1.23333, 2.43243, 0], [1.25000, 2.40000, 0], [1.26667, 2.36842, 0], [1.28333, 2.33766, 0], [1.30000, 2.30769, 0], [1.31667, 2.27848, 0], [1.33333, 2.25000, 0], [1.35000, 2.22222, 0], [1.36667, 2.19512, 0], [1.38333, 2.16867, 0], [1.40000, 2.14286, 0], [1.41667, 2.11765, 0], [1.43333, 2.09302, 0], [1.45000, 2.06897, 0], [1.46667, 2.04545, 0], [1.48333, 2.02247, 0], [1.50000, 2.00000, 0], [1.51667, 1.97802, 0], [1.53333, 1.95652, 0], [1.55000, 1.93548, 0], [1.56667, 1.91489, 0], [1.58333, 1.89474, 0], [1.60000, 1.87500, 0], [1.61667, 1.85567, 0], [1.63333, 1.83673, 0], [1.65000, 1.81818, 0], [1.66667, 1.80000, 0], [1.68333, 1.78218, 0], [1.70000, 1.76471, 0], [1.71667, 1.74757, 0], [1.73333, 1.73077, 0], [1.75000, 1.71429, 0], [1.76667, 1.69811, 0], [1.78333, 1.68224, 0], [1.80000, 1.66667, 0], [1.81667, 1.65138, 0], [1.83333, 1.63636, 0], [1.85000, 1.62162, 0], [1.86667, 1.60714, 0], [1.88333, 1.59292, 0], [1.90000, 1.57895, 0], [1.91667, 1.56522, 0], [1.93333, 1.55172, 0], [1.95000, 1.53846, 0], [1.96667, 1.52542, 0], [1.98333, 1.51261, 0], [2.00000, 1.50000, 0], [2.00000, 0.00000, 0]], fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.045 },
        { kind: 'polygon', points: [[2.00000, 0.00000, 0], [2.00000, 1.50000, 0], [2.06667, 1.45161, 0], [2.13333, 1.40625, 0], [2.20000, 1.36364, 0], [2.26667, 1.32353, 0], [2.33333, 1.28571, 0], [2.40000, 1.25000, 0], [2.46667, 1.21622, 0], [2.53333, 1.18421, 0], [2.60000, 1.15385, 0], [2.66667, 1.12500, 0], [2.73333, 1.09756, 0], [2.80000, 1.07143, 0], [2.86667, 1.04651, 0], [2.93333, 1.02273, 0], [3.00000, 1.00000, 0], [3.06667, 0.97826, 0], [3.13333, 0.95745, 0], [3.20000, 0.93750, 0], [3.26667, 0.91837, 0], [3.33333, 0.90000, 0], [3.40000, 0.88235, 0], [3.46667, 0.86538, 0], [3.53333, 0.84906, 0], [3.60000, 0.83333, 0], [3.66667, 0.81818, 0], [3.73333, 0.80357, 0], [3.80000, 0.78947, 0], [3.86667, 0.77586, 0], [3.93333, 0.76271, 0], [4.00000, 0.75000, 0], [4.06667, 0.73770, 0], [4.13333, 0.72581, 0], [4.20000, 0.71429, 0], [4.26667, 0.70312, 0], [4.33333, 0.69231, 0], [4.40000, 0.68182, 0], [4.46667, 0.67164, 0], [4.53333, 0.66176, 0], [4.60000, 0.65217, 0], [4.66667, 0.64286, 0], [4.73333, 0.63380, 0], [4.80000, 0.62500, 0], [4.86667, 0.61644, 0], [4.93333, 0.60811, 0], [5.00000, 0.60000, 0], [5.06667, 0.59211, 0], [5.13333, 0.58442, 0], [5.20000, 0.57692, 0], [5.26667, 0.56962, 0], [5.33333, 0.56250, 0], [5.40000, 0.55556, 0], [5.46667, 0.54878, 0], [5.53333, 0.54217, 0], [5.60000, 0.53571, 0], [5.66667, 0.52941, 0], [5.73333, 0.52326, 0], [5.80000, 0.51724, 0], [5.86667, 0.51136, 0], [5.93333, 0.50562, 0], [6.00000, 0.50000, 0], [6.00000, 0.00000, 0]], fill: COLOR_GREEN_FILL, stroke: COLOR_GREEN, strokeThickness: 0.045 },
        { kind: 'label', position: [1.5, 0.65, 0], text: 'log a', scale: 0.32, color: COLOR_BLUE },
        { kind: 'label', position: [3.8, 0.42, 0], text: 'log b', scale: 0.32, color: COLOR_GREEN },
        { kind: 'label', position: [3.5, 2.75, 0], text: 'y = 1/x', scale: 0.32, color: COLOR_INK },
        { kind: 'label', position: [1.0, -0.5, 0], text: '1', scale: 0.3, color: COLOR_INK },
        { kind: 'label', position: [2.0, -0.5, 0], text: 'a', scale: 0.3, color: COLOR_INK },
        { kind: 'label', position: [6.0, -0.5, 0], text: 'ab', scale: 0.3, color: COLOR_INK },
    ],
};

// #33  (a+b)/2 ≥ √(ab)   — the half-chord never outruns the radius
//
// Draw a semicircle on a diameter split into a and b. The perpendicular at the
// split point meets the circle at height √(ab) — the geometric mean — while the
// radius is (a+b)/2. A half-chord cannot exceed a radius, and they are equal
// only when the split is central, which is a = b.
const AM_A = 4.0, AM_B = 1.8;
const AM_R = 2.9, AM_H = 2.683282;
const PROOF_AM_GM: VisualProof = {
    title: 'AM-GM Inequality',
    caption: 'the half-chord √(ab) can never exceed the radius (a+b)/2',
    family: 'F',
    primitives: [
        ...Array.from({ length: 40 }, (_, i): ProofPrimitive => {
            const t0 = Math.PI * (i / 40), t1 = Math.PI * ((i + 1) / 40);
            return { kind: 'line',
                     p1: [AM_R + AM_R * Math.cos(t0), AM_R * Math.sin(t0), 0],
                     p2: [AM_R + AM_R * Math.cos(t1), AM_R * Math.sin(t1), 0],
                     color: COLOR_BLUE, thickness: 0.05 };
        }),
        { kind: 'line', p1: [0, 0, 0], p2: [AM_A + AM_B, 0, 0], color: COLOR_INK, thickness: 0.045 },
        { kind: 'line', p1: [AM_A, 0, 0], p2: [AM_A, AM_H, 0], color: COLOR_GREEN, thickness: 0.06 },
        { kind: 'line', p1: [AM_R, 0, 0], p2: [AM_A, AM_H, 0], color: COLOR_AMBER, thickness: 0.055 },
        rightAngle([AM_A, 0, 0], [-1, 0, 0], [0, 1, 0], 0.28),
        ...dimension([0, 0, 0], [AM_A, 0, 0], 'a', [0, -0.6, 0], 0.36),
        ...dimension([AM_A, 0, 0], [AM_A + AM_B, 0, 0], 'b', [0, -0.6, 0], 0.36),
        { kind: 'label', position: [AM_A + 0.85, AM_H / 2, 0], text: '√(ab)', scale: 0.34, color: COLOR_GREEN },
        { kind: 'label', position: [AM_R - 0.9, AM_H * 0.62, 0], text: '(a+b)/2', scale: 0.32, color: COLOR_AMBER },
    ],
};

// ─── Family C / F / H batch ─────────────────────────────────────────────

// #9  V = πr²h   — a stack of identical discs (Cavalieri)
//
// Every horizontal slice of a cylinder is the same disc, area πr². Stack them h
// deep and the volume is πr²h. Drawn as separated discs so the slices — the
// thing the argument is about — are the visible objects.
const CY_R = 2.0, CY_N = 6, CY_STEP = 0.9;
const PROOF_CYLINDER_VOLUME: VisualProof = {
    title: 'Volume of a Cylinder',
    caption: 'every slice is the same πr² disc, stacked h deep',
    family: 'C',
    spatial: true,
    primitives: [
        ...Array.from({ length: CY_N }, (_, i) =>
            revolve([[0, i * CY_STEP], [CY_R, i * CY_STEP]], 20, 'out',
                    opaque(i % 2 === 0 ? COLOR_BLUE_FILL : COLOR_GREEN_FILL),
                    [0, i * CY_STEP - 1, 0], `slice:${i}`)).flat(),
        { kind: 'line', p1: [CY_R + 0.7, 0, 0], p2: [CY_R + 0.7, (CY_N - 1) * CY_STEP, 0],
          color: COLOR_INK, thickness: 0.05 },
        { kind: 'label', position: [CY_R + 1.5, (CY_N - 1) * CY_STEP / 2, 0], text: 'h', scale: 0.45, color: COLOR_INK },
        { kind: 'label', position: [0, -1.5, 0], text: 'πr² each', scale: 0.4, color: COLOR_BLUE },
        ...dimension([0, 0, 0], [CY_R, 0, 0], 'r', [0, -0.55, 0], 0.36),
    ],
};

// #3  a/sin A = 2R   — the diameter turns a chord into a sine
//
// Draw the circumcircle and the diameter from B. The angle at C standing on a
// diameter is right, and the angle at B′ equals the angle at A because both
// stand on the same arc — so a = 2R sin A.
const LS_R = 2.6;
const LS_A: Vec3 = [-0.45149, 2.56050, 0];
const LS_B: Vec3 = [-2.25167, -1.30000, 0];
const LS_C: Vec3 = [2.25167, -1.30000, 0];
const LS_BP: Vec3 = [2.25167, 1.30000, 0];
const PROOF_LAW_OF_SINES: VisualProof = {
    title: 'Law of Sines',
    caption: 'the angle on a diameter is right, so a = 2R sin A',
    family: 'F',
    primitives: [
        { kind: 'circle', center: [0, 0, 0], radius: LS_R, segments: 56,
          stroke: COLOR_BLUE, strokeThickness: 0.045 },
        { kind: 'polygon', points: [LS_A, LS_B, LS_C], fill: COLOR_BLUE_FILL,
          stroke: COLOR_BLUE, strokeThickness: 0.055 },
        { kind: 'line', p1: LS_B, p2: LS_BP, color: COLOR_AMBER, thickness: 0.055 },
        { kind: 'line', p1: LS_BP, p2: LS_C, color: COLOR_AMBER, thickness: 0.05 },
        rightAngle(LS_C, [LS_B[0] - LS_C[0], LS_B[1] - LS_C[1], 0],
                          [LS_BP[0] - LS_C[0], LS_BP[1] - LS_C[1], 0], 0.32),
        { kind: 'label', position: [LS_A[0] - 0.1, LS_A[1] + 0.55, 0], text: 'A', scale: 0.4, color: COLOR_INK },
        { kind: 'label', position: [LS_B[0] - 0.55, LS_B[1] - 0.35, 0], text: 'B', scale: 0.4, color: COLOR_INK },
        { kind: 'label', position: [LS_C[0] + 0.5, LS_C[1] - 0.35, 0], text: 'C', scale: 0.4, color: COLOR_INK },
        { kind: 'label', position: [LS_BP[0] + 0.6, LS_BP[1] + 0.2, 0], text: "B'", scale: 0.36, color: COLOR_AMBER },
        { kind: 'label', position: [0, LS_B[1] - 0.75, 0], text: 'a', scale: 0.4, color: COLOR_INK },
        { kind: 'label', position: [0.1, 0.45, 0], text: '2R', scale: 0.36, color: COLOR_AMBER },
    ],
};

// #11  M = ((x₁+x₂)/2, (y₁+y₂)/2)   — the half-size similar triangle
const MP_1: Vec3 = [1, 1, 0], MP_2: Vec3 = [6, 4, 0];
const MP_M: Vec3 = [(1 + 6) / 2, (1 + 4) / 2, 0];
const PROOF_MIDPOINT: VisualProof = {
    title: 'Midpoint Formula',
    caption: 'halving the segment halves each leg, so each coordinate averages',
    family: 'F',
    primitives: [
        { kind: 'polygon', points: [MP_1, [MP_2[0], MP_1[1], 0], MP_2],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.05 },
        { kind: 'polygon', points: [MP_1, [MP_M[0], MP_1[1], 0], MP_M],
          fill: COLOR_AMBER_FILL, stroke: COLOR_AMBER, strokeThickness: 0.05 },
        rightAngle([MP_2[0], MP_1[1], 0], [-1, 0, 0], [0, 1, 0], 0.35),
        rightAngle([MP_M[0], MP_1[1], 0], [-1, 0, 0], [0, 1, 0], 0.28),
        { kind: 'label', position: [MP_1[0] - 0.75, MP_1[1] - 0.5, 0], text: '(x1,y1)', scale: 0.32, color: COLOR_INK },
        { kind: 'label', position: [MP_2[0] + 0.3, MP_2[1] + 0.5, 0], text: '(x2,y2)', scale: 0.32, color: COLOR_INK },
        { kind: 'label', position: [MP_M[0] - 1.35, MP_M[1] + 0.45, 0], text: 'M', scale: 0.42, color: COLOR_AMBER },
        { kind: 'label', position: [(MP_1[0] + MP_M[0]) / 2, MP_1[1] - 0.55, 0], text: 'half the run', scale: 0.28, color: COLOR_AMBER },
    ],
};

// #34  |a+b| ≤ |a| + |b|   — the detour and the direct route
const TI_A: Vec3 = [3.4, 0.9, 0], TI_B: Vec3 = [1.1, 2.6, 0];
const PROOF_TRIANGLE_INEQ: VisualProof = {
    title: 'Triangle Inequality',
    caption: 'walking a then b is never shorter than going straight',
    family: 'H',
    primitives: [
        { kind: 'arrow', from: [0, 0, 0], to: TI_A, color: COLOR_GREEN, thickness: 0.07, headSize: 0.38 },
        { kind: 'arrow', from: TI_A, to: [TI_A[0] + TI_B[0], TI_A[1] + TI_B[1], 0],
          color: COLOR_AMBER, thickness: 0.07, headSize: 0.38 },
        { kind: 'arrow', from: [0, 0, 0], to: [TI_A[0] + TI_B[0], TI_A[1] + TI_B[1], 0],
          color: COLOR_RED, thickness: 0.07, headSize: 0.38 },
        { kind: 'label', position: [TI_A[0] / 2 + 0.2, TI_A[1] / 2 - 0.6, 0], text: '|a|', scale: 0.38, color: COLOR_GREEN },
        { kind: 'label', position: [TI_A[0] + TI_B[0] / 2 + 0.7, TI_A[1] + TI_B[1] / 2, 0], text: '|b|', scale: 0.38, color: COLOR_AMBER },
        { kind: 'label', position: [(TI_A[0] + TI_B[0]) / 2 - 0.9, (TI_A[1] + TI_B[1]) / 2 + 0.35, 0], text: '|a+b|', scale: 0.38, color: COLOR_RED },
    ],
};

// #49  d(sin θ)/dθ = cos θ   — the velocity of a point on the unit circle
//
// A point going round the unit circle at unit speed has velocity tangent to the
// circle: (−sin θ, cos θ). Its height changes at the rate of the vertical part
// of that velocity, which is cos θ.
const DS_R = 2.6, DS_T = 0.837758;
const DS_PX = 1.739740, DS_PY = 1.932177;
const PROOF_DERIV_SIN: VisualProof = {
    title: 'Derivative of sin',
    caption: 'the velocity is tangent; its vertical part is cos θ',
    family: 'E',
    primitives: [
        { kind: 'circle', center: [0, 0, 0], radius: DS_R, segments: 56,
          stroke: COLOR_BLUE, strokeThickness: 0.045 },
        { kind: 'line', p1: [-DS_R - 0.5, 0, 0], p2: [DS_R + 0.5, 0, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'line', p1: [0, -DS_R - 0.5, 0], p2: [0, DS_R + 0.5, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'line', p1: [0, 0, 0], p2: [DS_PX, DS_PY, 0], color: COLOR_INK, thickness: 0.04 },
        { kind: 'arrow', from: [DS_PX, DS_PY, 0],
          to: [DS_PX - Math.sin(DS_T) * 1.9, DS_PY + Math.cos(DS_T) * 1.9, 0],
          color: COLOR_RED, thickness: 0.06, headSize: 0.34 },
        { kind: 'line', p1: [DS_PX - Math.sin(DS_T) * 1.9, DS_PY + Math.cos(DS_T) * 1.9, 0],
          p2: [DS_PX - Math.sin(DS_T) * 1.9, DS_PY, 0], color: COLOR_GREEN, thickness: 0.05 },
        { kind: 'line', p1: [DS_PX, DS_PY, 0], p2: [DS_PX - Math.sin(DS_T) * 1.9, DS_PY, 0],
          color: COLOR_AMBER, thickness: 0.05 },
        rightAngle([DS_PX - Math.sin(DS_T) * 1.9, DS_PY, 0], [1, 0, 0], [0, 1, 0], 0.26),
        ...angleArc([0, 0, 0], 0, DS_T, 0.8),
        { kind: 'label', position: [1.05, 0.35, 0], text: 'θ', scale: 0.36, color: COLOR_INK },
        { kind: 'label', position: [DS_PX - Math.sin(DS_T) * 1.9 - 0.95, DS_PY + Math.cos(DS_T) * 0.9, 0],
          text: 'cos θ', scale: 0.32, color: COLOR_GREEN },
        { kind: 'label', position: [DS_PX - Math.sin(DS_T) * 0.95, DS_PY - 0.5, 0],
          text: '−sin θ', scale: 0.32, color: COLOR_AMBER },
    ],
};

// #77  u · v = 0   — the shadow vanishes at a right angle
const OR_U: Vec3 = [3.6, 0, 0], OR_V: Vec3 = [0, 2.9, 0];
const PROOF_ORTHOGONALITY: VisualProof = {
    title: 'Orthogonality',
    caption: 'v casts no shadow along u, so the product is zero',
    family: 'E',
    primitives: [
        { kind: 'arrow', from: [0, 0, 0], to: OR_U, color: COLOR_BLUE, thickness: 0.07, headSize: 0.38 },
        { kind: 'arrow', from: [0, 0, 0], to: OR_V, color: COLOR_AMBER, thickness: 0.07, headSize: 0.38 },
        { kind: 'line', p1: [0, 0, 0], p2: [OR_U[0], 0, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'line', p1: [0, 0, 0], p2: [0, OR_V[1], 0], color: COLOR_INK, thickness: 0.03 },
        rightAngle([0, 0, 0], [1, 0, 0], [0, 1, 0], 0.42),
        { kind: 'label', position: [OR_U[0] - 0.5, -0.6, 0], text: 'u', scale: 0.45, color: COLOR_BLUE },
        { kind: 'label', position: [-0.6, OR_V[1] - 0.4, 0], text: 'v', scale: 0.45, color: COLOR_AMBER },
        { kind: 'label', position: [1.9, 1.75, 0], text: 'shadow = 0', scale: 0.32, color: COLOR_INK },
    ],
};

// ─── Limit, similarity and projection: the remainder in 2D ──────────────

// #6  C = 2πr   — the ratio is the same for every circle
//
// Inscribed regular polygons have perimeter 2nr·sin(π/n), which is r times a
// number depending only on n. Every circle therefore has the same
// perimeter-to-radius ratio, and π is the name of half its limit. The figure
// shows the climb: 3.000, 3.106, 3.133 … → π.
const CR_R = 2.6;
const crPoly = (n: number, color: Color): ProofPrimitive[] =>
    Array.from({ length: n }, (_, i) => {
        const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
        return {
            kind: 'line' as const,
            p1: [Math.cos(t0) * CR_R, Math.sin(t0) * CR_R, 0] as Vec3,
            p2: [Math.cos(t1) * CR_R, Math.sin(t1) * CR_R, 0] as Vec3,
            color, thickness: 0.05,
        };
    });
const PROOF_CIRCUMFERENCE: VisualProof = {
    title: 'Circumference',
    caption: 'inscribed perimeters climb to C, and C/2r is what π names',
    family: 'D',
    claim: { p6: 3.000000, p12: 3.105829, p24: 3.132629, pi: Math.PI },
    primitives: [
        { kind: 'circle', center: [0, 0, 0], radius: CR_R, segments: 64,
          stroke: COLOR_INK, strokeThickness: 0.04 },
        ...crPoly(6, COLOR_RED),
        ...crPoly(12, COLOR_AMBER),
        ...crPoly(24, COLOR_GREEN),
        { kind: 'label', position: [0, -CR_R - 0.85, 0], text: 'P/2r → π', scale: 0.42, color: COLOR_INK },
        { kind: 'label', position: [CR_R + 1.5, 0.9, 0], text: '6:  3.000', scale: 0.28, color: COLOR_RED },
        { kind: 'label', position: [CR_R + 1.5, 0.3, 0], text: '12: 3.106', scale: 0.28, color: COLOR_AMBER },
        { kind: 'label', position: [CR_R + 1.5, -0.3, 0], text: '24: 3.133', scale: 0.28, color: COLOR_GREEN },
    ],
};

// #16  s = rθ   — the arc grows in step with the radius
//
// Two sectors sharing an angle are similar, so their arcs are in the same ratio
// as their radii. The arc-to-radius ratio therefore depends only on the angle,
// and radian measure is the decision to call that ratio θ.
const AL_T = Math.PI * 50 / 180, AL_R1 = 1.5, AL_R2 = 2.9;
const alArc = (r: number, color: Color): ProofPrimitive[] =>
    Array.from({ length: 16 }, (_, i) => {
        const t0 = AL_T * (i / 16), t1 = AL_T * ((i + 1) / 16);
        return {
            kind: 'line' as const,
            p1: [Math.cos(t0) * r, Math.sin(t0) * r, 0] as Vec3,
            p2: [Math.cos(t1) * r, Math.sin(t1) * r, 0] as Vec3,
            color, thickness: 0.07,
        };
    });
const PROOF_ARC_LENGTH: VisualProof = {
    title: 'Arc Length',
    caption: 'similar sectors: double the radius, double the arc',
    family: 'F',
    primitives: [
        { kind: 'line', p1: [0, 0, 0], p2: [AL_R2, 0, 0], color: COLOR_INK, thickness: 0.04 },
        { kind: 'line', p1: [0, 0, 0], p2: [Math.cos(AL_T) * AL_R2, Math.sin(AL_T) * AL_R2, 0],
          color: COLOR_INK, thickness: 0.04 },
        ...alArc(AL_R1, COLOR_AMBER),
        ...alArc(AL_R2, COLOR_BLUE),
        ...angleArc([0, 0, 0], 0, AL_T, 0.55),
        { kind: 'label', position: [0.95, 0.25, 0], text: 'θ', scale: 0.36, color: COLOR_INK },
        { kind: 'label', position: [Math.cos(AL_T / 2) * (AL_R1 + 0.5), Math.sin(AL_T / 2) * (AL_R1 + 0.5), 0],
          text: 'r1·θ', scale: 0.32, color: COLOR_AMBER },
        { kind: 'label', position: [Math.cos(AL_T / 2) * (AL_R2 + 0.6), Math.sin(AL_T / 2) * (AL_R2 + 0.6), 0],
          text: 'r2·θ', scale: 0.32, color: COLOR_BLUE },
    ],
};

// #21  x = (−b ± √(b²−4ac)) / 2a   — completing the square
//
// x² + 2px is an L: a square of side x with two p-wide strips along two edges.
// The corner it is missing is exactly p², so adding p² makes it (x+p)². That is
// the whole manoeuvre; the formula is what you get on solving for x.
const QF_X = 3, QF_P = 1;
const PROOF_QUADRATIC: VisualProof = {
    title: 'Quadratic Formula',
    caption: 'x² + 2px is missing exactly p² from being a square',
    family: 'A',
    claim: { total: (QF_X + QF_P) ** 2 },
    primitives: [
        ...rectPieces([
            { x: 0, y: 0, w: QF_X, h: QF_X, label: 'x²', color: 0 },
            { x: QF_X, y: 0, w: QF_P, h: QF_X, label: 'px', color: 1, labelScale: 0.34 },
            { x: 0, y: QF_X, w: QF_X, h: QF_P, label: 'px', color: 1, labelScale: 0.34 },
            { x: QF_X, y: QF_X, w: QF_P, h: QF_P, label: 'p²', color: 3, labelScale: 0.32 },
        ]),
        ...dimension([0, 0, 0], [QF_X + QF_P, 0, 0], '(x+p)', [0, -0.8, 0], 0.4),
        { kind: 'label', position: [QF_X + QF_P + 1.6, QF_X + QF_P / 2, 0], text: 'add p²', scale: 0.3, color: COLOR_RED },
    ],
};

// #26  S = a/(1−r)   — the tail shrinks to nothing
//
// The terms laid end to end never leave the segment of length a/(1−r), and
// after n of them what is left is a·rⁿ/(1−r) — the same shape as the whole,
// scaled by rⁿ. It shrinks to nothing, so the terms fill the segment exactly.
const IG_TERMS = [2.000000, 1.200000, 0.720000, 0.432000, 0.259200, 0.155520];
const IG_S = 5.000000, IG_REM = 0.233280;
const PROOF_INFINITE_GEOMETRIC: VisualProof = {
    title: 'Infinite Geometric Series',
    caption: 'the tail after n terms is the whole strip, scaled down n times',
    family: 'A',
    claim: { total: IG_S },
    primitives: [
        ...rectPieces([
            ...IG_TERMS.map((w, i) => ({
                x: IG_TERMS.slice(0, i).reduce((t, v) => t + v, 0), y: 0, w, h: 1,
                color: i % 2, label: i < 3 ? ['a', 'ar', 'ar²'][i] : undefined, labelScale: 0.3,
            })),
            { x: IG_S - IG_REM, y: 0, w: IG_REM, h: 1, color: 3 },
        ]),
        ...dimension([0, 0, 0], [IG_S, 0, 0], 'S = a/(1−r)', [0, -0.8, 0], 0.36),
        { kind: 'label', position: [IG_S - IG_REM / 2, 1.75, 0], text: 'tail → 0', scale: 0.3, color: COLOR_RED },
        { kind: 'line', p1: [IG_S - IG_REM / 2, 1.45, 0], p2: [IG_S - IG_REM / 2, 1.1, 0],
          color: COLOR_RED, thickness: 0.035 },
    ],
};

// #50  d(cos θ)/dθ = −sin θ   — the same velocity, read sideways
const DC_R = 2.6, DC_T = 0.837758;
const DC_PX = 1.739740, DC_PY = 1.932177;
const PROOF_DERIV_COS: VisualProof = {
    title: 'Derivative of cos',
    caption: 'the same tangent velocity; its horizontal part is −sin θ',
    family: 'E',
    primitives: [
        { kind: 'circle', center: [0, 0, 0], radius: DC_R, segments: 56,
          stroke: COLOR_BLUE, strokeThickness: 0.045 },
        { kind: 'line', p1: [-DC_R - 0.5, 0, 0], p2: [DC_R + 0.5, 0, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'line', p1: [0, -DC_R - 0.5, 0], p2: [0, DC_R + 0.5, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'line', p1: [0, 0, 0], p2: [DC_PX, DC_PY, 0], color: COLOR_INK, thickness: 0.04 },
        { kind: 'arrow', from: [DC_PX, DC_PY, 0],
          to: [DC_PX - Math.sin(DC_T) * 1.9, DC_PY + Math.cos(DC_T) * 1.9, 0],
          color: COLOR_RED, thickness: 0.06, headSize: 0.34 },
        { kind: 'line', p1: [DC_PX, DC_PY, 0], p2: [DC_PX - Math.sin(DC_T) * 1.9, DC_PY, 0],
          color: COLOR_AMBER, thickness: 0.06 },
        { kind: 'line', p1: [DC_PX - Math.sin(DC_T) * 1.9, DC_PY, 0],
          p2: [DC_PX - Math.sin(DC_T) * 1.9, DC_PY + Math.cos(DC_T) * 1.9, 0],
          color: COLOR_GREEN, thickness: 0.045 },
        rightAngle([DC_PX - Math.sin(DC_T) * 1.9, DC_PY, 0], [1, 0, 0], [0, 1, 0], 0.26),
        ...angleArc([0, 0, 0], 0, DC_T, 0.8),
        { kind: 'label', position: [1.05, 0.35, 0], text: 'θ', scale: 0.36, color: COLOR_INK },
        { kind: 'label', position: [DC_PX - Math.sin(DC_T) * 0.95, DC_PY - 0.55, 0],
          text: '−sin θ', scale: 0.34, color: COLOR_AMBER },
    ],
};

// #75  |⟨u,v⟩| ≤ ‖u‖‖v‖   — a leg never outruns the hypotenuse
//
// The shadow v casts along u has length ‖v‖·|cos θ|, and it is a leg of a right
// triangle whose hypotenuse is v itself. A leg cannot exceed the hypotenuse, so
// |⟨u,v⟩| = ‖u‖·‖v‖|cos θ| ≤ ‖u‖‖v‖, with equality only when v lies along u.
const CS_U = 4.0, CS_VX = 1.606014, CS_VY = 2.293626;
const PROOF_CAUCHY_SCHWARZ: VisualProof = {
    title: 'Cauchy-Schwarz',
    caption: 'the shadow is a leg; the vector is the hypotenuse',
    family: 'E',
    primitives: [
        { kind: 'polygon', points: [[0, 0, 0], [CS_VX, 0, 0], [CS_VX, CS_VY, 0]],
          fill: COLOR_GREEN_FILL, stroke: COLOR_GREEN, strokeThickness: 0.045 },
        { kind: 'line', p1: [0, 0, 0], p2: [CS_U, 0, 0], color: COLOR_INK, thickness: 0.035 },
        rightAngle([CS_VX, 0, 0], [-1, 0, 0], [0, 1, 0], 0.3),
        ...angleArc([0, 0, 0], 0, Math.atan2(CS_VY, CS_VX), 0.7),
        { kind: 'arrow', from: [0, 0, 0], to: [CS_U, 0, 0], color: COLOR_BLUE, thickness: 0.07, headSize: 0.4 },
        { kind: 'arrow', from: [0, 0, 0], to: [CS_VX, CS_VY, 0], color: COLOR_AMBER, thickness: 0.07, headSize: 0.4 },
        { kind: 'label', position: [CS_U - 0.45, -0.6, 0], text: 'u', scale: 0.45, color: COLOR_BLUE },
        { kind: 'label', position: [CS_VX - 0.65, CS_VY + 0.35, 0], text: 'v', scale: 0.45, color: COLOR_AMBER },
        { kind: 'label', position: [0.95, 0.3, 0], text: 'θ', scale: 0.34, color: COLOR_INK },
        { kind: 'label', position: [CS_VX / 2, -0.7, 0], text: '|v| cos θ', scale: 0.3, color: COLOR_GREEN },
    ],
};

// ─── Archimedes' hat-box, and the power rule as a growing cube ──────────

// #7  S = 4πr²   — the sphere and its cylinder, band for band
//
// Archimedes' hat-box theorem: project the sphere outward onto the cylinder
// that just contains it, horizontally. Between any two parallel planes the two
// surfaces have the SAME area — the sphere's band is narrower in circumference
// by exactly the factor it is longer in slant. So the whole sphere matches the
// whole cylinder's side: 2πr · 2r = 4πr².
//
// He asked for this figure on his tomb, which is the strongest recommendation a
// proof has ever had.
const HB_R = 2.0, HB_SEG = 20, HB_BANDS = 16;
const HB_LO = 10, HB_HI = 14;          // the matched band, in band indices
const hbY = (i: number) => -HB_R + (2 * HB_R * i) / HB_BANDS;
const PROOF_SPHERE_SURFACE: VisualProof = {
    title: 'Surface Area of a Sphere',
    caption: 'each band matches the cylinder around it, so S = 2πr · 2r',
    family: 'C',
    spatial: true,
    primitives: [
        // The sphere, in bands; the matched ones are picked out.
        ...Array.from({ length: HB_BANDS }, (_, i) => {
            const y0 = hbY(i), y1 = hbY(i + 1);
            const rad = (y: number) => Math.sqrt(Math.max(0, HB_R * HB_R - y * y));
            const inBand = i >= HB_LO && i < HB_HI;
            return revolve([[rad(y0), y0], [rad(y1), y1]], HB_SEG, 'out',
                           opaque(inBand ? COLOR_AMBER_FILL : COLOR_BLUE_FILL),
                           [0, 0, 0], inBand ? 'slice:sphere' : 'sphere')
                .map(f => ({ ...f, points: f.points.map((q): Vec3 => [q[0] - 3.2, q[1], q[2]]),
                             outwardFrom: [-3.2, 0, 0] as Vec3 }));
        }).flat(),

        // The cylinder that contains it, split at the same two heights.
        ...[[-HB_R, hbY(HB_LO), false], [hbY(HB_LO), hbY(HB_HI), true],
            [hbY(HB_HI), HB_R, false]].flatMap(([y0, y1, hit]) =>
            revolve([[HB_R, y0 as number], [HB_R, y1 as number]], HB_SEG, 'out',
                    opaque(hit ? COLOR_AMBER_FILL : COLOR_GREEN_FILL),
                    [0, 0, 0], hit ? 'slice:cylinder' : 'cylinder')
                .map(f => ({ ...f, points: f.points.map((q): Vec3 => [q[0] + 3.2, q[1], q[2]]),
                             outwardFrom: [3.2, ((y0 as number) + (y1 as number)) / 2, 0] as Vec3 }))),

        { kind: 'arrow', from: [-1.0, hbY(HB_LO + 2), 0], to: [1.0, hbY(HB_LO + 2), 0],
          color: COLOR_AMBER, thickness: 0.05, headSize: 0.32 },
        { kind: 'label', position: [0, hbY(HB_LO + 2) + 0.75, 0], text: 'same area',
          scale: 0.34, color: COLOR_AMBER },
        { kind: 'label', position: [-3.2, -HB_R - 1.0, 0], text: '4πr²', scale: 0.42, color: COLOR_BLUE },
        { kind: 'label', position: [3.2, -HB_R - 1.0, 0], text: '2πr · 2r', scale: 0.38, color: COLOR_GREEN },
    ],
};

// #41  d(xⁿ)/dx = n·xⁿ⁻¹   — a cube grown by dx, shown at n = 3
//
// Push a cube of side x out to side x+dx. What is added is three slabs of area
// x² and thickness dx — one per face — plus three thin bars and a speck in the
// corner. The slabs give 3x²·dx; everything else carries a dx² or dx³ and is
// negligible beside it. Hence the rate of growth is 3x², and n faces of an
// n-cube give n·xⁿ⁻¹.
const PR_X = 2.4, PR_DX = 0.7;
// The added pieces sit on the +x, +y and +z faces — which is exactly where the
// viewer is — so drawn in place they seal the x³ core out of sight entirely.
// Each is pulled out along the axis it was added on. PR_PIECES holds the TRUE
// positions; the gap is applied only when drawing, so the tiling test still
// sees the real decomposition.
const PR_GAP = 0.55;
export const PR_PIECES: { min: Vec3, size: Vec3, kind: 'core' | 'slab' | 'small' }[] = [
    { min: [0, 0, 0], size: [PR_X, PR_X, PR_X], kind: 'core' },
    { min: [PR_X, 0, 0], size: [PR_DX, PR_X, PR_X], kind: 'slab' },
    { min: [0, PR_X, 0], size: [PR_X, PR_DX, PR_X], kind: 'slab' },
    { min: [0, 0, PR_X], size: [PR_X, PR_X, PR_DX], kind: 'slab' },
    { min: [PR_X, PR_X, 0], size: [PR_DX, PR_DX, PR_X], kind: 'small' },
    { min: [PR_X, 0, PR_X], size: [PR_DX, PR_X, PR_DX], kind: 'small' },
    { min: [0, PR_X, PR_X], size: [PR_X, PR_DX, PR_DX], kind: 'small' },
    { min: [PR_X, PR_X, PR_X], size: [PR_DX, PR_DX, PR_DX], kind: 'small' },
];
/** Where a piece is DRAWN: pulled out along whichever axes it was grown on. */
const prDrawn = (pc: { min: Vec3 }): Vec3 => [
    pc.min[0] >= PR_X ? pc.min[0] + PR_GAP : pc.min[0],
    pc.min[1] >= PR_X ? pc.min[1] + PR_GAP : pc.min[1],
    pc.min[2] >= PR_X ? pc.min[2] + PR_GAP : pc.min[2],
];
const PROOF_POWER_RULE: VisualProof = {
    title: 'Power Rule',
    caption: 'growing the cube adds three x² slabs; the rest carries a dx²',
    family: 'A',
    spatial: true,
    primitives: [
        ...PR_PIECES.flatMap((pc, i) => boxFaces(prDrawn(pc), pc.size,
            opaque(pc.kind === 'core' ? COLOR_BLUE_FILL
                 : pc.kind === 'slab' ? COLOR_AMBER_FILL : COLOR_RED_FILL),
            pc.kind === 'core' ? COLOR_BLUE : pc.kind === 'slab' ? COLOR_AMBER : COLOR_RED,
            0.04).map(f => ({ ...f, piece: `pc:${i}` }))),
        { kind: 'label', position: [PR_X / 2, -1.0, PR_X / 2], text: 'x³', scale: 0.45, color: COLOR_BLUE },
        { kind: 'label', position: [PR_X + PR_DX + 1.9, PR_X / 2, PR_X / 2], text: '3 × x²dx',
          scale: 0.36, color: COLOR_AMBER },
        { kind: 'label', position: [PR_X / 2, PR_X + PR_DX + 1.2, PR_X + PR_DX + 1.2],
          text: 'rest ~ dx²', scale: 0.3, color: COLOR_RED },
    ],
};

// ─── Topology, accumulation, inverse and the mean value ─────────────────

// #18  V − E + F = 2   — delete edges until only a tree is left
//
// Flatten the polyhedron into the plane (a Schlegel diagram); the outer region
// counts as a face, so nothing is lost. Now delete any edge lying on a cycle:
// it separates two distinct faces, which merge, so E and F each drop by one and
// V − E + F does not move. Keep going and the cycles run out — what remains is
// a spanning tree, with F = 1 and E = V − 1, giving V − (V−1) + 1 = 2.
//
// Three frames of a cube's diagram: 8−12+6, then 8−10+4, then 8−7+1.
const EP_O: Vec3[] = [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]];
const EP_I: Vec3[] = [[1.2, 1.2, 0], [2.8, 1.2, 0], [2.8, 2.8, 0], [1.2, 2.8, 0]];
/** Edges as index pairs; 0-3 are the outer square, 4-7 the inner. */
const EP_FRAMES: number[][][] = [
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]],
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [1, 5], [3, 7]],
    [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [3, 7]],
];
const EP_F = [6, 4, 1];
const epNode = (i: number, dx: number): Vec3 => {
    const p = i < 4 ? EP_O[i] : EP_I[i - 4];
    return [p[0] + dx, p[1], 0];
};
const PROOF_EULER_POLYHEDRON: VisualProof = {
    title: "Euler's Polyhedron Formula",
    caption: 'deleting an edge on a cycle drops E and F together, so the sum holds',
    family: 'J',
    claim: { v: 8, e1: 12, f1: 6, e2: 10, f2: 4, e3: 7, f3: 1 },
    primitives: [
        ...EP_FRAMES.flatMap((edges, k) => {
            const dx = k * 6.2;
            return [
                ...edges.map((e): ProofPrimitive => ({
                    kind: 'line', p1: epNode(e[0], dx), p2: epNode(e[1], dx),
                    color: [COLOR_BLUE, COLOR_AMBER, COLOR_GREEN][k], thickness: 0.06,
                })),
                ...Array.from({ length: 8 }, (_, i): ProofPrimitive => ({
                    kind: 'circle', center: epNode(i, dx), radius: 0.13, segments: 8,
                    fill: COLOR_INK, stroke: COLOR_INK, strokeThickness: 0.02,
                })),
                { kind: 'label', position: [dx + 2, -0.85, 0] as Vec3,
                  text: `8 − ${edges.length} + ${EP_F[k]} = 2`, scale: 0.32,
                  color: COLOR_INK } as ProofPrimitive,
            ] as ProofPrimitive[];
        }),
        { kind: 'label', position: [3.1, 4.9, 0], text: 'delete a cycle edge →', scale: 0.28, color: COLOR_INK },
        { kind: 'label', position: [9.3, 4.9, 0], text: '→ down to a tree', scale: 0.28, color: COLOR_INK },
    ],
};

// #45  ∫ₐᵇ f = F(b) − F(a)   — the area's rate of growth is the height
//
// Let A(x) be the area accumulated from a to x. Push x along by dx and the area
// gains a strip of height f(x) and width dx, so A′(x) = f(x). Any F with
// F′ = f therefore differs from A by a constant, and the constant cancels in
// F(b) − F(a).
const FT_REGION: Vec3[] = [[1.00000, 0.00000, 0], [1.00000, 1.25000, 0], [1.07500, 1.27972, 0], [1.15000, 1.30888, 0], [1.22500, 1.33747, 0], [1.30000, 1.36550, 0], [1.37500, 1.39297, 0], [1.45000, 1.41987, 0], [1.52500, 1.44622, 0], [1.60000, 1.47200, 0], [1.67500, 1.49722, 0], [1.75000, 1.52188, 0], [1.82500, 1.54597, 0], [1.90000, 1.56950, 0], [1.97500, 1.59247, 0], [2.05000, 1.61488, 0], [2.12500, 1.63672, 0], [2.20000, 1.65800, 0], [2.27500, 1.67872, 0], [2.35000, 1.69888, 0], [2.42500, 1.71847, 0], [2.50000, 1.73750, 0], [2.57500, 1.75597, 0], [2.65000, 1.77387, 0], [2.72500, 1.79122, 0], [2.80000, 1.80800, 0], [2.87500, 1.82422, 0], [2.95000, 1.83988, 0], [3.02500, 1.85497, 0], [3.10000, 1.86950, 0], [3.17500, 1.88347, 0], [3.25000, 1.89687, 0], [3.32500, 1.90972, 0], [3.40000, 1.92200, 0], [3.47500, 1.93372, 0], [3.55000, 1.94488, 0], [3.62500, 1.95547, 0], [3.70000, 1.96550, 0], [3.77500, 1.97497, 0], [3.85000, 1.98388, 0], [3.92500, 1.99222, 0], [4.00000, 2.00000, 0], [4.00000, 0.00000, 0]];
const FT_STRIP: Vec3[] = [[4.00000, 0.00000, 0], [4.00000, 2.00000, 0], [4.01500, 2.00149, 0], [4.03000, 2.00296, 0], [4.04500, 2.00440, 0], [4.06000, 2.00582, 0], [4.07500, 2.00722, 0], [4.09000, 2.00859, 0], [4.10500, 2.00995, 0], [4.12000, 2.01128, 0], [4.13500, 2.01259, 0], [4.15000, 2.01387, 0], [4.16500, 2.01514, 0], [4.18000, 2.01638, 0], [4.19500, 2.01760, 0], [4.21000, 2.01879, 0], [4.22500, 2.01997, 0], [4.24000, 2.02112, 0], [4.25500, 2.02225, 0], [4.27000, 2.02335, 0], [4.28500, 2.02444, 0], [4.30000, 2.02550, 0], [4.31500, 2.02654, 0], [4.33000, 2.02755, 0], [4.34500, 2.02855, 0], [4.36000, 2.02952, 0], [4.37500, 2.03047, 0], [4.39000, 2.03140, 0], [4.40500, 2.03230, 0], [4.42000, 2.03318, 0], [4.43500, 2.03404, 0], [4.45000, 2.03487, 0], [4.46500, 2.03569, 0], [4.48000, 2.03648, 0], [4.49500, 2.03725, 0], [4.51000, 2.03799, 0], [4.52500, 2.03872, 0], [4.54000, 2.03942, 0], [4.55500, 2.04010, 0], [4.57000, 2.04075, 0], [4.58500, 2.04139, 0], [4.60000, 2.04200, 0], [4.60000, 0.00000, 0]];
const PROOF_FTC: VisualProof = {
    title: 'Fundamental Theorem of Calculus',
    caption: 'nudging x adds a strip of height f(x), so the area grows at rate f',
    family: 'A',
    claim: { total: 6.31426155, region: 5.09986275, strip: 1.21439880 },
    primitives: [
        { kind: 'polygon', points: FT_REGION, fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.045 },
        { kind: 'polygon', points: FT_STRIP, fill: COLOR_AMBER_FILL, stroke: COLOR_AMBER, strokeThickness: 0.045 },
        { kind: 'line', p1: [0.4, 0, 0], p2: [5.4, 0, 0], color: COLOR_INK, thickness: 0.035 },
        { kind: 'line', p1: [4.0, 0, 0], p2: [4.0, 2.00000, 0], color: COLOR_INK, thickness: 0.035 },
        { kind: 'label', position: [2.4, 0.75, 0], text: 'A(x)', scale: 0.4, color: COLOR_BLUE },
        { kind: 'label', position: [4.3, -0.55, 0], text: 'dx', scale: 0.28, color: COLOR_AMBER },
        { kind: 'label', position: [5.75, 1.0000, 0], text: 'f(x)·dx', scale: 0.3, color: COLOR_AMBER },
        { kind: 'label', position: [1.0, -0.55, 0], text: 'a', scale: 0.32, color: COLOR_INK },
        { kind: 'label', position: [4.0, -0.55, 0], text: 'x', scale: 0.32, color: COLOR_INK },
    ],
};

// #52  d(ln x)/dx = 1/x   — reflect the exponential
//
// ln is exp read backwards, so its graph is exp's mirrored in y = x. Mirroring
// swaps run and rise, which inverts every slope. At (t, eᵗ) the exponential
// climbs at eᵗ; at the mirror point (eᵗ, t) the logarithm therefore climbs at
// 1/eᵗ — which, since x = eᵗ there, is 1/x.
const LN_T = 0.7, LN_E = 2.013753;
const lnCurve = (fn: (x: number) => number, x0: number, x1: number, n: number, color: Color): ProofPrimitive[] =>
    Array.from({ length: n }, (_, i) => ({
        kind: 'line' as const,
        p1: [x0 + (x1 - x0) * (i / n), fn(x0 + (x1 - x0) * (i / n)), 0] as Vec3,
        p2: [x0 + (x1 - x0) * ((i + 1) / n), fn(x0 + (x1 - x0) * ((i + 1) / n)), 0] as Vec3,
        color, thickness: 0.05,
    }));
const PROOF_DERIV_LN: VisualProof = {
    title: 'Derivative of ln',
    caption: 'mirroring in y = x swaps rise and run, so it inverts the slope',
    family: 'F',
    primitives: [
        { kind: 'line', p1: [-0.4, -0.4, 0], p2: [4.2, 4.2, 0], color: COLOR_INK, thickness: 0.035 },
        ...lnCurve(Math.exp, -0.6, 1.45, 26, COLOR_GREEN),
        ...lnCurve(Math.log, 0.32, 4.2, 26, COLOR_AMBER),
        { kind: 'line', p1: [LN_T - 0.7, LN_E - 0.7 * LN_E, 0], p2: [LN_T + 0.7, LN_E + 0.7 * LN_E, 0],
          color: COLOR_BLUE, thickness: 0.05 },
        { kind: 'line', p1: [LN_E - 1.1, LN_T - 1.1 / LN_E, 0], p2: [LN_E + 1.1, LN_T + 1.1 / LN_E, 0],
          color: COLOR_RED, thickness: 0.05 },
        { kind: 'line', p1: [LN_T, LN_E, 0], p2: [LN_E, LN_T, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'label', position: [LN_T - 0.75, LN_E + 0.5, 0], text: 'slope exp(t)', scale: 0.3, color: COLOR_BLUE },
        { kind: 'label', position: [LN_E + 0.95, LN_T - 0.65, 0], text: 'slope 1/exp(t)', scale: 0.3, color: COLOR_RED },
        { kind: 'label', position: [0.55, 2.85, 0], text: 'exp(x)', scale: 0.4, color: COLOR_GREEN },
        { kind: 'label', position: [3.55, 0.95, 0], text: 'ln x', scale: 0.4, color: COLOR_AMBER },
        { kind: 'label', position: [3.55, 3.35, 0], text: 'y = x', scale: 0.3, color: COLOR_INK },
    ],
};

// #54  f′(c) = (f(b)−f(a))/(b−a)   — slide the secant until it touches
//
// Push the secant line parallel to itself until it last touches the curve. At
// that point the curve is not crossing it, so the tangent there has the secant's
// slope. (Rolle's theorem is what makes "last touches" legitimate.)
const MV_A = 1.0, MV_B = 6.0, MV_C = 3.500000, MV_M = 0.340000;
const PROOF_MVT: VisualProof = {
    title: 'Mean Value Theorem',
    caption: 'slide the secant until it just touches - there the tangent matches',
    family: 'F',
    primitives: [
        ...lnCurve(x => -0.18 * x * x + 1.6 * x, 0.4, 6.6, 34, COLOR_BLUE),
        { kind: 'line', p1: [MV_A, 1.42000, 0], p2: [MV_B, 3.12000, 0],
          color: COLOR_GREEN, thickness: 0.055 },
        { kind: 'line', p1: [MV_C - 2.2, 3.39500 - 2.2 * MV_M, 0],
          p2: [MV_C + 2.2, 3.39500 + 2.2 * MV_M, 0], color: COLOR_RED, thickness: 0.055 },
        { kind: 'line', p1: [MV_C, 0, 0], p2: [MV_C, 3.39500, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'line', p1: [0.4, 0, 0], p2: [6.8, 0, 0], color: COLOR_INK, thickness: 0.03 },
        { kind: 'label', position: [MV_A, -0.5, 0], text: 'a', scale: 0.34, color: COLOR_INK },
        { kind: 'label', position: [MV_B, -0.5, 0], text: 'b', scale: 0.34, color: COLOR_INK },
        { kind: 'label', position: [MV_C, -0.5, 0], text: 'c', scale: 0.34, color: COLOR_INK },
        { kind: 'label', position: [1.55, 2.85, 0], text: 'secant', scale: 0.3, color: COLOR_GREEN },
        { kind: 'label', position: [5.2, 4.35, 0], text: 'tangent at c', scale: 0.3, color: COLOR_RED },
    ],
};

// ─── The last three ─────────────────────────────────────────────────────

// #55  ∫e^{−x²} dx = √π   — square it, and the plane becomes polar
//
// The integral resists antidifferentiation, so square it instead: I² is the
// volume under e^{−(x²+y²)}, a bell that is the same in every direction. Cut
// that volume into cylindrical shells — radius r, thickness dr, height e^{−r²} —
// and each contributes 2πr·e^{−r²}·dr. That one HAS an antiderivative,
// −πe^{−r²}, which runs from π to 0. So I² = π and I = √π.
const GA_R = 2.2, GA_H = 3.0, GA_SEG = 24, GA_BANDS = 14;
const GA_SHELL = 0.95, GA_DR = 0.22;
const gaH = (r: number) => GA_H * Math.exp(-r * r);
const PROOF_GAUSSIAN: VisualProof = {
    title: 'Gaussian Integral',
    caption: 'shells of the squared integral: 2πr·exp(−r²)·dr integrates to π',
    family: 'D',
    spatial: true,
    claim: { shellIntegral: Math.PI },
    primitives: [
        // The bell as a WIREFRAME — parallels and meridians. A filled surface
        // seals the shell inside it, and the shell is the thing the argument is
        // about; lines let you see in, and they cannot occlude.
        ...Array.from({ length: 5 }, (_, k) => {
            const r = (GA_R * (k + 1)) / 5, y = gaH(r);
            return Array.from({ length: GA_SEG }, (_, i): ProofPrimitive => {
                const t0 = (i / GA_SEG) * Math.PI * 2, t1 = ((i + 1) / GA_SEG) * Math.PI * 2;
                return { kind: 'line',
                         p1: [Math.cos(t0) * r, y, Math.sin(t0) * r],
                         p2: [Math.cos(t1) * r, y, Math.sin(t1) * r],
                         color: COLOR_BLUE, thickness: 0.035 };
            });
        }).flat(),
        ...Array.from({ length: 8 }, (_, m) => {
            const a = (m / 8) * Math.PI * 2;
            return Array.from({ length: 10 }, (_, i): ProofPrimitive => {
                const r0 = (GA_R * i) / 10, r1 = (GA_R * (i + 1)) / 10;
                return { kind: 'line',
                         p1: [Math.cos(a) * r0, gaH(r0), Math.sin(a) * r0],
                         p2: [Math.cos(a) * r1, gaH(r1), Math.sin(a) * r1],
                         color: COLOR_BLUE, thickness: 0.035 };
            });
        }).flat(),
        // One shell, stood up at radius r.
        ...revolve([[GA_SHELL, 0], [GA_SHELL, gaH(GA_SHELL)]], GA_SEG, 'out',
                   opaque(COLOR_AMBER_FILL), [0, gaH(GA_SHELL) / 2, 0], 'shell'),
        ...revolve([[GA_SHELL, 0], [GA_SHELL + GA_DR, 0]], GA_SEG, 'out',
                   opaque(COLOR_AMBER_FILL), [0, -1, 0], 'shell'),
        { kind: 'label', position: [GA_SHELL + 1.9, gaH(GA_SHELL) / 2, 0], text: '2πr · dr',
          scale: 0.32, color: COLOR_AMBER },
        { kind: 'label', position: [0, GA_H + 0.9, 0], text: 'exp(−r²)', scale: 0.38, color: COLOR_BLUE },
        ...dimension([0, 0, 0], [GA_SHELL, 0, 0], 'r', [0, -0.6, 0], 0.32),
    ],
};

// #65  (AB)ᵀ = BᵀAᵀ   — transposing reverses the chain
//
// A map ℝᵖ → ℝⁿ → ℝᵐ has its arrows chained tail to head, and the shapes only
// fit that way round. Transposing turns every arrow around: each box swaps its
// dimensions, so the chain only closes again if the order is reversed. The
// identity is that reversal, and the dimensions are what force it.
const TP_M = 2, TP_N = 3, TP_P = 4;
const tpBox = (x: number, y: number, w: number, h: number, label: string,
               color: number): ProofPrimitive[] => rectPieces([
    { x, y, w, h, label, color, labelScale: 0.34 },
]);
const PROOF_TRANSPOSE_PRODUCT: VisualProof = {
    title: 'Transpose of a Product',
    caption: 'transposing turns every arrow around, so the order must reverse',
    family: 'K',
    primitives: [
        ...tpBox(0, 2.2, 1.6, 1.2, 'B', 0),
        ...tpBox(3.4, 2.2, 1.6, 1.2, 'A', 1),
        { kind: 'arrow', from: [-1.5, 2.8, 0], to: [-0.25, 2.8, 0], color: COLOR_INK, thickness: 0.05, headSize: 0.3 },
        { kind: 'arrow', from: [1.85, 2.8, 0], to: [3.15, 2.8, 0], color: COLOR_INK, thickness: 0.05, headSize: 0.3 },
        { kind: 'arrow', from: [5.25, 2.8, 0], to: [6.5, 2.8, 0], color: COLOR_INK, thickness: 0.05, headSize: 0.3 },
        { kind: 'label', position: [-1.95, 2.8, 0], text: 'p', scale: 0.32, color: COLOR_INK },
        { kind: 'label', position: [2.5, 2.8, 0], text: 'n', scale: 0.32, color: COLOR_INK },
        { kind: 'label', position: [6.95, 2.8, 0], text: 'm', scale: 0.32, color: COLOR_INK },

        ...tpBox(0, 0, 1.6, 1.2, "B'", 0),
        ...tpBox(3.4, 0, 1.6, 1.2, "A'", 1),
        { kind: 'arrow', from: [-0.25, 0.6, 0], to: [-1.5, 0.6, 0], color: COLOR_RED, thickness: 0.05, headSize: 0.3 },
        { kind: 'arrow', from: [3.15, 0.6, 0], to: [1.85, 0.6, 0], color: COLOR_RED, thickness: 0.05, headSize: 0.3 },
        { kind: 'arrow', from: [6.5, 0.6, 0], to: [5.25, 0.6, 0], color: COLOR_RED, thickness: 0.05, headSize: 0.3 },
        { kind: 'label', position: [-1.95, 0.6, 0], text: 'p', scale: 0.32, color: COLOR_INK },
        { kind: 'label', position: [2.5, 0.6, 0], text: 'n', scale: 0.32, color: COLOR_INK },
        { kind: 'label', position: [6.95, 0.6, 0], text: 'm', scale: 0.32, color: COLOR_INK },
        { kind: 'label', position: [2.5, 4.7, 0], text: 'p, n, m are the dimensions', scale: 0.26, color: COLOR_INK },
        { kind: 'label', position: [2.5, 4.0, 0], text: 'AB reads right to left', scale: 0.3, color: COLOR_INK },
        { kind: 'label', position: [2.5, -0.85, 0], text: "(AB)' = B' A'", scale: 0.36, color: COLOR_RED },
        // The tick is small and it is the whole subject of the figure, so it
        // gets said in words rather than left to be noticed.
        { kind: 'label', position: [2.5, -1.6, 0], text: "' means transpose", scale: 0.28, color: COLOR_INK },
    ],
};

// #80  A = UΣVᵀ   — every matrix is a rotation, a stretch, and a rotation
//
// Follow the unit circle. Vᵀ turns it (a circle, so nothing visible changes but
// the marked point moves), Σ stretches the axes by σ₁ and σ₂ into an ellipse,
// and U turns that ellipse into place. Any matrix whatsoever factors this way —
// which is why the singular values are the axes of the image ellipse.
const SV_S1 = 1.9, SV_S2 = 0.85;
const SV_TV = -0.610865, SV_TU = 0.436332;
const svShape = (dx: number, fn: (t: number) => [number, number], color: Color): ProofPrimitive[] =>
    Array.from({ length: 48 }, (_, i) => {
        const a = fn((i / 48) * Math.PI * 2), b = fn(((i + 1) / 48) * Math.PI * 2);
        return {
            kind: 'line' as const,
            p1: [a[0] + dx, a[1], 0] as Vec3, p2: [b[0] + dx, b[1], 0] as Vec3,
            color, thickness: 0.055,
        };
    });
/** The marked point, so the rotations are visible on a circle. */
const svDot = (dx: number, fn: (t: number) => [number, number], color: Color): ProofPrimitive => {
    const p = fn(0.9);
    return { kind: 'circle', center: [p[0] + dx, p[1], 0], radius: 0.15, segments: 10,
             fill: color, stroke: color, strokeThickness: 0.02 };
};
const svCircle = (t: number): [number, number] => [Math.cos(t), Math.sin(t)];
const svRot = (t: number, a: number): [number, number] =>
    [Math.cos(t) * Math.cos(a) - Math.sin(t) * Math.sin(a),
     Math.cos(t) * Math.sin(a) + Math.sin(t) * Math.cos(a)];
const svScaled = (t: number): [number, number] => {
    const p = svRot(t, SV_TV); return [p[0] * SV_S1, p[1] * SV_S2];
};
const svFinal = (t: number): [number, number] => {
    const p = svScaled(t);
    return [p[0] * Math.cos(SV_TU) - p[1] * Math.sin(SV_TU),
            p[0] * Math.sin(SV_TU) + p[1] * Math.cos(SV_TU)];
};
const PROOF_SVD: VisualProof = {
    title: 'Singular Value Decomposition',
    caption: 'turn, stretch by σ1 and σ2, turn again - every matrix does this',
    family: 'K',
    primitives: [
        ...svShape(0, svCircle, COLOR_BLUE), svDot(0, svCircle, COLOR_RED),
        ...svShape(5, t => svRot(t, SV_TV), COLOR_BLUE), svDot(5, t => svRot(t, SV_TV), COLOR_RED),
        ...svShape(10, svScaled, COLOR_GREEN), svDot(10, svScaled, COLOR_RED),
        ...svShape(15, svFinal, COLOR_AMBER), svDot(15, svFinal, COLOR_RED),
        ...[2.6, 7.6, 12.6].map((x, i): ProofPrimitive => ({
            kind: 'arrow', from: [x, 0, 0], to: [x + 1.4, 0, 0],
            color: COLOR_INK, thickness: 0.05, headSize: 0.32,
        })),
        { kind: 'label', position: [3.3, 0.65, 0], text: "V'", scale: 0.36, color: COLOR_INK },
        { kind: 'label', position: [7.5, -2.6, 0], text: "' means transpose", scale: 0.26, color: COLOR_INK },
        { kind: 'label', position: [8.3, 0.65, 0], text: 'Σ', scale: 0.36, color: COLOR_INK },
        { kind: 'label', position: [13.3, 0.65, 0], text: 'U', scale: 0.36, color: COLOR_INK },
        { kind: 'label', position: [0, -1.75, 0], text: 'unit circle', scale: 0.28, color: COLOR_BLUE },
        { kind: 'label', position: [10, -1.75, 0], text: 'σ1, σ2', scale: 0.3, color: COLOR_GREEN },
        { kind: 'label', position: [15, -1.75, 0], text: 'the image', scale: 0.28, color: COLOR_AMBER },
    ],
};

// #61  (AB)ᵢⱼ = Σₖ aᵢₖ bₖⱼ   — count the two-step routes
//
// The grammar first recorded this as **none**, on the grounds that the formula
// IS the definition of the product. That was too quick. Read A and B as edge
// tables of a three-layer network — aᵢₖ edges from layer i to layer k, bₖⱼ from
// k to j — and the sum is a genuine theorem: (AB)ᵢⱼ counts the routes from i to
// j. Every route uses exactly one middle node, so the routes partition by k,
// and each part has aᵢₖ·bₖⱼ members. That is a bijection, it is falsifiable,
// and the test enumerates every route to check it.
//
// Drawn for i = 1, j = 2, with all three middle nodes live so the sum has three
// terms to add rather than one term and two zeroes.
const MM_A: number[][] = [[1, 1, 1], [0, 1, 1], [1, 0, 1]];
const MM_B: number[][] = [[0, 1, 1], [1, 1, 1], [1, 1, 0]];
const MM_I = 0, MM_J = 1;                  // 0-based: the row and column drawn
const MM_COL = [COLOR_BLUE, COLOR_GREEN, COLOR_AMBER];
const MM_FILL = [COLOR_BLUE_FILL, COLOR_GREEN_FILL, COLOR_AMBER_FILL];
const MM_Y = [2.6, 0, -2.6];
/** One node of the network. A circle, not a quad — the family-I invariant
 *  counts filled POLYGONS, so drawing nodes as circles keeps the cell count
 *  meaning "terms of the sum" rather than "things on screen". */
const mmNode = (x: number, y: number, text: string, lit: boolean): ProofPrimitive[] => [
    { kind: 'circle', center: [x, y, 0], radius: 0.42, segments: 20,
      fill: lit ? COLOR_BLUE_FILL : undefined, stroke: COLOR_INK, strokeThickness: 0.04 },
    { kind: 'label', position: [x, y, 0], text, scale: 0.28, color: COLOR_INK },
];
const PROOF_MATRIX_MULT: VisualProof = {
    title: 'Matrix Multiplication',
    caption: 'each middle node gives one route from i to j; the sum counts them all',
    family: 'I',
    claim: { cells: 3, paths: 3 },
    primitives: [
        { kind: 'label', position: [-5, 4.1, 0], text: 'i', scale: 0.34, color: COLOR_INK },
        { kind: 'label', position: [0, 4.1, 0], text: 'k', scale: 0.34, color: COLOR_INK },
        { kind: 'label', position: [5, 4.1, 0], text: 'j', scale: 0.34, color: COLOR_INK },

        // The six edges of the three routes, coloured by which middle node they
        // pass through — the colour IS the partition.
        ...[0, 1, 2].flatMap((k): ProofPrimitive[] => [
            { kind: 'line', p1: [-4.6, MM_Y[MM_I], 0], p2: [-0.42, MM_Y[k], 0],
              color: MM_COL[k], thickness: 0.055 },
            { kind: 'line', p1: [0.42, MM_Y[k], 0], p2: [4.6, MM_Y[MM_J], 0],
              color: MM_COL[k], thickness: 0.055 },
        ]),

        ...[0, 1, 2].flatMap(r => mmNode(-5, MM_Y[r], `${r + 1}`, r === MM_I)),
        ...[0, 1, 2].flatMap(k => mmNode(0, MM_Y[k], `${k + 1}`, true)),
        ...[0, 1, 2].flatMap(c => mmNode(5, MM_Y[c], `${c + 1}`, c === MM_J)),

        // One cell per middle node: the term it contributes.
        ...[0, 1, 2].flatMap((k): ProofPrimitive[] => [
            { kind: 'polygon',
              points: [[-5.2 + k * 2.9, -6.6, 0], [-2.6 + k * 2.9, -6.6, 0],
                       [-2.6 + k * 2.9, -5.0, 0], [-5.2 + k * 2.9, -5.0, 0]] as Vec3[],
              fill: MM_FILL[k], stroke: MM_COL[k], strokeThickness: 0.05 },
            { kind: 'label', position: [-3.9 + k * 2.9, -5.8, 0],
              text: `a1${k + 1} b${k + 1}2`, scale: 0.26, color: MM_COL[k] },
        ]),
        { kind: 'label', position: [6.2, -5.8, 0], text: '= (AB)12', scale: 0.32, color: COLOR_INK },
    ],
};

// #72  tr(AB) = tr(BA)   — nine products, added two ways
//
// Also recorded as **none** ("symbolic index shuffle"), and also too quick.
// tr(AB) = Σᵢ Σⱼ aᵢⱼ bⱼᵢ and tr(BA) = Σⱼ Σᵢ bⱼᵢ aᵢⱼ are sums over the SAME nine
// products — the grid below — taken by rows in one case and by columns in the
// other. Counting one finite set two ways is family I exactly, and it is the
// textbook proof, not a picture stuck onto one.
const TR_N = 3, TR_W = 2.3, TR_H = 1.5;
const TR_X = -(TR_N * TR_W) / 2, TR_TOP = (TR_N * TR_H) / 2;
const PROOF_TRACE_PRODUCT: VisualProof = {
    title: 'Trace of a Product',
    caption: 'the same nine products: add along rows, or add down columns',
    family: 'I',
    claim: { cells: 9 },
    primitives: [
        { kind: 'label', position: [0, TR_TOP + 1.0, 0], text: 'row i adds to (AB)ii',
          scale: 0.32, color: COLOR_BLUE },

        ...matrixGrid(TR_X, TR_TOP, TR_N, TR_N, TR_W, TR_H,
            Array.from({ length: TR_N * TR_N }, (_, n) => {
                const r = Math.floor(n / TR_N), c = n % TR_N;
                return { row: r, col: c, fill: COLOR_AMBER_FILL, stroke: COLOR_AMBER,
                         label: `a${r + 1}${c + 1} b${c + 1}${r + 1}`,
                         labelScale: 0.24, labelColor: COLOR_INK };
            })),

        // Row brackets, right of the grid.
        ...[0, 1, 2].flatMap((r): ProofPrimitive[] => [
            { kind: 'line', p1: [-TR_X + 0.25, TR_TOP - r * TR_H - 0.15, 0],
              p2: [-TR_X + 0.25, TR_TOP - (r + 1) * TR_H + 0.15, 0],
              color: COLOR_BLUE, thickness: 0.05 },
            { kind: 'label', position: [-TR_X + 1.75, TR_TOP - (r + 0.5) * TR_H, 0],
              text: `(AB)${r + 1}${r + 1}`, scale: 0.28, color: COLOR_BLUE },
        ]),

        // Column brackets, below it.
        ...[0, 1, 2].flatMap((c): ProofPrimitive[] => [
            { kind: 'line', p1: [TR_X + c * TR_W + 0.15, -TR_TOP - 0.25, 0],
              p2: [TR_X + (c + 1) * TR_W - 0.15, -TR_TOP - 0.25, 0],
              color: COLOR_RED, thickness: 0.05 },
            { kind: 'label', position: [TR_X + (c + 0.5) * TR_W, -TR_TOP - 0.85, 0],
              text: `(BA)${c + 1}${c + 1}`, scale: 0.28, color: COLOR_RED },
        ]),

        { kind: 'label', position: [0, -TR_TOP - 1.7, 0], text: 'column j adds to (BA)jj',
          scale: 0.32, color: COLOR_RED },
        { kind: 'label', position: [0, -TR_TOP - 2.6, 0], text: 'tr(AB) = tr(BA)',
          scale: 0.4, color: COLOR_INK },
    ],
};

// #68  det A = Σⱼ (−1)^(1+j) a₁ⱼ M₁ⱼ   — the six terms, split three ways
//
// The old verdict was "symbolic recursion". But the Leibniz formula gives det A
// as a sum over the n! ways of picking one entry from each row and column, and
// those terms PARTITION by which column row 1 uses. Each part is a₁ⱼ times the
// determinant of what is left when row 1 and column j are struck out — a minor.
// A partition of a finite set of terms is family I, and for n = 3 the test can
// enumerate all six and check the split exactly.
//
// Numeric rather than symbolic, so the reader can add it up themselves.
const CF_A: number[][] = [[2, 1, 3], [0, 4, 1], [5, 2, 1]];
const CF_W = 1.6, CF_H = 1.3, CF_GAP = 1.6;
const CF_SPAN = 3 * CF_W + CF_GAP;
/** The grid for expanding along column `j`: pivot lit, its row and column
 *  struck to the neutral wash, the surviving 2×2 minor in blue. */
const cfGrid = (j: number): ProofPrimitive[] => {
    const x0 = -1.5 * CF_SPAN + j * CF_SPAN + CF_GAP / 2;
    const cells: GridCell[] = [];
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const pivot = r === 0 && c === j;
            const struck = r === 0 || c === j;
            cells.push({
                row: r, col: c, label: `${CF_A[r][c]}`,
                fill: pivot ? COLOR_AMBER_FILL : struck ? undefined : COLOR_BLUE_FILL,
                stroke: pivot ? COLOR_AMBER : struck ? COLOR_INK : COLOR_BLUE,
                labelColor: pivot ? COLOR_AMBER : struck ? COLOR_INK : COLOR_BLUE,
                labelScale: 0.32,
            });
        }
    }
    const sign = j % 2 === 0 ? '+' : '−';
    const minor = CF_MINOR[j], term = CF_TERM[j];
    return [
        ...matrixGrid(x0, 1.95, 3, 3, CF_W, CF_H, cells),
        { kind: 'label', position: [x0 + 1.5 * CF_W, 2.55, 0],
          text: `${sign} a1${j + 1}`, scale: 0.34, color: COLOR_AMBER },
        { kind: 'label', position: [x0 + 1.5 * CF_W, -2.55, 0],
          text: `minor ${minor}`, scale: 0.3, color: COLOR_BLUE },
        { kind: 'label', position: [x0 + 1.5 * CF_W, -3.3, 0],
          text: `${sign} ${CF_A[0][j]} · ${minor} = ${term}`, scale: 0.3, color: COLOR_INK },
    ] as ProofPrimitive[];
};
/** The 2×2 minors and the signed terms, computed rather than typed — a hand-
 *  typed determinant that disagrees with the drawn entries is exactly the kind
 *  of error a picture cannot show. */
const CF_MINOR: number[] = [0, 1, 2].map(j => {
    const cols = [0, 1, 2].filter(c => c !== j);
    return CF_A[1][cols[0]] * CF_A[2][cols[1]] - CF_A[1][cols[1]] * CF_A[2][cols[0]];
});
const CF_TERM: number[] = [0, 1, 2].map(j => (j % 2 === 0 ? 1 : -1) * CF_A[0][j] * CF_MINOR[j]);
const CF_DET = CF_TERM[0] + CF_TERM[1] + CF_TERM[2];
const PROOF_COFACTOR: VisualProof = {
    title: 'Cofactor Expansion',
    caption: 'the six permutation terms split by where row 1 lands',
    family: 'I',
    claim: { cells: 27, det: CF_DET },
    primitives: [
        ...cfGrid(0), ...cfGrid(1), ...cfGrid(2),
        { kind: 'label', position: [0, -4.4, 0],
          text: `det A = ${CF_TERM[0]} + ${CF_TERM[1]} ${CF_TERM[2] < 0 ? '−' : '+'} ` +
                `${Math.abs(CF_TERM[2])} = ${CF_DET}`,
          scale: 0.36, color: COLOR_INK },
    ],
};

// #63  A A⁻¹ = A⁻¹ A = I   — the same undoing, from either side
//
// Recorded as **none** ("definition"), but the definition only asks for a
// matrix that undoes A on ONE side. That the same matrix also undoes it on the
// other is the theorem, and it is exactly what two rows of this figure show:
// square → A → parallelogram → A⁻¹ → square on top, and the two maps swapped
// underneath, ending at the same square. The marked corner makes the return
// visible; a shape alone would only show that the areas came back.
const INV_A: [number, number, number, number] = [2, 1, 1, 1.5];
const INV_AI: [number, number, number, number] = [0.75, -0.5, -0.5, 1];
const INV_ID: [number, number, number, number] = [1, 0, 0, 1];
const INV_S = 1.15;
const INV_X = [-7, 0, 7];
/** One stage, centred on its own centroid so the row of shapes sits on a line
 *  however lopsided the parallelogram is. The red dot is the image of the
 *  corner (1,1) — always vertex 2 of `unitSquareImage`. */
const invStage = (m: [number, number, number, number], cx: number, cy: number,
                  fill: Color, stroke: Color, text: string): ProofPrimitive[] => {
    const raw = unitSquareImage(m, INV_S, 0, 0);
    const gx = raw.reduce((s, p) => s + p[0], 0) / 4;
    const gy = raw.reduce((s, p) => s + p[1], 0) / 4;
    const pts = raw.map(p => [p[0] - gx + cx, p[1] - gy + cy, 0] as Vec3);
    return [
        { kind: 'polygon', points: pts, fill, stroke, strokeThickness: 0.06 },
        { kind: 'circle', center: pts[2], radius: 0.17, segments: 12,
          fill: COLOR_RED, stroke: COLOR_RED, strokeThickness: 0.02 },
        { kind: 'label', position: [cx, cy - 2.5, 0], text, scale: 0.3, color: stroke },
    ];
};
const invArrow = (i: number, cy: number, text: string): ProofPrimitive[] => {
    const x0 = INV_X[i] + 2.1, x1 = INV_X[i + 1] - 2.1;
    return [
        { kind: 'arrow', from: [x0, cy, 0], to: [x1, cy, 0],
          color: COLOR_INK, thickness: 0.05, headSize: 0.3 },
        { kind: 'label', position: [(x0 + x1) / 2, cy + 0.75, 0], text, scale: 0.34,
          color: COLOR_INK },
    ];
};
const PROOF_MATRIX_INVERSE: VisualProof = {
    title: 'Matrix Inverse',
    caption: 'either order returns the square, and the marked corner with it',
    family: 'K',
    claim: { detA: 2, detAinv: 0.5 },
    primitives: [
        ...invStage(INV_ID, INV_X[0], 3.6, COLOR_BLUE_FILL, COLOR_BLUE, 'unit square'),
        ...invStage(INV_A, INV_X[1], 3.6, COLOR_AMBER_FILL, COLOR_AMBER, 'area = det A = 2'),
        ...invStage(INV_ID, INV_X[2], 3.6, COLOR_BLUE_FILL, COLOR_BLUE, 'back again'),
        ...invArrow(0, 3.6, 'A'), ...invArrow(1, 3.6, 'inv(A)'),

        ...invStage(INV_ID, INV_X[0], -3.6, COLOR_BLUE_FILL, COLOR_BLUE, 'unit square'),
        ...invStage(INV_AI, INV_X[1], -3.6, COLOR_GREEN_FILL, COLOR_GREEN, 'area = 1/det A = 0.5'),
        ...invStage(INV_ID, INV_X[2], -3.6, COLOR_BLUE_FILL, COLOR_BLUE, 'back again'),
        ...invArrow(0, -3.6, 'inv(A)'), ...invArrow(1, -3.6, 'A'),

        // Clear of the bottom row's stage captions, which sit at −6.1.
        { kind: 'label', position: [0, -7.4, 0], text: 'A inv(A) = inv(A) A = I',
          scale: 0.4, color: COLOR_INK },
    ],
};

// #70  det(A − λI) = 0   — where the square gets flattened
//
// Recorded as **none** ("symbolic"), but the statement being made is that λ is
// an eigenvalue exactly when A − λI is singular, and singular has a picture:
// the unit square's image collapses to a segment. Sweep λ and watch the area.
// It is positive, hits zero, goes negative, hits zero again — and the two
// zeroes are the eigenvalues. The parabola underneath is that same area plotted
// against λ, so the roots the algebra finds are the collapses the figure shows.
const CH_A: [number, number] = [2, 1];      // A = [[2,1],[1,2]], symmetric
const CH_LAMBDAS = [0, 1, 2, 3];
const CH_S = 1.0, CH_STEP = 5.6;
const chDet = (l: number) => (CH_A[0] - l) * (CH_A[0] - l) - CH_A[1] * CH_A[1];
const chStage = (i: number): ProofPrimitive[] => {
    const l = CH_LAMBDAS[i], cx = (i - 1.5) * CH_STEP;
    const m: [number, number, number, number] = [CH_A[0] - l, CH_A[1], CH_A[1], CH_A[0] - l];
    const raw = unitSquareImage(m, CH_S, 0, 0);
    const gx = raw.reduce((s, p) => s + p[0], 0) / 4;
    const gy = raw.reduce((s, p) => s + p[1], 0) / 4;
    const d = chDet(l), flat = Math.abs(d) < 1e-9;
    const col = flat ? COLOR_RED : d > 0 ? COLOR_AMBER : COLOR_GREEN;
    const fill = flat ? undefined : d > 0 ? COLOR_AMBER_FILL : COLOR_GREEN_FILL;
    return [
        // The unit square being fed in, faint, at the left of each stage.
        { kind: 'polygon',
          points: [[cx - 3.5, -0.5, 0], [cx - 2.5, -0.5, 0],
                   [cx - 2.5, 0.5, 0], [cx - 3.5, 0.5, 0]] as Vec3[],
          fill: COLOR_BLUE_FILL, stroke: COLOR_BLUE, strokeThickness: 0.04 },
        { kind: 'arrow', from: [cx - 2.3, 0, 0], to: [cx - 1.6, 0, 0],
          color: COLOR_INK, thickness: 0.04, headSize: 0.24 },
        { kind: 'polygon', points: raw.map(p => [p[0] - gx, p[1] - gy, 0] as Vec3)
                                      .map(p => [p[0] + cx, p[1], 0] as Vec3),
          fill, stroke: col, strokeThickness: 0.07 },
        { kind: 'label', position: [cx, -2.4, 0], text: `λ = ${l}`, scale: 0.32, color: COLOR_INK },
        { kind: 'label', position: [cx, -3.1, 0], text: `det = ${d}`, scale: 0.3, color: col },
    ];
};
// The parabola det(A − λI) = λ² − 4λ + 3, drawn under the sweep.
const CH_PX0 = -10.6, CH_PXS = 4.4, CH_PY0 = -7.0, CH_PYS = 0.6;
const chPlot = (l: number): Vec3 => [CH_PX0 + l * CH_PXS, CH_PY0 + chDet(l) * CH_PYS, 0];
const PROOF_CHAR_POLY: VisualProof = {
    title: 'Characteristic Polynomial',
    caption: 'the square flattens exactly where the determinant crosses zero',
    family: 'K',
    claim: { det0: chDet(0), det1: chDet(1), det2: chDet(2), det3: chDet(3),
             lambda1: 1, lambda2: 3 },
    primitives: [
        ...CH_LAMBDAS.flatMap((_, i) => chStage(i)),

        { kind: 'line', p1: [CH_PX0 - 0.6, CH_PY0, 0], p2: [CH_PX0 + 4.6 * CH_PXS, CH_PY0, 0],
          color: COLOR_INK, thickness: 0.035 },
        ...Array.from({ length: 48 }, (_, k): ProofPrimitive => ({
            kind: 'line',
            p1: chPlot(-0.3 + (k / 48) * 4.6), p2: chPlot(-0.3 + ((k + 1) / 48) * 4.6),
            color: COLOR_BLUE, thickness: 0.055,
        })),
        ...[1, 3].flatMap((l): ProofPrimitive[] => [
            { kind: 'circle', center: chPlot(l), radius: 0.18, segments: 12,
              fill: COLOR_RED, stroke: COLOR_RED, strokeThickness: 0.02 },
            { kind: 'label', position: [chPlot(l)[0], CH_PY0 - 0.85, 0], text: `λ = ${l}`,
              scale: 0.3, color: COLOR_RED },
        ]),
        { kind: 'label', position: [CH_PX0 + 4.9 * CH_PXS, CH_PY0 + 0.5, 0],
          text: 'det(A − λI)', scale: 0.3, color: COLOR_BLUE },
    ],
};

// #79  A = Q Λ Qᵀ   — a symmetric matrix stretches along one frame
//
// Recorded as **none**, which sat badly next to #80: the SVD is the harder
// statement and it has a figure. This is that figure with one thing changed,
// and the change is the content. The SVD needs two DIFFERENT rotations; a
// symmetric matrix needs only one, used forward and backward. So the drawn
// eigenframe leaves at 45°, is turned onto the axes, is stretched by 3 and 1,
// and is turned back to 45° — and the image ellipse's axes end up lying along
// the very frame it started from. That is what "eigenvector" means, drawn.
const EG_TH = Math.PI / 4, EG_L1 = 3, EG_L2 = 1, EG_R = 0.7, EG_STEP = 6.2;
const egRot = (p: [number, number], a: number): [number, number] =>
    [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
/** The four stages as maps, each the composition applied so far. */
const EG_STAGE: ((p: [number, number]) => [number, number])[] = [
    p => p,
    p => egRot(p, -EG_TH),
    p => { const q = egRot(p, -EG_TH); return [q[0] * EG_L1, q[1] * EG_L2]; },
    p => { const q = egRot(p, -EG_TH); return egRot([q[0] * EG_L1, q[1] * EG_L2], EG_TH); },
];
const EG_V1: [number, number] = [Math.cos(EG_TH) * EG_R, Math.sin(EG_TH) * EG_R];
const EG_V2: [number, number] = [-Math.sin(EG_TH) * EG_R, Math.cos(EG_TH) * EG_R];
const egStage = (i: number): ProofPrimitive[] => {
    const f = EG_STAGE[i], cx = (i - 1.5) * EG_STEP;
    const at = (t: number): Vec3 => {
        const p = f([Math.cos(t) * EG_R, Math.sin(t) * EG_R]);
        return [p[0] + cx, p[1], 0];
    };
    const ray = (v: [number, number], color: Color): ProofPrimitive => {
        const p = f(v);
        return { kind: 'line', p1: [cx, 0, 0], p2: [p[0] + cx, p[1], 0], color, thickness: 0.075 };
    };
    const dot = f([Math.cos(0.35) * EG_R, Math.sin(0.35) * EG_R]);
    return [
        ...Array.from({ length: 48 }, (_, k): ProofPrimitive => ({
            kind: 'line', p1: at((k / 48) * Math.PI * 2), p2: at(((k + 1) / 48) * Math.PI * 2),
            color: i === 0 || i === 1 ? COLOR_BLUE : COLOR_AMBER, thickness: 0.055,
        })),
        ray(EG_V1, COLOR_GREEN), ray(EG_V2, COLOR_RED),
        { kind: 'circle', center: [dot[0] + cx, dot[1], 0], radius: 0.14, segments: 10,
          fill: COLOR_INK, stroke: COLOR_INK, strokeThickness: 0.02 },
    ];
};
const PROOF_SPECTRAL: VisualProof = {
    title: 'Spectral Decomposition',
    caption: 'symmetric means one frame does both turns - and it is the eigenframe',
    family: 'K',
    claim: { lambda1: EG_L1, lambda2: EG_L2, theta: EG_TH },
    primitives: [
        ...[0, 1, 2, 3].flatMap(i => egStage(i)),
        ...[0, 1, 2].flatMap((i): ProofPrimitive[] => {
            const x0 = (i - 1.5) * EG_STEP + 2.4, x1 = (i - 0.5) * EG_STEP - 2.4;
            return [
                { kind: 'arrow', from: [x0, 0, 0], to: [x1, 0, 0],
                  color: COLOR_INK, thickness: 0.05, headSize: 0.3 },
                { kind: 'label', position: [(x0 + x1) / 2, 0.8, 0],
                  text: ["Q'", 'Λ', 'Q'][i], scale: 0.36, color: COLOR_INK },
            ];
        }),
        // Kept short: the stages are EG_STEP apart, so a caption wider than
        // that runs into its neighbour and the row reads as one long sentence.
        { kind: 'label', position: [0, -3.1, 0], text: "' means transpose",
          scale: 0.26, color: COLOR_INK },
        { kind: 'label', position: [-1.5 * EG_STEP, -2.2, 0], text: 'the eigenframe',
          scale: 0.28, color: COLOR_GREEN },
        { kind: 'label', position: [-0.5 * EG_STEP, -2.2, 0], text: 'onto the axes',
          scale: 0.28, color: COLOR_INK },
        { kind: 'label', position: [0.5 * EG_STEP, -2.2, 0], text: 'stretch 3 and 1',
          scale: 0.28, color: COLOR_AMBER },
        { kind: 'label', position: [1.5 * EG_STEP, -2.2, 0], text: 'axes on the frame',
          scale: 0.28, color: COLOR_AMBER },
    ],
};

// #42  (f∘g)'(x) = f'(g(x))·g'(x)   — two amplifiers in series
//
// Recorded as **none** for want of a "faithful planar witness", which assumed
// the figure had to be a graph. It does not. Draw the three variables as three
// parallel rulers and the derivative is a gearing ratio: a step of dx on the
// x-ruler drives a step of g'·dx on the u-ruler, which drives f'·(g'·dx) on the
// y-ruler. The linking lines carry the argument — the run of the second stage
// IS the rise of the first — and the total amplification is read straight off.
const CR_GP = 2, CR_FP = 3, CR_DX = 1.2, CR_X0 = -5.5;
const CR_DU = CR_GP * CR_DX, CR_DY = CR_FP * CR_DU;
const crRuler = (y: number, name: string): ProofPrimitive[] => [
    { kind: 'line', p1: [CR_X0 - 1.2, y, 0], p2: [CR_X0 + 9.4, y, 0],
      color: COLOR_INK, thickness: 0.04 },
    { kind: 'label', position: [CR_X0 - 1.9, y, 0], text: name, scale: 0.36, color: COLOR_INK },
];
const PROOF_CHAIN_RULE: VisualProof = {
    title: 'Chain Rule',
    caption: 'two amplifiers in series: the rise of one is the run of the next',
    family: 'F',
    claim: { gp: CR_GP, fp: CR_FP, chain: CR_GP * CR_FP },
    primitives: [
        ...crRuler(3.2, 'x'), ...crRuler(0, 'u'), ...crRuler(-3.2, 'y'),

        // Linking lines: the left ends stay together, the right ends fan out.
        { kind: 'line', p1: [CR_X0, 3.2, 0], p2: [CR_X0, -3.2, 0],
          color: COLOR_INK, thickness: 0.035 },
        { kind: 'line', p1: [CR_X0 + CR_DX, 3.2, 0], p2: [CR_X0 + CR_DU, 0, 0],
          color: COLOR_BLUE, thickness: 0.045 },
        { kind: 'line', p1: [CR_X0 + CR_DU, 0, 0], p2: [CR_X0 + CR_DY, -3.2, 0],
          color: COLOR_GREEN, thickness: 0.045 },

        // The three steps. Tagged so the test can measure what is drawn rather
        // than trust the labels — a mislabelled ruler is invisible otherwise.
        { kind: 'line', p1: [CR_X0, 3.2, 0], p2: [CR_X0 + CR_DX, 3.2, 0],
          color: COLOR_RED, thickness: 0.11, piece: 'dx' },
        { kind: 'line', p1: [CR_X0, 0, 0], p2: [CR_X0 + CR_DU, 0, 0],
          color: COLOR_RED, thickness: 0.11, piece: 'du' },
        { kind: 'line', p1: [CR_X0, -3.2, 0], p2: [CR_X0 + CR_DY, -3.2, 0],
          color: COLOR_RED, thickness: 0.11, piece: 'dy' },

        { kind: 'label', position: [CR_X0 + CR_DX / 2, 3.75, 0], text: 'dx',
          scale: 0.32, color: COLOR_RED },
        { kind: 'label', position: [CR_X0 + CR_DU / 2, 0.55, 0], text: 'du = 2 dx',
          scale: 0.32, color: COLOR_RED },
        { kind: 'label', position: [CR_X0 + CR_DY / 2, -2.65, 0], text: 'dy = 3 du',
          scale: 0.32, color: COLOR_RED },
        { kind: 'label', position: [CR_X0 + 6.6, 1.7, 0], text: "g' = 2",
          scale: 0.34, color: COLOR_BLUE },
        { kind: 'label', position: [CR_X0 + 8.4, -1.5, 0], text: "f' = 3",
          scale: 0.34, color: COLOR_GREEN },
        { kind: 'label', position: [CR_X0 + 3.6, -4.4, 0], text: 'dy/dx = 3 · 2 = 6',
          scale: 0.4, color: COLOR_INK },
    ],
};

// #53  lim f/g = lim f'/g'   — the ratio of two vanishing heights
//
// Recorded as **none** ("symbolic"). It is not: both curves pass through the
// same zero, and near that zero each one is its own tangent line. So the ratio
// of the two heights at a + h is the ratio of two straight lines through one
// point — which is the ratio of their slopes, whatever h is. Drawn honestly as
// a limit: at h = 1.4 the ratio is 3.15 and the curves have left their
// tangents; at h = 0.4 it is 2.28; the value it is heading for is 2 = f'/g'.
const LH_F = (x: number) => 2 * x + 0.35 * x * x;
const LH_G = (x: number) => x - 0.15 * x * x;
const LH_FP = 2, LH_GP = 1;
const LH_X0 = -7.0, LH_Y0 = -2.5, LH_XS = 4.5, LH_YS = 0.8, LH_XMAX = 1.8;
const LH_H = [1.4, 0.4];
const lhP = (x: number, y: number): Vec3 => [LH_X0 + x * LH_XS, LH_Y0 + y * LH_YS, 0];
const lhCurve = (fn: (x: number) => number, color: Color, thickness: number): ProofPrimitive[] =>
    Array.from({ length: 36 }, (_, k): ProofPrimitive => {
        const a = (k / 36) * LH_XMAX, b = ((k + 1) / 36) * LH_XMAX;
        return { kind: 'line', p1: lhP(a, fn(a)), p2: lhP(b, fn(b)), color, thickness };
    });
const PROOF_LHOPITAL: VisualProof = {
    title: "L'Hopital's Rule",
    caption: 'both heights vanish together, so their ratio becomes the slopes ratio',
    family: 'D',
    claim: { fp: LH_FP, gp: LH_GP, limit: LH_FP / LH_GP },
    primitives: [
        { kind: 'line', p1: lhP(-0.15, 0), p2: lhP(LH_XMAX + 0.15, 0),
          color: COLOR_INK, thickness: 0.04 },
        { kind: 'line', p1: lhP(0, -0.4), p2: lhP(0, LH_F(LH_XMAX) + 0.4),
          color: COLOR_INK, thickness: 0.04 },

        // The tangents, thin: what the curves become near a.
        ...lhCurve(x => LH_FP * x, COLOR_BLUE_FILL, 0.05),
        ...lhCurve(x => LH_GP * x, COLOR_GREEN_FILL, 0.05),
        ...lhCurve(LH_F, COLOR_BLUE, 0.075),
        ...lhCurve(LH_G, COLOR_GREEN, 0.075),

        // The two heights, at a large h and a small one.
        ...LH_H.flatMap((h): ProofPrimitive[] => [
            { kind: 'line', p1: lhP(h, 0), p2: lhP(h, LH_F(h)), color: COLOR_BLUE, thickness: 0.13 },
            { kind: 'line', p1: lhP(h + 0.06, 0), p2: lhP(h + 0.06, LH_G(h)),
              color: COLOR_GREEN, thickness: 0.13 },
            { kind: 'label', position: lhP(h, -0.55), text: `h = ${h}`, scale: 0.28, color: COLOR_INK },
        ]),

        { kind: 'label', position: lhP(LH_XMAX + 0.22, LH_F(LH_XMAX)), text: 'f',
          scale: 0.34, color: COLOR_BLUE },
        { kind: 'label', position: lhP(LH_XMAX + 0.22, LH_G(LH_XMAX)), text: 'g',
          scale: 0.34, color: COLOR_GREEN },
        { kind: 'label', position: lhP(-0.1, -0.9), text: 'a', scale: 0.32, color: COLOR_INK },

        // The ledger goes UNDER the plot, not beside it: at the right of the
        // frame the curves are still climbing and the f and g labels are there.
        { kind: 'label', position: [-2.6, -4.1, 0],
          text: `h = ${LH_H[0]}:  f/g = ${(LH_F(LH_H[0]) / LH_G(LH_H[0])).toFixed(2)}`,
          scale: 0.3, color: COLOR_INK },
        { kind: 'label', position: [-2.6, -5.0, 0],
          text: `h = ${LH_H[1]}:  f/g = ${(LH_F(LH_H[1]) / LH_G(LH_H[1])).toFixed(2)}`,
          scale: 0.3, color: COLOR_INK },
        { kind: 'label', position: [-2.6, -5.9, 0], text: 'h → 0:  f/g → 2',
          scale: 0.3, color: COLOR_RED },
        { kind: 'label', position: [-2.6, -7.0, 0], text: "f'(a) / g'(a) = 2 / 1", scale: 0.32,
          color: COLOR_RED },
    ],
};

// ─── Catalog ────────────────────────────────────────────────────────────
//
// Keyed by formula id (1-based, matches MathFormula.id). Look up via
// PROOFS[formula.id] — undefined means no proof available.

export const PROOFS: { [id: number]: VisualProof } = {
    1:  PROOF_PYTHAGORAS,
    2:  PROOF_LAW_OF_COSINES,
    3:  PROOF_LAW_OF_SINES,
    4:  PROOF_TRIANGLE_AREA,
    5:  PROOF_CIRCLE_AREA,
    6:  PROOF_CIRCUMFERENCE,
    7:  PROOF_SPHERE_SURFACE,
    8:  PROOF_SPHERE_VOLUME,
    9:  PROOF_CYLINDER_VOLUME,
    10: PROOF_DISTANCE,
    11: PROOF_MIDPOINT,
    12: PROOF_SLOPE,
    13: PROOF_HERON,
    14: PROOF_CIRCLE_EQ,
    15: PROOF_ELLIPSE,
    16: PROOF_ARC_LENGTH,
    17: PROOF_SECTOR_AREA,
    18: PROOF_EULER_POLYHEDRON,
    19: PROOF_ANGLE_SUM,
    20: PROOF_EXTERIOR_ANGLE,
    21: PROOF_QUADRATIC,
    22: PROOF_DIFFERENCE_OF_SQUARES,
    23: PROOF_PERFECT_SQUARE,
    24: PROOF_DIFFERENCE_OF_CUBES,
    25: PROOF_GEOMETRIC_SUM,
    26: PROOF_INFINITE_GEOMETRIC,
    27: PROOF_ARITHMETIC_SERIES,
    29: PROOF_LOG_PRODUCT,
    33: PROOF_AM_GM,
    28: PROOF_EULER_IDENTITY,
    31: PROOF_EXPONENT_PRODUCT,
    32: PROOF_POWER_OF_POWER,
    34: PROOF_TRIANGLE_INEQ,
    37: PROOF_PERMUTATIONS,
    38: PROOF_COMBINATIONS,
    39: PROOF_FIBONACCI,
    40: PROOF_DE_MOIVRE,
    41: PROOF_POWER_RULE,
    43: PROOF_PRODUCT_RULE,
    45: PROOF_FTC,
    46: PROOF_PARTS,
    48: PROOF_EULER_FORMULA,
    49: PROOF_DERIV_SIN,
    52: PROOF_DERIV_LN,
    54: PROOF_MVT,
    50: PROOF_DERIV_COS,
    55: PROOF_GAUSSIAN,
    56: PROOF_LORENTZ,
    65: PROOF_TRANSPOSE_PRODUCT,
    66: PROOF_DET2,
    67: PROOF_DET_PRODUCT,
    69: PROOF_EIGENVALUE,
    73: PROOF_DOT_PRODUCT,
    75: PROOF_CAUCHY_SCHWARZ,
    76: PROOF_VECTOR_NORM,
    77: PROOF_ORTHOGONALITY,
    78: PROOF_RANK_NULLITY,
    80: PROOF_SVD,
    74: PROOF_CROSS_PRODUCT,
    42: PROOF_CHAIN_RULE,
    53: PROOF_LHOPITAL,
    61: PROOF_MATRIX_MULT,
    63: PROOF_MATRIX_INVERSE,
    68: PROOF_COFACTOR,
    70: PROOF_CHAR_POLY,
    72: PROOF_TRACE_PRODUCT,
    79: PROOF_SPECTRAL,
    // The thirteen that stay empty are definitions (#35 #51 #59 #62 #64 #71),
    // notational restatements (#30 #36 #44 #47) and physical postulates
    // (#57 #58 #60). A figure hung on a definition teaches the reader that
    // figures are decoration, so those get none. See matematex-proof-grammar.md.
};

/** Formula ids that have a visual proof, for UI that needs to know whether to
 *  offer a "Proof" affordance before rendering anything. */
export function hasProof(formulaId: number): boolean {
    return PROOFS[formulaId] !== undefined;
}

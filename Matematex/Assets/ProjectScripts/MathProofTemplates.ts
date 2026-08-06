// MathProofTemplates.ts — reusable constructions for the proof grammar.
//
// See matematex-proof-grammar.md. Each helper builds one production of the
// grammar, so the tenth proof in a family costs a fraction of the first: the
// primitives, the label convention and the invariant are all decided once.
//
// Pure TS — no Lens Studio types — so proof data and the tests share it.

import {
    Vec3, Color, ProofPrimitive, ProofPolygon,
    COLOR_INK, COLOR_BLUE, COLOR_RED, COLOR_GREEN, COLOR_AMBER,
    COLOR_BLUE_FILL, COLOR_RED_FILL, COLOR_GREEN_FILL, COLOR_AMBER_FILL,
} from './MatematexProof';

/** Palette in a fixed order, so pieces of a dissection get distinct colours
 *  without every proof choosing them by hand. */
export const PIECE_COLORS: [Color, Color][] = [
    [COLOR_BLUE_FILL, COLOR_BLUE],
    [COLOR_GREEN_FILL, COLOR_GREEN],
    [COLOR_AMBER_FILL, COLOR_AMBER],
    [COLOR_RED_FILL, COLOR_RED],
];

export interface RectPiece {
    x: number; y: number; w: number; h: number;
    /** Text placed at the piece's centre — normally its measure. */
    label?: string;
    /** Index into PIECE_COLORS; omit to leave the piece unfilled (an outline,
     *  for a region that has been REMOVED rather than added). */
    color?: number;
    labelScale?: number;
}

/** Family A: an axis-aligned dissection.
 *
 *  Each piece is drawn filled and labelled at its centre with its own measure,
 *  which is what lets the reader add the pieces up two ways. A piece with no
 *  colour is drawn as an outline only — the convention for a region that was
 *  taken away, which must not read as a fourth piece. */
export function rectPieces(pieces: RectPiece[]): ProofPrimitive[] {
    const out: ProofPrimitive[] = [];
    for (const p of pieces) {
        const c = p.color === undefined ? null : PIECE_COLORS[p.color % PIECE_COLORS.length];
        out.push({
            kind: 'polygon',
            points: [[p.x, p.y, 0], [p.x + p.w, p.y, 0],
                     [p.x + p.w, p.y + p.h, 0], [p.x, p.y + p.h, 0]] as Vec3[],
            fill: c ? c[0] : undefined,
            stroke: c ? c[1] : COLOR_RED,
            strokeThickness: 0.05,
        } as ProofPolygon);
    }
    // Labels after all fills, so no piece can cover a neighbour's text.
    for (const p of pieces) {
        if (!p.label) continue;
        const c = p.color === undefined ? null : PIECE_COLORS[p.color % PIECE_COLORS.length];
        out.push({
            kind: 'label',
            position: [p.x + p.w / 2, p.y + p.h / 2, 0],
            text: p.label,
            scale: p.labelScale ?? 0.55,
            color: c ? c[1] : COLOR_RED,
        });
    }
    return out;
}

/** A dimension tick with a label, running along one edge of a figure. */
export function dimension(from: Vec3, to: Vec3, text: string,
                          offset: Vec3, scale = 0.5, color: Color = COLOR_INK): ProofPrimitive[] {
    const mid: Vec3 = [(from[0] + to[0]) / 2 + offset[0],
                       (from[1] + to[1]) / 2 + offset[1],
                       (from[2] + to[2]) / 2 + offset[2]];
    return [
        { kind: 'line', p1: [from[0] + offset[0], from[1] + offset[1], from[2] + offset[2]],
          p2: [to[0] + offset[0], to[1] + offset[1], to[2] + offset[2]],
          color, thickness: 0.035 },
        { kind: 'label', position: mid, text, scale, color },
    ];
}

/** Family E: a right-angle mark at `corner`, with legs pointing along `u`
 *  and `v`. Small square, drawn as an outline. */
export function rightAngle(corner: Vec3, u: Vec3, v: Vec3, size = 0.32,
                           color: Color = COLOR_INK): ProofPrimitive {
    const n = (w: Vec3): Vec3 => {
        const l = Math.hypot(w[0], w[1], w[2]) || 1;
        return [w[0] / l * size, w[1] / l * size, w[2] / l * size];
    };
    const a = n(u), b = n(v);
    return {
        kind: 'polygon',
        points: [corner,
                 [corner[0] + a[0], corner[1] + a[1], corner[2] + a[2]],
                 [corner[0] + a[0] + b[0], corner[1] + a[1] + b[1], corner[2] + a[2] + b[2]],
                 [corner[0] + b[0], corner[1] + b[1], corner[2] + b[2]]] as Vec3[],
        stroke: color, strokeThickness: 0.035,
        // Tagged so the family-E invariant can find every right-angle mark and
        // confirm the figure really does have a right angle there. A marker
        // drawn at a corner that is not square is a lie the reader cannot
        // detect, since the mark itself always looks square.
        piece: 'right-angle',
    };
}

/** An arc marking the angle between two directions at `centre`. */
export function angleArc(centre: Vec3, from: number, to: number, radius: number,
                         color: Color = COLOR_INK, steps = 10): ProofPrimitive[] {
    const out: ProofPrimitive[] = [];
    for (let k = 0; k < steps; k++) {
        const t0 = from + (to - from) * (k / steps);
        const t1 = from + (to - from) * ((k + 1) / steps);
        out.push({
            kind: 'line',
            p1: [centre[0] + Math.cos(t0) * radius, centre[1] + Math.sin(t0) * radius, centre[2]],
            p2: [centre[0] + Math.cos(t1) * radius, centre[1] + Math.sin(t1) * radius, centre[2]],
            color, thickness: 0.035,
        });
    }
    return out;
}

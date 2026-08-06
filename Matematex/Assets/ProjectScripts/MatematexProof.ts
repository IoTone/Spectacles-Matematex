// MatematexProof.ts — Visual proofs for the Book of Math.
//
// A typed primitive layer inspired by TikZ: line / polygon / circle / label /
// arrow. Authored as plain TS data; rendered in 3D via Lens Studio scene
// objects so the user can walk around the proof.
//
// The primitive types are pure TS (Vec3 = [x,y,z] tuples) so proof data can
// live in node-runnable test files. The renderer converts to Lens Studio vec3
// at draw time.
//
// Why typed primitives, not a TikZ-string parser:
//   - Ships immediately; no parser to write or maintain.
//   - TypeScript catches malformed proofs at compile time.
//   - A future TikZ-string parser can target these same primitives without
//     changing the renderer or proof catalog.

import { applyTextColor } from './MatematexTextColor';

// ─── Pure-TS primitive types ────────────────────────────────────────────

export type Vec3 = [number, number, number];
export type Color = [number, number, number, number]; // RGBA, 0–1

export const COLOR_INK:    Color = [0.95, 0.95, 0.95, 1.0];
export const COLOR_BLUE:   Color = [0.40, 0.65, 1.00, 1.0];
export const COLOR_RED:    Color = [1.00, 0.45, 0.40, 1.0];
export const COLOR_GREEN:  Color = [0.50, 0.85, 0.50, 1.0];
export const COLOR_AMBER:  Color = [1.00, 0.75, 0.30, 1.0];
export const COLOR_BLUE_FILL:  Color = [0.40, 0.65, 1.00, 0.35];
export const COLOR_RED_FILL:   Color = [1.00, 0.45, 0.40, 0.35];
export const COLOR_GREEN_FILL: Color = [0.50, 0.85, 0.50, 0.35];
export const COLOR_AMBER_FILL: Color = [1.00, 0.75, 0.30, 0.35];

/** The same colour at full opacity. A solid drawn with the 0.35-alpha fills
 *  reads as a pane of tinted glass — you see the room through it, every face
 *  washes toward the same value, and the shape flattens. Solids want opaque. */
export function opaque(c: Color): Color { return [c[0], c[1], c[2], 1.0]; }

/** Direction the baked light comes from, in the rotated (drawn) frame.
 *  Chosen so the three faces of a box visible in the default three-quarter view
 *  come out clearly distinct — front 0.62, right 0.71, top 0.87 — rather than
 *  one of them going black. */
const LIGHT_DIR: [number, number, number] = [0.25, 0.50, 0.83];
const AMBIENT = 0.40;
/** A weak fill from behind. Without it every face turned away from the light
 *  clamps to flat ambient, so a viewer who walks round the back of a spatial
 *  proof sees three identically-toned faces and the shape collapses again —
 *  the same problem, just relocated. */
const BACKLIGHT = 0.18;

/** Shade a face colour by which way it points.
 *
 *  The proof material is UNLIT, so without this every face of a box renders the
 *  identical colour and the solid reads as a flat silhouette no matter how it
 *  is turned. Baking a Lambert term into the vertex colour gives the shape back
 *  without depending on where the scene's lights happen to be — the figure is
 *  placed in a room the lens does not control. Alpha is left alone. */
function shadeFor(n: vec3): number {
    const d = n.x * LIGHT_DIR[0] + n.y * LIGHT_DIR[1] + n.z * LIGHT_DIR[2];
    return AMBIENT + (1 - AMBIENT) * Math.max(0, d) + BACKLIGHT * Math.max(0, -d);
}

export interface ProofLine {
    kind: 'line';
    p1: Vec3;
    p2: Vec3;
    color?: Color;
    /** Stroke thickness in proof units (multiplied by worldScale at draw time). */
    thickness?: number;
    /** Which object this belongs to. Ignored when drawing; it is what lets the
     *  tests reason about whole solids rather than loose faces. */
    piece?: string;
}

/** Closed polygon. Final point implicitly connects back to first. */
export interface ProofPolygon {
    kind: 'polygon';
    points: Vec3[];
    fill?: Color;        // null/omitted = no fill
    stroke?: Color;      // null/omitted = no stroke
    strokeThickness?: number;
    /** A point the face should turn its front toward — normally the centre of
     *  the solid it belongs to, so the face ends up pointing OUTWARD and a
     *  back-face-culling material shows the solid correctly from every angle.
     *
     *  Omit for flat figures. Without it a face is oriented toward the viewer
     *  (+Z), which is right for anything drawn in the XY plane but undecidable
     *  for a face seen edge-on — so an edge-on face keeps the winding it was
     *  authored with rather than having one guessed for it. `boxFaces()` sets
     *  this for you. */
    outwardFrom?: Vec3;
    /** Which object this face belongs to. Ignored when drawing.
     *
     *  `outwardFrom` almost identifies a solid — every face of a box shares
     *  one — but a CAVITY cannot work that way: no single point lies outside a
     *  cone's inner wall on every side, so those faces each need their own
     *  reference and would otherwise look like hundreds of separate objects. */
    piece?: string;
}

/** Circle in the plane defined by `normal` (default = z-axis: XY plane). */
export interface ProofCircle {
    kind: 'circle';
    center: Vec3;
    radius: number;
    normal?: Vec3;       // unit vector; default [0,0,1]
    segments?: number;   // default 32
    fill?: Color;
    stroke?: Color;
    strokeThickness?: number;
}

export interface ProofLabel {
    kind: 'label';
    position: Vec3;
    text: string;
    scale?: number;      // multiplier on template scale, default 1.0
    color?: Color;
    /** Dark offset copy behind the text for contrast. On by default: a label
     *  tinted to match the piece it names is unreadable against that piece. */
    shadow?: boolean;
}

export interface ProofArrow {
    kind: 'arrow';
    from: Vec3;
    to: Vec3;
    color?: Color;
    thickness?: number;
    headSize?: number;   // length of head in proof units, default 0.3
}

export type ProofPrimitive = ProofLine | ProofPolygon | ProofCircle | ProofLabel | ProofArrow;

export interface VisualProof {
    /** Short display name; shown above the proof. */
    title?: string;
    /** Optional one-line caption explaining the figure. */
    caption?: string;
    /** Primitives in draw order; later items render on top. */
    primitives: ProofPrimitive[];
    /** True for a figure with real depth — a solid rather than a drawing.
     *
     *  Two things change. The per-primitive z bias that keeps coplanar flat
     *  geometry from z-fighting is switched OFF, because on a solid it would
     *  shear the shape: six faces at 0.05 apart is 0.3 world units of skew,
     *  and a solid's faces already sit at genuinely different depths. And the
     *  fit-to-box calculation starts accounting for depth, since the viewer
     *  walks around a spatial proof and its widest projection is the diagonal
     *  of its footprint, not its width. */
    spatial?: boolean;
    /** How far to turn a spatial figure before drawing it, in degrees.
     *
     *  An axis-aligned box viewed straight down the z-axis IS a rectangle —
     *  every face is either dead-on or edge-on, so a cube renders as a flat
     *  square and the proof reads as 2D. Turning it brings a second and third
     *  face into view, which is what makes it legible as a solid.
     *
     *  Defaults to a three-quarter view. The figure is still free-standing in
     *  the room; this only sets where it starts. */
    spatialView?: { yaw: number, pitch: number };
    /** Which production of the proof grammar this figure is an instance of —
     *  see matematex-proof-grammar.md. Not used when drawing: it selects which
     *  invariant the test suite holds the figure to, which is the whole point
     *  of classifying. 'A' partition, 'B' congruence, 'C' slice match,
     *  'D' limit, 'E' projection, 'F' similarity, 'G' tangency, 'H' path,
     *  'I' bijection, 'J' invariant, 'K' transformation. */
    family?: string;
    /** Numbers the figure asserts, for its family's invariant to check against.
     *  For a partition, `total` is the measure the pieces must add up to. */
    claim?: { [k: string]: number };
}

/** Default three-quarter view: yaw brings the +x wall toward the viewer, pitch
 *  tips the +y top down into sight. */
export const DEFAULT_SPATIAL_VIEW = { yaw: -32, pitch: 22 };

/** Turn every coordinate of a proof by yaw (about +Y) then pitch (about +X).
 *
 *  Applied up front rather than as a container transform, so bounds, fit-to-box
 *  and recentering all work on what is actually shown. Labels get their anchor
 *  turned with the geometry — staying attached to the piece they name — but are
 *  drawn unrotated, since Text3D does not billboard and text laid into the
 *  figure's plane would be read edge-on. */
export function rotateProof(proof: VisualProof, yawDeg: number, pitchDeg: number): VisualProof {
    const cy = Math.cos(yawDeg * Math.PI / 180), sy = Math.sin(yawDeg * Math.PI / 180);
    const cp = Math.cos(pitchDeg * Math.PI / 180), sp = Math.sin(pitchDeg * Math.PI / 180);
    const R = (v: Vec3): Vec3 => {
        const x = v[0] * cy + v[2] * sy;
        const z = -v[0] * sy + v[2] * cy;
        return [x, v[1] * cp - z * sp, v[1] * sp + z * cp];
    };
    const primitives = proof.primitives.map((p): ProofPrimitive => {
        switch (p.kind) {
            case 'line':    return { ...p, p1: R(p.p1), p2: R(p.p2) };
            case 'polygon': return { ...p, points: p.points.map(R),
                                     outwardFrom: p.outwardFrom ? R(p.outwardFrom) : undefined };
            case 'circle':  return { ...p, center: R(p.center), normal: p.normal ? R(p.normal) : undefined };
            case 'label':   return { ...p, position: R(p.position) };
            case 'arrow':   return { ...p, from: R(p.from), to: R(p.to) };
        }
    });
    return { ...proof, primitives };
}

// ─── Solid helpers ──────────────────────────────────────────────────────
// Pure TS, so proof data and the tests build boxes exactly the same way.

/** The eight corners of an axis-aligned box, indexed by bit: x=1, y=2, z=4. */
function boxCorners(min: Vec3, size: Vec3): Vec3[] {
    const [x0, y0, z0] = min;
    const x1 = x0 + size[0], y1 = y0 + size[1], z1 = z0 + size[2];
    return [
        [x0, y0, z0], [x1, y0, z0], [x0, y1, z0], [x1, y1, z0],
        [x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1],
    ];
}

export function boxCentre(min: Vec3, size: Vec3): Vec3 {
    return [min[0] + size[0] / 2, min[1] + size[1] / 2, min[2] + size[2] / 2];
}

/** The six faces of a box, each already told which way is out.
 *
 *  Winding is deliberately not the author's problem: `outwardFrom` is set to
 *  the box's own centre, so every face turns outward and the solid renders
 *  correctly from any angle under back-face culling. */
export function boxFaces(min: Vec3, size: Vec3, fill?: Color, stroke?: Color,
                         strokeThickness?: number): ProofPolygon[] {
    const c = boxCorners(min, size);
    const centre = boxCentre(min, size);
    const rings = [
        [0, 1, 3, 2],   // z = min
        [4, 5, 7, 6],   // z = max
        [0, 2, 6, 4],   // x = min
        [1, 3, 7, 5],   // x = max
        [0, 1, 5, 4],   // y = min
        [2, 3, 7, 6],   // y = max
    ];
    return rings.map(r => ({
        kind: 'polygon' as const,
        points: r.map(i => c[i]),
        fill, stroke, strokeThickness,
        outwardFrom: centre,
    }));
}

/** Revolve a profile around the Y axis into a closed surface.
 *
 *  `profile` is a list of [radius, y] points read as a silhouette: consecutive
 *  points become a band of quads, and a point at radius 0 closes that band into
 *  a fan (a pole, an apex, or the centre of a flat cap). A cylinder, a cone, a
 *  hemisphere and a disc are all just different profiles.
 *
 *  `facing` decides which way the surface looks. 'out' is a solid seen from
 *  outside; 'in' is a cavity — the inner wall of a cone bored out of a
 *  cylinder, where the visible surface faces the axis. Getting this wrong makes
 *  the surface vanish under back-face culling rather than look wrong, so it is
 *  an explicit argument instead of something inferred.
 *
 *  Winding is emitted outward-consistent, so the enclosed volume can be
 *  computed from the triangles and checked against the analytic value — which
 *  is how the tests know a profile is right. */
export function revolve(
    profile: [number, number][],
    segments: number,
    facing: 'out' | 'in',
    fill?: Color,
    interior?: Vec3,
    piece?: string,
): ProofPolygon[] {
    const out: ProofPolygon[] = [];
    // Reference point for 'out' defaults to the middle of the profile's height
    // — a point inside the solid. NOT the axis at the band's own height: for a
    // flat cap those coincide, leaving the face with no side to turn away from.
    const ys = profile.map(q => q[1]);
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const at = (r: number, k: number): Vec3 => {
        const t = (k % segments) / segments * Math.PI * 2;
        return [r * Math.cos(t), 0, r * Math.sin(t)];
    };
    for (let i = 0; i < profile.length - 1; i++) {
        const [r0, y0] = profile[i];
        const [r1, y1] = profile[i + 1];
        if (r0 === 0 && r1 === 0) continue;                  // degenerate band
        for (let k = 0; k < segments; k++) {
            const a = at(r0, k), b = at(r0, k + 1);
            const c = at(r1, k + 1), d = at(r1, k);
            // Ring of quads, collapsing to a triangle where a radius is zero.
            let ring: Vec3[];
            if (r0 === 0)      ring = [[0, y0, 0], [c[0], y1, c[2]], [d[0], y1, d[2]]];
            else if (r1 === 0) ring = [[a[0], y0, a[2]], [b[0], y0, b[2]], [0, y1, 0]];
            else               ring = [[a[0], y0, a[2]], [b[0], y0, b[2]],
                                       [c[0], y1, c[2]], [d[0], y1, d[2]]];
            // Turn each face away from the axis (or toward it, for a cavity) by
            // choosing which side the reference point sits on.
            let cx = 0, cy = 0, cz = 0;
            for (const q of ring) { cx += q[0]; cy += q[1]; cz += q[2]; }
            const n = 1 / ring.length;
            const mx = cx * n, my = cy * n, mz = cz * n;
            const ref: Vec3 = interior ? (facing === 'out' ? interior
                                          : [mx * 2 - interior[0], my, mz * 2 - interior[2]])
                : facing === 'out'
                ? [0, midY, 0]                     // inside the solid
                : [mx * 2, my, mz * 2];            // outside it
            out.push({ kind: 'polygon', points: ring, fill, outwardFrom: ref, piece });
        }
    }
    return out;
}

/** The twelve edges of a box, for drawing a solid as a wireframe. */
export function boxEdges(min: Vec3, size: Vec3, color?: Color, thickness?: number): ProofLine[] {
    const c = boxCorners(min, size);
    const pairs = [
        [0, 1], [1, 3], [3, 2], [2, 0],   // z = min face
        [4, 5], [5, 7], [7, 6], [6, 4],   // z = max face
        [0, 4], [1, 5], [2, 6], [3, 7],   // the four struts
    ];
    return pairs.map(([i, j]) => ({
        kind: 'line' as const, p1: c[i], p2: c[j], color, thickness,
    }));
}

// ─── Renderer ───────────────────────────────────────────────────────────
// Below this line uses Lens Studio types. Pure-TS callers (tests, data
// authors) only need the types above.

export interface ProofRenderOptions {
    /** Where the proof attaches in the scene. */
    parent: SceneObject;
    /** Same lineMaterial used by MatematexBridge for fractions. */
    lineMaterial: Material;
    /** Cloneable Text 3D template — used for labels. */
    templateTextComp: any;
    /** Local scale of the templateText SceneObject. */
    templateScale: vec3;
    /** Multiplier applied to all proof coordinates (proof units → world units).
     *  Ignored when `fitBox` is given. */
    worldScale: number;
    /** Fit the figure inside this half-extent (world units) instead of using a
     *  fixed `worldScale`.
     *
     *  Proofs are authored in whatever units suit the geometry — Pythagoras is
     *  a 3-4-5 triangle, a circle proof might be radius 1 — so a single
     *  `worldScale` that frames one of them crops another. Deriving the scale
     *  from the figure's own bounds means a new proof is drawn to fit without
     *  anyone tuning a number, and it cannot silently overflow the display. */
    fitBox?: { halfWidth: number; halfHeight: number };
    /** Default color used when a primitive omits its own. */
    defaultColor: vec4;
    /** Optional offset (in world units) applied to the proof's container. */
    offset?: vec3;
    /** Where `offset` lands on the figure. The figure is always centred
     *  horizontally; this picks the vertical reference point:
     *    'center' — offset is the middle of the drawing (default; good standalone)
     *    'top'    — offset is the drawing's top edge, so the figure grows
     *               downward and can't collide with whatever sits above it
     *               regardless of how large the proof is.
     *  Either way the author's own (0,0) is irrelevant to placement. */
    anchor?: 'center' | 'top';
    /** Draw the proof's title/caption above the figure. Turn off when the host
     *  already displays the formula name and the formula itself (the Book of
     *  Math does), otherwise they read as duplicated text. Default true. */
    showTitleCaption?: boolean;
}

const DEFAULT_LINE_THICKNESS = 0.04; // proof units
const DEFAULT_STROKE_THICKNESS = 0.04;
const DEFAULT_ARROW_HEAD_SIZE = 0.3;
const DEFAULT_CIRCLE_SEGMENTS = 32;

// Coplanar geometry z-fights. Every primitive is drawn one step closer to the
// viewer than the last, in draw order, so `primitives` reads as a painter's
// stack (later = on top) the way the type doc promises. Strokes sit half a
// step in front of their own fill.
const Z_STEP = 0.05; // world units

// Draw state threaded through the primitive builders.
interface DrawCtx {
    parent: SceneObject;
    opts: ProofRenderOptions;
    /** Recentering shift, in proof units, applied to every coordinate. */
    shiftX: number;
    shiftY: number;
    shiftZ: number;
    /** Running z bias in world units; advanced per primitive. */
    z: number;
    /** Figure has real depth — suppresses the z bias and 3D-aware drawing. */
    spatial: boolean;
    /** For a spatial figure, the depth (in proof units, post-rotation) to place
     *  every label at, so none is swallowed by the solid. Null for flat art. */
    labelPlaneZ: number | null;
}

/** Render a VisualProof. Returns the proof's container SceneObject; destroy
 *  it (and all its children) to clear the proof. */
export function renderProof(rawProof: VisualProof, opts: ProofRenderOptions): SceneObject {
    // A spatial figure is turned to a three-quarter view first; everything
    // downstream then measures and draws what the viewer actually sees.
    const view = rawProof.spatialView ?? DEFAULT_SPATIAL_VIEW;
    const proof = rawProof.spatial ? rotateProof(rawProof, view.yaw, view.pitch) : rawProof;

    const container = global.scene.createSceneObject('MtxProof');
    container.setParent(opts.parent);
    if (opts.offset) {
        container.getTransform().setLocalPosition(opts.offset);
    }

    const b = proofBounds(proof);

    // Derive the scale from the figure's own size when a fit box is supplied.
    // Labels sit outside the geometric bounds, so leave a margin rather than
    // filling the box exactly.
    let effectiveOpts = opts;
    if (opts.fitBox) {
        // A spatial proof is walked around, so the width to budget for is its
        // widest projection while turning — the diagonal of the x-z footprint,
        // not the x extent. Flat proofs have zero depth, so this is exactly the
        // old calculation for them.
        const wx = Math.max(b.maxX - b.minX, 1e-6);
        const dz = proof.spatial ? Math.max(b.maxZ - b.minZ, 0) : 0;
        const w = Math.sqrt(wx * wx + dz * dz);
        const h = Math.max(b.maxY - b.minY, 1e-6);
        const fit = Math.min(
            (opts.fitBox.halfWidth * 2 * 0.85) / w,
            (opts.fitBox.halfHeight * 2 * 0.85) / h,
        );
        effectiveOpts = { ...opts, worldScale: fit };
    }

    const ctx: DrawCtx = {
        parent: container,
        opts: effectiveOpts,
        shiftX: -(b.minX + b.maxX) / 2,
        shiftY: opts.anchor === 'top' ? -b.maxY : -(b.minY + b.maxY) / 2,
        shiftZ: -(b.minZ + b.maxZ) / 2,
        z: 0,
        spatial: proof.spatial === true,
        // Float labels in front of the whole figure.
        //
        // On flat art the Z_STEP bias is enough to keep a label off the face it
        // annotates. A solid is a different problem: `spatial` switches that
        // bias off, and a tilted face has parts NEARER the viewer than a label
        // sitting at the same nominal depth — so the face eats the text. #74's
        // "|b| sin θ" was cut to "|b| si" by its own parallelogram, which reads
        // exactly like font clipping and is not.
        labelPlaneZ: proof.spatial ? b.maxZ + (b.maxZ - b.minZ) * 0.15 + 0.5 : null,
    };

    for (const p of proof.primitives) {
        switch (p.kind) {
            case 'line':    createLine(p, ctx); break;
            case 'polygon': createPolygon(p, ctx); break;
            case 'circle':  createCircle(p, ctx); break;
            case 'label':   createLabel(p, ctx); break;
            case 'arrow':   createArrow(p, ctx); break;
        }
        // The painter's-stack bias is a fix for coplanar flat geometry. On a
        // solid it would shear the shape, so leave depth alone there.
        if (!ctx.spatial) ctx.z += Z_STEP;
    }

    // Title / caption stack above the figure. Gaps are proportional to the
    // figure's own height so they scale with the drawing instead of being
    // swallowed by a large proof or floating off a small one.
    if (opts.showTitleCaption === false) return container;

    const gap = Math.max(0.8, (b.maxY - b.minY) * 0.12);
    let titleY = b.maxY + gap;
    if (proof.caption) {
        createLabel(
            { kind: 'label', position: [(b.minX + b.maxX) / 2, titleY, 0], text: proof.caption, scale: 0.7 },
            ctx,
        );
        titleY += gap;
        ctx.z += Z_STEP;
    }
    if (proof.title) {
        createLabel(
            { kind: 'label', position: [(b.minX + b.maxX) / 2, titleY, 0], text: proof.title, scale: 1.2 },
            ctx,
        );
    }

    return container;
}

// Convert a Vec3 tuple (proof units) to world-space, applying the recentering
// shift and the current z bias.
function v3(p: Vec3, ctx: DrawCtx): vec3 {
    const s = ctx.opts.worldScale;
    return new vec3((p[0] + ctx.shiftX) * s, (p[1] + ctx.shiftY) * s, (p[2] + ctx.shiftZ) * s + ctx.z);
}

function color4(c: Color | undefined, fallback: vec4): vec4 {
    if (!c) return fallback;
    return new vec4(c[0], c[1], c[2], c[3]);
}

interface ProofBounds {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
}

function proofBounds(proof: VisualProof): ProofBounds {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of proof.primitives) {
        for (const pt of pointsOf(p)) {
            if (pt[0] < minX) minX = pt[0];
            if (pt[0] > maxX) maxX = pt[0];
            if (pt[1] < minY) minY = pt[1];
            if (pt[1] > maxY) maxY = pt[1];
            if (pt[2] < minZ) minZ = pt[2];
            if (pt[2] > maxZ) maxZ = pt[2];
        }
    }
    if (!isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    return { minX, maxX, minY, maxY, minZ, maxZ };
}

function pointsOf(p: ProofPrimitive): Vec3[] {
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

// ─── Line ───────────────────────────────────────────────────────────────

function createLine(p: ProofLine, ctx: DrawCtx): void {
    const a = v3(p.p1, ctx);
    const b = v3(p.p2, ctx);
    const thickness = (p.thickness ?? DEFAULT_LINE_THICKNESS) * ctx.opts.worldScale;
    drawLine(a, b, thickness, color4(p.color, ctx.opts.defaultColor), ctx, 'MtxProofLine');
}

// Build a thin ribbon from a→b, widened along a perpendicular that faces the
// viewer.
//
// The perpendicular has to be found in 3D. Taking (-dy, dx, 0) — a perpendicular
// within the XY plane — works only for a line lying in that plane: a cube's
// depth edge runs straight along z, where dx and dy are both zero, so the
// ribbon collapses to nothing and the edge does not draw at all.
//
// cross(dir, viewZ) gives a perpendicular that is also broadside to the viewer,
// which is what makes a ribbon read as a line. That degenerates in exactly one
// case — a line pointing at the viewer — and there any perpendicular will do,
// since the ribbon is seen end-on regardless.
/** A unit vector perpendicular to (dx,dy,dz) and broadside to the viewer.
 *
 *  cross(dir, +Z) is the one that makes a ribbon read as a line. It degenerates
 *  only for a direction pointing straight at the viewer, where any perpendicular
 *  serves — the ribbon is seen end-on either way. Returns null for a zero-length
 *  direction. */
function viewPerp(dx: number, dy: number, dz: number): vec3 | null {
    let cx = dy, cy = -dx, cz = 0;                  // cross(dir, +Z)
    let l = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (l < 1e-9) {
        cx = dz; cy = 0; cz = -dx;                  // cross(dir, +Y)
        l = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (l < 1e-9) return null;
    }
    return new vec3(cx / l, cy / l, cz / l);
}

function drawLine(a: vec3, b: vec3, thickness: number, color: vec4,
                  ctx: DrawCtx, name: string): void {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return;

    const perp = viewPerp(dx, dy, dz);
    if (!perp) return;
    const h = thickness * 0.5;
    const px = perp.x * h, py = perp.y * h, pz = perp.z * h;

    drawFace([
        new vec3(a.x - px, a.y - py, a.z - pz),
        new vec3(a.x + px, a.y + py, a.z + pz),
        new vec3(b.x + px, b.y + py, b.z + pz),
        new vec3(b.x - px, b.y - py, b.z - pz),
    ], color, ctx, name, null);
}

// Fan-triangulate a convex ring and emit it as one RenderMeshVisual.
//
// Winding matters: the quad a line produces flips orientation depending on
// which way the line runs, and hand-authored polygons come in both windings.
// With a back-face-culling material that makes geometry silently vanish, so
// we normalise every ring to counter-clockwise (front face toward +Z, i.e.
// toward the viewer) before emitting indices.
function drawFace(ring: vec3[], color: vec4, ctx: DrawCtx, name: string,
                 outwardFrom: vec3 | null = null): void {
    if (ring.length < 3) return;
    const pts = orientRing(ring, outwardFrom);

    const verts: number[] = [];
    for (const v of pts) verts.push(v.x, v.y, v.z);
    const indices: number[] = [];
    for (let i = 1; i < pts.length - 1; i++) indices.push(0, i, i + 1);

    const builder = new MeshBuilder([{ name: 'position', components: 3 }]);
    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;
    builder.appendVerticesInterleaved(verts);
    builder.appendIndices(indices);
    if (!builder.isValid()) return;
    builder.updateMesh();

    const obj = global.scene.createSceneObject(name);
    obj.setParent(ctx.parent);
    const visual = obj.createComponent('Component.RenderMeshVisual') as RenderMeshVisual;
    visual.mesh = builder.getMesh();
    visual.mainMaterial = materialFor(ctx, color);
    applyColor(visual, color);
}

// Newell's method: a normal that is well defined for a polygon in ANY plane,
// unlike a shoelace sum on the XY projection. That projection is what the
// renderer used to orient faces by, and it collapses to zero for a face seen
// edge-on — so a cube's side walls had their winding decided by rounding
// noise and flickered in and out under back-face culling.
function newellNormal(pts: vec3[]): vec3 {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        nx += (p.y - q.y) * (p.z + q.z);
        ny += (p.z - q.z) * (p.x + q.x);
        nz += (p.x - q.x) * (p.y + q.y);
    }
    return new vec3(nx, ny, nz);
}

/** Unit vector pointing from `from` toward the ring's centre — the direction
 *  that is "out of the solid" at this face. */
function outwardUnit(ring: vec3[], from: vec3): vec3 {
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { cx += p.x; cy += p.y; cz += p.z; }
    const k = 1 / ring.length;
    const dx = cx * k - from.x, dy = cy * k - from.y, dz = cz * k - from.z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-9) return new vec3(0, 0, 1);
    return new vec3(dx / l, dy / l, dz / l);
}

/** Order a ring so its front face points the right way.
 *
 *  With `outwardFrom` (the centre of the solid this face belongs to), the face
 *  turns away from that point, so a closed solid presents outward faces in
 *  every direction and stays correct as the viewer walks around it.
 *
 *  Without it, the face turns toward the viewer — right for anything drawn in
 *  the XY plane. A face seen edge-on has no viewer-facing direction to pick, so
 *  its authored winding is left alone rather than resolved by noise. */
function orientRing(ring: vec3[], outwardFrom: vec3 | null): vec3[] {
    const n = newellNormal(ring);

    if (outwardFrom) {
        let cx = 0, cy = 0, cz = 0;
        for (const p of ring) { cx += p.x; cy += p.y; cz += p.z; }
        const k = 1 / ring.length;
        const ox = cx * k - outwardFrom.x;
        const oy = cy * k - outwardFrom.y;
        const oz = cz * k - outwardFrom.z;
        const facing = n.x * ox + n.y * oy + n.z * oz;
        return facing < 0 ? ring.slice().reverse() : ring;
    }

    // Face the viewer (+Z). |n.z| tiny means edge-on: no answer exists, so keep
    // what the author wrote.
    const scale = Math.abs(n.x) + Math.abs(n.y) + Math.abs(n.z);
    if (scale > 1e-9 && Math.abs(n.z) / scale < 1e-6) return ring;
    return n.z < 0 ? ring.slice().reverse() : ring;
}

// ─── Polygon ────────────────────────────────────────────────────────────

function createPolygon(p: ProofPolygon, ctx: DrawCtx): void {
    if (p.points.length < 3) return;

    if (p.fill) {
        // Fan-triangulate a convex polygon. (Squares, triangles, hexagons all
        // fine.) For concave shapes we'd need ear-clipping; not in v1 scope.
        const world = p.points.map(pt => v3(pt, ctx));
        const from = p.outwardFrom ? v3(p.outwardFrom, ctx) : null;
        let fill = color4(p.fill, ctx.opts.defaultColor);
        if (ctx.spatial && from) {
            // The face's OWN normal, flipped to agree with which side is out.
            // Using the centre-to-face direction instead is close enough on a
            // box, where they coincide, but skews badly on a tall or curved
            // surface — a cylinder wall's faces would all shade as though they
            // pointed at the solid's midpoint.
            const n = newellNormal(world);
            const l = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
            const o = outwardUnit(world, from);
            const sgn = (n.x * o.x + n.y * o.y + n.z * o.z) < 0 ? -1 : 1;
            const k = shadeFor(new vec3(sgn * n.x / l, sgn * n.y / l, sgn * n.z / l));
            fill = new vec4(fill.r * k, fill.g * k, fill.b * k, fill.a);
        }
        drawFace(world, fill, ctx, 'MtxProofPolyFill', from);
    }
    if (p.stroke) {
        // Strokes ride half a step proud of their own fill so the outline stays
        // visible instead of z-fighting the face it bounds.
        //
        // On a flat figure "proud" means toward the viewer, so a z bias does it.
        // On a solid it means along the face's OWN outward normal: a cube's side
        // wall is edge-on to +Z, so a z bias would slide its outline along the
        // wall instead of lifting it off, and the two would z-fight anyway.
        const spatialOffset = ctx.spatial && p.outwardFrom;
        const strokeCtx: DrawCtx = spatialOffset
            ? ctx
            : { ...ctx, z: ctx.z + Z_STEP * 0.5 };
        let pts = p.points.map(pt => v3(pt, strokeCtx));
        if (spatialOffset) {
            const outward = outwardUnit(pts, v3(p.outwardFrom!, ctx));
            const d = Z_STEP * 0.5;
            pts = pts.map(v => new vec3(v.x + outward.x * d, v.y + outward.y * d, v.z + outward.z * d));
        }
        const thickness = (p.strokeThickness ?? DEFAULT_STROKE_THICKNESS) * ctx.opts.worldScale;
        const strokeCol = color4(p.stroke, ctx.opts.defaultColor);
        for (let i = 0; i < pts.length; i++) {
            drawLine(pts[i], pts[(i + 1) % pts.length], thickness, strokeCol,
                     strokeCtx, 'MtxProofPolygonEdge');
        }
    }
}

// ─── Circle (approximated by N-segment polygon) ─────────────────────────

function createCircle(p: ProofCircle, ctx: DrawCtx): void {
    const segs = p.segments ?? DEFAULT_CIRCLE_SEGMENTS;
    // v1: assume circle lies in XY plane (normal = +Z). Honoring `normal` for
    // arbitrary planes would require building an orthonormal basis; deferred.
    const cx = p.center[0];
    const cy = p.center[1];
    const cz = p.center[2];
    const points: Vec3[] = [];
    for (let i = 0; i < segs; i++) {
        const t = (i / segs) * Math.PI * 2;
        points.push([cx + Math.cos(t) * p.radius, cy + Math.sin(t) * p.radius, cz]);
    }
    createPolygon({
        kind: 'polygon',
        points,
        fill: p.fill,
        stroke: p.stroke,
        strokeThickness: p.strokeThickness,
    }, ctx);
}

// ─── Label ──────────────────────────────────────────────────────────────

function createLabel(p: ProofLabel, ctx: DrawCtx): void {
    const opts = ctx.opts;
    if (!opts.templateTextComp) return;
    const s = (p.scale ?? 1.0);
    // Labels sit a full step in front of the geometry they annotate so text
    // never disappears into a filled face.
    const labelCtx: DrawCtx = { ...ctx, z: ctx.z + Z_STEP };
    // Keep x and y so the label still points at its piece; override depth so
    // nothing can occlude it.
    const anchor: Vec3 = ctx.labelPlaneZ === null
        ? p.position
        : [p.position[0], p.position[1], ctx.labelPlaneZ];
    const pos = v3(anchor, labelCtx);
    const scale = new vec3(
        opts.templateScale.x * s,
        opts.templateScale.y * s,
        opts.templateScale.z * s,
    );

    /** One copy of the text at `at`, tinted `col`. */
    const place = (name: string, at: vec3, col: vec4): boolean => {
        const o = global.scene.createSceneObject(name);
        o.setParent(ctx.parent);
        const c: any = (o as any).copyComponent(opts.templateTextComp);
        if (!c) { o.destroy(); return false; }
        c.text = p.text;
        // Text3D colour lives on the material, not on a `textFill` — see
        // applyTextColor. Proof labels are deliberately multi-coloured, so this
        // matters more here than anywhere else.
        applyTextColor(c, col);
        o.getTransform().setLocalPosition(at);
        o.getTransform().setLocalScale(scale);
        return true;
    };

    // Shadow first, so it is behind in both depth and creation order.
    //
    // A label is colour-coded to the piece it names, which is exactly what makes
    // it unreadable against that piece — amber text on an amber slab has no edge
    // at all. A dark offset copy gives every glyph a contrasting border, and it
    // also lifts the pale labels off a bright passthrough background. The offset
    // scales with the label so it stays proportional at any size (~0.06 em).
    if (p.shadow !== false) {
        const d = 0.075 * opts.templateScale.x * s;
        place('MtxProofLabelShadow',
              new vec3(pos.x + d, pos.y - d, pos.z - Z_STEP * 0.25),
              new vec4(0, 0, 0, 0.9));
    }
    place('MtxProofLabel', pos, color4(p.color, opts.defaultColor));
}

// ─── Arrow (line + triangular head) ─────────────────────────────────────

function createArrow(p: ProofArrow, ctx: DrawCtx): void {
    const opts = ctx.opts;
    const from = v3(p.from, ctx);
    const to = v3(p.to, ctx);
    const thickness = (p.thickness ?? DEFAULT_LINE_THICKNESS) * opts.worldScale;
    const col = color4(p.color, opts.defaultColor);
    const headSize = (p.headSize ?? DEFAULT_ARROW_HEAD_SIZE) * opts.worldScale;

    // Shorten the shaft so it doesn't poke through the head.
    //
    // Length and direction must both be taken in 3D. Measuring only the XY part
    // makes an arrow with depth shorten by the wrong amount, and an arrow along
    // the view axis has NO xy part at all — it used to fail the zero-length
    // guard here and draw nothing whatsoever.
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const shaftEnd = new vec3(to.x - ux * headSize, to.y - uy * headSize, to.z - uz * headSize);

    drawLine(from, shaftEnd, thickness, col, ctx, 'MtxProofArrowShaft');

    // Triangle head: tip at `to`, base at shaftEnd ± perpendicular * headSize/2
    const perp = viewPerp(dx, dy, dz);
    if (!perp) return;
    const px = perp.x * headSize * 0.5;
    const py = perp.y * headSize * 0.5;
    const pz = perp.z * headSize * 0.5;
    drawFace([
        new vec3(shaftEnd.x - px, shaftEnd.y - py, shaftEnd.z - pz),
        new vec3(to.x, to.y, to.z),
        new vec3(shaftEnd.x + px, shaftEnd.y + py, shaftEnd.z + pz),
    ], col, ctx, 'MtxProofArrowHead');
}

// ─── Color / material helpers ───────────────────────────────────────────

// A proof is deliberately multi-colored, but `lineMaterial` is a single shared
// asset. Writing a color into that asset's mainPass repaints every visual
// using it — every other primitive in the proof, and the bridge's fraction
// bars too — with whatever color was assigned last. So each distinct color
// gets its own cloned material.
//
// The cache is parked on the source material rather than on DrawCtx: a proof
// re-renders every time the user navigates to its formula, and a per-render
// cache would clone a fresh set of materials each visit.
function materialFor(ctx: DrawCtx, color: vec4): Material {
    const src = ctx.opts.lineMaterial as any;
    const cache: { [key: string]: Material } =
        src.__mtxProofColorCache || (src.__mtxProofColorCache = {});

    const key = `${color.r},${color.g},${color.b},${color.a}`;
    if (cache[key]) return cache[key];

    let mat: Material = ctx.opts.lineMaterial;
    try {
        const cloned = src.clone?.();
        if (cloned) {
            mat = cloned as Material;
            const pass = (mat as any).mainPass;
            if (pass) {
                try { pass.baseColor = color; } catch (e) { /* ignore */ }
                try { pass.emissiveColor = color; } catch (e) { /* ignore */ }
                try { pass.emissiveIntensity = 1.0; } catch (e) { /* ignore */ }
            }
        }
    } catch (e) {
        // clone() unavailable — fall back to the shared material. Colors will
        // be driven by the per-visual overrides in applyColor() instead.
    }
    cache[key] = mat;
    return mat;
}

function applyColor(visual: RenderMeshVisual, color: vec4): void {
    // Per-visual overrides only. Never touch visual.mainPass / mainMaterial —
    // those mutate the shared material asset (see materialFor above).
    const tries = [
        () => (visual.mainPassOverrides as any).baseColor = color,
        () => (visual.mainPassOverrides as any).emissiveColor = color,
        () => (visual.mainPassOverrides as any).emissiveIntensity = 1.0,
    ];
    for (const t of tries) {
        try { t(); } catch (e) { /* ignore */ }
    }
}

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

export interface ProofLine {
    kind: 'line';
    p1: Vec3;
    p2: Vec3;
    color?: Color;
    /** Stroke thickness in proof units (multiplied by worldScale at draw time). */
    thickness?: number;
}

/** Closed polygon. Final point implicitly connects back to first. */
export interface ProofPolygon {
    kind: 'polygon';
    points: Vec3[];
    fill?: Color;        // null/omitted = no fill
    stroke?: Color;      // null/omitted = no stroke
    strokeThickness?: number;
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
    /** Running z bias in world units; advanced per primitive. */
    z: number;
}

/** Render a VisualProof. Returns the proof's container SceneObject; destroy
 *  it (and all its children) to clear the proof. */
export function renderProof(proof: VisualProof, opts: ProofRenderOptions): SceneObject {
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
        const w = Math.max(b.maxX - b.minX, 1e-6);
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
        z: 0,
    };

    for (const p of proof.primitives) {
        switch (p.kind) {
            case 'line':    createLine(p, ctx); break;
            case 'polygon': createPolygon(p, ctx); break;
            case 'circle':  createCircle(p, ctx); break;
            case 'label':   createLabel(p, ctx); break;
            case 'arrow':   createArrow(p, ctx); break;
        }
        ctx.z += Z_STEP;
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
    return new vec3((p[0] + ctx.shiftX) * s, (p[1] + ctx.shiftY) * s, p[2] * s + ctx.z);
}

function color4(c: Color | undefined, fallback: vec4): vec4 {
    if (!c) return fallback;
    return new vec4(c[0], c[1], c[2], c[3]);
}

interface ProofBounds { minX: number; maxX: number; minY: number; maxY: number; }

function proofBounds(proof: VisualProof): ProofBounds {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of proof.primitives) {
        for (const pt of pointsOf(p)) {
            if (pt[0] < minX) minX = pt[0];
            if (pt[0] > maxX) maxX = pt[0];
            if (pt[1] < minY) minY = pt[1];
            if (pt[1] > maxY) maxY = pt[1];
        }
    }
    if (!isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    return { minX, maxX, minY, maxY };
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

// Build a thin rectangle oriented from a→b (in the XY-plane only — z extruded
// by zero). Sufficient for 2D-on-a-3D-plane proofs.
function drawLine(a: vec3, b: vec3, thickness: number, color: vec4,
                  ctx: DrawCtx, name: string): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return;

    // Compute a perpendicular in 3D. For lines in the XY plane, perpendicular
    // in XY is (-dy, dx, 0). For arbitrary 3D lines, we'd need a frame; v1
    // proofs are XY-planar so this is fine.
    const px = -dy / len * (thickness * 0.5);
    const py =  dx / len * (thickness * 0.5);

    drawFace([
        new vec3(a.x - px, a.y - py, a.z),
        new vec3(a.x + px, a.y + py, a.z),
        new vec3(b.x + px, b.y + py, b.z),
        new vec3(b.x - px, b.y - py, b.z),
    ], color, ctx, name);
}

// Fan-triangulate a convex ring and emit it as one RenderMeshVisual.
//
// Winding matters: the quad a line produces flips orientation depending on
// which way the line runs, and hand-authored polygons come in both windings.
// With a back-face-culling material that makes geometry silently vanish, so
// we normalise every ring to counter-clockwise (front face toward +Z, i.e.
// toward the viewer) before emitting indices.
function drawFace(ring: vec3[], color: vec4, ctx: DrawCtx, name: string): void {
    if (ring.length < 3) return;
    const pts = signedAreaXY(ring) < 0 ? ring.slice().reverse() : ring;

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

// Shoelace formula on the XY projection. Positive = counter-clockwise.
function signedAreaXY(pts: vec3[]): number {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
    }
    return a * 0.5;
}

// ─── Polygon ────────────────────────────────────────────────────────────

function createPolygon(p: ProofPolygon, ctx: DrawCtx): void {
    if (p.points.length < 3) return;

    if (p.fill) {
        // Fan-triangulate a convex polygon. (Squares, triangles, hexagons all
        // fine.) For concave shapes we'd need ear-clipping; not in v1 scope.
        drawFace(p.points.map(pt => v3(pt, ctx)),
                 color4(p.fill, ctx.opts.defaultColor), ctx, 'MtxProofPolyFill');
    }
    if (p.stroke) {
        // Strokes ride half a z-step in front of their own fill so the outline
        // stays visible instead of z-fighting the face it bounds.
        const strokeCtx: DrawCtx = { ...ctx, z: ctx.z + Z_STEP * 0.5 };
        const pts = p.points.map(pt => v3(pt, strokeCtx));
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
    const obj = global.scene.createSceneObject('MtxProofLabel');
    obj.setParent(ctx.parent);
    const comp: any = (obj as any).copyComponent(opts.templateTextComp);
    if (!comp) return;
    comp.text = p.text;
    // Text3D colour lives on the material, not on a `textFill` — see
    // applyTextColor. Proof labels are deliberately multi-coloured, so this
    // matters more here than anywhere else.
    applyTextColor(comp, color4(p.color, opts.defaultColor));

    const s = (p.scale ?? 1.0);
    // Labels sit a full step in front of the geometry they annotate so text
    // never disappears into a filled face.
    const labelCtx: DrawCtx = { ...ctx, z: ctx.z + Z_STEP };
    obj.getTransform().setLocalPosition(v3(p.position, labelCtx));
    obj.getTransform().setLocalScale(new vec3(
        opts.templateScale.x * s,
        opts.templateScale.y * s,
        opts.templateScale.z * s,
    ));
}

// ─── Arrow (line + triangular head) ─────────────────────────────────────

function createArrow(p: ProofArrow, ctx: DrawCtx): void {
    const opts = ctx.opts;
    const from = v3(p.from, ctx);
    const to = v3(p.to, ctx);
    const thickness = (p.thickness ?? DEFAULT_LINE_THICKNESS) * opts.worldScale;
    const col = color4(p.color, opts.defaultColor);
    const headSize = (p.headSize ?? DEFAULT_ARROW_HEAD_SIZE) * opts.worldScale;

    // Shorten the line so it doesn't poke through the head
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;
    const ux = dx / len;
    const uy = dy / len;
    const shaftEnd = new vec3(to.x - ux * headSize, to.y - uy * headSize, to.z);

    drawLine(from, shaftEnd, thickness, col, ctx, 'MtxProofArrowShaft');

    // Triangle head: tip at `to`, base at shaftEnd ± perpendicular * headSize/2
    const px = -uy * headSize * 0.5;
    const py =  ux * headSize * 0.5;
    drawFace([
        new vec3(shaftEnd.x - px, shaftEnd.y - py, shaftEnd.z),
        new vec3(to.x, to.y, to.z),
        new vec3(shaftEnd.x + px, shaftEnd.y + py, shaftEnd.z),
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

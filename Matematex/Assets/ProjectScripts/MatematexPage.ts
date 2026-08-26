// MatematexPage.ts — The page the maths is printed on.
//
// A portrait sheet of grid paper: an optional paper fill, a minor/major grid,
// and a border rule. Four scene objects total, whatever the pitch — every line
// of a given weight shares one mesh.
//
// EXPERIMENT FIRST. The open question is whether a filled page works at all on
// an additive display, where a bright fill is a lit rectangle floating in the
// wearer's room rather than a sheet of paper. That is not answerable from a
// desk: the Lens Studio preview composites over black, so a fill that looks
// like paper in preview may look like a lightbox on device, and a fill that
// looks right on device may be invisible in preview. So every dimension and
// every colour here is an @input, and the component redraws whenever one
// changes. Dial it on the device, then bake the winning numbers in.
//
// Why thin quads and not MeshTopology.Lines: line topology draws a hairline
// one pixel wide, which aliases badly at a distance and gives no control over
// weight. A grid whose minor lines are half the weight of its major lines is
// the thing that reads as graph paper, and weight is exactly what Lines cannot
// express.

// ─── Geometry helpers ───────────────────────────────────────────────────

/** Append one axis-aligned rectangle (two triangles) to a vertex/index pair. */
function pushRect(
    verts: number[], indices: number[],
    x0: number, y0: number, x1: number, y1: number, z: number,
): void {
    const base = verts.length / 3;
    verts.push(x0, y0, z,  x1, y0, z,  x1, y1, z,  x0, y1, z);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** A page layer's material: a CLONE of the source, coloured, with depth writing
 *  turned off.
 *
 *  Both halves matter. Cloning, because writing to the shared asset's mainPass
 *  repaints every other visual using it — the fraction bars and every proof
 *  primitive. Depth writing off, because the book draws content at several
 *  depths and the sheet must never occlude any of it: `proofOffsetZ` ships at
 *  −10, ten units BEHIND the paper, so a depth-writing sheet z-culls the whole
 *  figure and the Proof button appears to do nothing. That is not hypothetical
 *  — it is what shipped the first time this page was drawn.
 *
 *  `mainPassOverrides.depthWrite` does NOT do this. Overrides carry shader
 *  uniforms; depth writing is pass STATE, and setting it there fails silently.
 *  It has to be set on a pass we own. */
function pageMaterialFor(src: Material, color: vec4): Material {
    const cache: { [key: string]: Material } =
        (src as any).__mtxPageMatCache || ((src as any).__mtxPageMatCache = {});
    const key = `${color.r},${color.g},${color.b},${color.a}`;
    if (cache[key]) return cache[key];

    let mat: Material = src;
    try {
        const cloned = (src as any).clone?.();
        if (cloned) {
            mat = cloned as Material;
            const pass = (mat as any).mainPass;
            if (pass) {
                try { pass.baseColor = color; } catch (e) { /* ignore */ }
                try { pass.depthWrite = false; } catch (e) {
                    print('[MatematexPage] WARNING: could not clear depthWrite — ' +
                          'the sheet will occlude anything drawn behind it, proofs included');
                }
            }
        } else {
            print('[MatematexPage] WARNING: Material.clone() unavailable — ' +
                  'falling back to the shared material, which writes depth');
        }
    } catch (e: any) {
        print(`[MatematexPage] WARNING: material clone failed: ${e.message || e}`);
    }
    cache[key] = mat;
    return mat;
}

/** Build one RenderMeshVisual from an accumulated vertex/index pair. Returns
 *  null when there is nothing to draw, so callers never make an empty object. */
function emitMesh(
    parent: SceneObject, name: string,
    verts: number[], indices: number[],
    material: Material, color: vec4,
): SceneObject | null {
    if (indices.length === 0) return null;

    const builder = new MeshBuilder([{ name: 'position', components: 3 }]);
    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;
    builder.appendVerticesInterleaved(verts);
    builder.appendIndices(indices);
    if (!builder.isValid()) return null;
    builder.updateMesh();

    const obj = global.scene.createSceneObject(name);
    obj.setParent(parent);
    const visual = obj.createComponent('Component.RenderMeshVisual') as RenderMeshVisual;
    visual.mesh = builder.getMesh();
    visual.mainMaterial = pageMaterialFor(material, color);

    // Writing no depth makes draw ORDER the thing that decides what is on top,
    // so say it explicitly rather than relying on the page happening to be
    // built before any content.
    try { visual.renderOrder = -10; } catch (e) { /* ignore */ }

    // Colour also goes through the per-visual overrides, which reach uniforms
    // the cloned pass may not expose under this shader graph. Harmless when the
    // clone already carries it.
    const tries = [
        () => (visual.mainPassOverrides as any).baseColor = color,
        () => (visual.mainPassOverrides as any).emissiveColor = color,
        () => (visual.mainPassOverrides as any).emissiveIntensity = 1.0,
    ];
    for (const t of tries) {
        try { t(); } catch (e) { /* ignore */ }
    }
    return obj;
}

// ─── Options ────────────────────────────────────────────────────────────

export interface PageOptions {
    /** Material to clone the page's visuals from. Unlit. */
    material: Material;
    /** Half-extents of the sheet in world units. Portrait means halfH > halfW. */
    halfWidth: number;
    halfHeight: number;
    /** Grid pitch in world units, and how many minor squares per major line. */
    pitch: number;
    majorEvery: number;
    /** Line weights in world units. */
    minorWeight: number;
    majorWeight: number;
    borderWeight: number;
    /** RGBA. Alpha 0 on any of these switches that layer off entirely. */
    paperColor: vec4;
    minorColor: vec4;
    majorColor: vec4;
    borderColor: vec4;
    /** Local z of the paper. Grid and border stack in front of it by 0.05 each,
     *  so all three stay behind content drawn at z ≈ 0. */
    z: number;
}

export const PAGE_DEFAULTS = {
    // Portrait, ISO-ish 1:1.41. Deliberately taller than the ±27 vertical FOV
    // budget: a real book at reading distance does not fit in your field of
    // view either, and world-locking the book means the reader can step back.
    halfWidth: 26,
    halfHeight: 37,
    pitch: 4,
    majorEvery: 5,
    minorWeight: 0.12,
    majorWeight: 0.22,
    borderWeight: 0.35,
    z: -0.6,
};

/** Draw a page under `parent` and return its container. Destroy the container
 *  to remove the page. Safe to call repeatedly. */
export function buildPage(parent: SceneObject, opts: PageOptions): SceneObject {
    const page = global.scene.createSceneObject('Page');
    page.setParent(parent);

    const W = opts.halfWidth, H = opts.halfHeight;
    const zPaper = opts.z;
    const zGrid = opts.z + 0.05;
    const zRule = opts.z + 0.10;

    // Paper.
    if (opts.paperColor.a > 0) {
        const v: number[] = [], i: number[] = [];
        pushRect(v, i, -W, -H, W, H, zPaper);
        emitMesh(page, 'PagePaper', v, i, opts.material, opts.paperColor);
    }

    // Grid. Both weights are accumulated in one pass over the same line
    // positions, so a major line is never also drawn as a minor one — two
    // coincident quads at different alphas is a visibly different colour from
    // either, and the seam only shows on some lines.
    const minorV: number[] = [], minorI: number[] = [];
    const majorV: number[] = [], majorI: number[] = [];

    const line = (isMajor: boolean, x0: number, y0: number, x1: number, y1: number) => {
        if (isMajor) pushRect(majorV, majorI, x0, y0, x1, y1, zGrid);
        else         pushRect(minorV, minorI, x0, y0, x1, y1, zGrid);
    };

    if (opts.pitch > 0) {
        const nx = Math.floor(W / opts.pitch);
        const ny = Math.floor(H / opts.pitch);
        for (let k = -nx; k <= nx; k++) {
            const isMajor = opts.majorEvery > 0 && k % opts.majorEvery === 0;
            const hw = (isMajor ? opts.majorWeight : opts.minorWeight) / 2;
            const x = k * opts.pitch;
            line(isMajor, x - hw, -H, x + hw, H);
        }
        for (let k = -ny; k <= ny; k++) {
            const isMajor = opts.majorEvery > 0 && k % opts.majorEvery === 0;
            const hw = (isMajor ? opts.majorWeight : opts.minorWeight) / 2;
            const y = k * opts.pitch;
            line(isMajor, -W, y - hw, W, y + hw);
        }
    }

    if (opts.minorColor.a > 0) emitMesh(page, 'PageGridMinor', minorV, minorI, opts.material, opts.minorColor);
    if (opts.majorColor.a > 0) emitMesh(page, 'PageGridMajor', majorV, majorI, opts.material, opts.majorColor);

    // Border rule — four bars, drawn inside the sheet so the page never grows
    // past the half-extents its caller budgeted for.
    if (opts.borderColor.a > 0 && opts.borderWeight > 0) {
        const t = opts.borderWeight;
        const v: number[] = [], i: number[] = [];
        pushRect(v, i, -W,     H - t, W,      H,     zRule);  // top
        pushRect(v, i, -W,    -H,     W,     -H + t, zRule);  // bottom
        pushRect(v, i, -W,    -H,    -W + t,  H,     zRule);  // left
        pushRect(v, i,  W - t, -H,    W,      H,     zRule);  // right
        emitMesh(page, 'PageRule', v, i, opts.material, opts.borderColor);
    }

    return page;
}

// ─── Standalone experiment component ────────────────────────────────────
//
// Drop this on a SceneObject next to MatematexBookOfMath, assign the same
// unlit material the book uses, and tune. It draws nothing but the page, so
// what you are judging is the page.

// Every default below lives in the @input DECORATOR, not in a TypeScript field
// initializer. A field initializer does not reach the Inspector: Lens Studio
// stores the component's inputs in the scene, and an input the decorator gave
// no default gets stored as 0 — so `halfWidth: number = 26` ships a page of
// zero size and draws nothing at all.
@component
export class MatematexPage extends BaseScriptComponent {

    @input
    @hint("Unlit material — the same one assigned to MatematexBookOfMath.lineMaterial.")
    material: Material;

    @input('float', '26')
    @hint("Half-width of the sheet in world units. 26 with halfHeight 37 is portrait 1:1.41.")
    halfWidth: number;

    @input('float', '37')
    @hint("Half-height of the sheet. Larger than the ±27 vertical FOV budget on purpose — see the header.")
    halfHeight: number;

    @input('float', '4')
    @hint("Grid pitch in world units. 4 gives ~13 columns on a 26-half-width page.")
    pitch: number;

    @input('int', '5')
    @hint("Every Nth line is drawn heavier. 5 is the school-exercise-book convention. 0 disables major lines.")
    majorEvery: number;

    @input('float', '0.12')
    minorWeight: number;

    @input('float', '0.22')
    majorWeight: number;

    @input('float', '0.35')
    borderWeight: number;

    // ─── Palette ────────────────────────────────────────────────────────
    //
    // WARM NEUTRAL GREY, and that is a constraint, not a taste.
    //
    // The proofs own four hues — COLOR_BLUE (0.40, 0.65, 1.00), COLOR_RED,
    // COLOR_GREEN and COLOR_AMBER in MatematexProof.ts — and they use them to
    // carry MEANING: which piece moved, which region is congruent to which.
    // The page's grid was first drawn at (0.45, 0.62, 0.95), which is
    // COLOR_BLUE to within a rounding error. A figure whose blue piece is the
    // same colour as the paper it is printed on has lost the distinction it
    // was drawn to make.
    //
    // So the sheet takes the one part of the space the proofs left empty: no
    // hue at all, biased slightly warm so it reads as paper stock rather than
    // as a fifth signal. Anything chosen here should stay clear of those four.

    @input('vec4', '{0.10, 0.095, 0.085, 0.55}')
    @hint("Paper fill RGBA — a warm near-black. Alpha 0 draws no paper at all, which is the old transparent look, kept one input away for comparison.")
    paperColor: vec4;

    @input('vec4', '{0.58, 0.55, 0.50, 0.30}')
    @hint("Minor grid line RGBA. Neutral warm grey on purpose — see the palette note above. Do not make this blue: that is the proofs' colour.")
    minorColor: vec4;

    @input('vec4', '{0.68, 0.64, 0.58, 0.50}')
    @hint("Major grid line RGBA — every Nth line, heavier and slightly brighter.")
    majorColor: vec4;

    @input('vec4', '{0.80, 0.76, 0.70, 0.75}')
    @hint("Border rule RGBA. This is the element that actually makes it read as a page.")
    borderColor: vec4;

    @input('float', '-0.6')
    @hint("Local Z of the paper. Grid sits 0.05 in front, rule 0.10, so content at z 0 stays on top.")
    pageZ: number;

    @input('float', '39')
    @hint("Local Z this object moves itself to on awake, so the page lands on the same plane as the book's content. Must match MatematexBookOfMath.containerWorldZ.")
    planeZ: number;

    private page: SceneObject | null = null;

    onAwake(): void {
        if (!this.material) {
            print('[MatematexPage] ERROR: assign material');
            return;
        }
        // Position ourselves rather than relying on the stored transform: the
        // book's content plane is at containerWorldZ, and a page authored on a
        // different plane is one the formula floats in front of or behind.
        // Doing it here also means dropping this component on a fresh object
        // lands it correctly with nothing to set by hand.
        const t = this.getSceneObject().getTransform();
        const p = t.getLocalPosition();
        t.setLocalPosition(new vec3(p.x, p.y, this.planeZ));
        this.rebuild();
    }

    /** Tear down and redraw. Called from onAwake; exposed so the book (or a
     *  live-tuning script) can re-issue the page after changing an input. */
    rebuild(): void {
        if (this.page) { this.page.destroy(); this.page = null; }
        this.page = buildPage(this.getSceneObject(), {
            material: this.material,
            halfWidth: this.halfWidth,
            halfHeight: this.halfHeight,
            pitch: this.pitch,
            majorEvery: this.majorEvery,
            minorWeight: this.minorWeight,
            majorWeight: this.majorWeight,
            borderWeight: this.borderWeight,
            paperColor: this.paperColor,
            minorColor: this.minorColor,
            majorColor: this.majorColor,
            borderColor: this.borderColor,
            z: this.pageZ,
        });
        const kids = this.page.getChildrenCount();
        // Report the depth state, not just the geometry. "4 layers drawn" was
        // true the whole time the sheet was hiding every proof.
        let depthWrite = 'unknown';
        try {
            const first = this.page.getChild(0);
            const v = first.getComponent('Component.RenderMeshVisual') as RenderMeshVisual;
            depthWrite = `${(v.mainMaterial as any).mainPass.depthWrite}`;
        } catch (e) { /* ignore */ }
        print(`[MatematexPage] ${this.halfWidth * 2}x${this.halfHeight * 2} units, ` +
              `pitch ${this.pitch}, ${kids} layers drawn, depthWrite=${depthWrite}`);
    }
}

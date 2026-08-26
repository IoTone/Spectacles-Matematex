// MatematexCover.ts — The closed book.
//
// A slab, a title, and mathematical symbols falling down the face of it.
// The lens opens here: a book that opens on its table of contents is a slide
// deck, and the cover is what tells a reader what kind of book this is before
// they read a word.
//
// THE SLAB
//
// Built rather than imported. On an additive display a lit, opaque, textured
// prop is a bright rectangle floating in the wearer's room — so the cover is a
// dim fill that only tints, and its EDGES are what make it read as a solid.
// Vertex colours carry a baked light so the spine and fore-edge separate
// without depending on scene lights this lens does not control.
//
// THE RAIN — PRE-RENDER, THEN RECYCLE
//
// This is the whole design, and it is a performance decision before it is a
// visual one:
//
//   1. At build, every drop lays out its own small set of LaTeX fragments
//      through the same bridge the book uses — each becomes a parented sub-tree
//      of glyph objects, all disabled but one. This happens ONCE. (A single
//      shared pool would be tidier, but a scene object cannot be parented in
//      two places, so it would have to be cloned per drop anyway.)
//   2. Per frame, move transforms. Nothing else.
//   3. When a drop falls off the bottom, move it back to the top and show a
//      DIFFERENT fragment by flipping which sub-tree is enabled.
//
// What must never happen in step 3 or 4 is a write to `.text` or a re-run of
// the layout. Writing `.text` on a Component.Text forces that component to
// re-lay-out; doing it for seventy objects every frame is exactly the kind of
// thing that turns a 35 ms frame into a dropped one. Recycling transforms is
// nearly free. Re-laying out glyphs is not.

import { MatematexLayoutWalker, MatematexSceneRenderer, applyTextColor } from './MatematexBridge';
import { getTextWidthEm } from './KaTeXFontMetrics';
import { getSpaceDocument } from './SpaceDOMAdapter';
// @ts-ignore — katex_bundle is @ts-nocheck
import katex from './katex_bundle';

/** What falls. Short, recognisable, and drawn from the whole of the book's
 *  subject matter rather than one chapter — the cover is the whole book. */
const RAIN_LATEX: string[] = [
    '\\int', '\\sum', '\\nabla', '\\partial', '\\infty', '\\pi',
    '\\alpha', '\\beta', '\\lambda', '\\theta', '\\phi', '\\Omega',
    '\\sqrt{2}', 'e^{i\\pi}', 'dx', '\\pm', '\\times', '\\equiv',
    '0', '1', '2', '3', '7', '9',
];

interface Drop {
    /** The pool sub-trees this drop can show; exactly one is enabled. */
    faces: SceneObject[];
    shown: number;
    obj: SceneObject;
    x: number;
    y: number;
    speed: number;
}

@component
export class MatematexCover extends BaseScriptComponent {

    @input
    @hint("Unlit material — the same one assigned to MatematexBookOfMath.lineMaterial.")
    material: Material;

    @input
    @hint("Text3D template to clone glyphs from — the same one the book uses.")
    templateText: SceneObject;

    // ─── Geometry ───────────────────────────────────────────────────────

    @input('float', '20')
    @hint("Half-width of the cover slab.")
    coverHalfWidth: number;

    @input('float', '28')
    @hint("Half-height of the cover slab. Portrait, like the pages inside.")
    coverHalfHeight: number;

    @input('float', '3')
    @hint("Half-depth — the thickness of the closed book.")
    coverHalfDepth: number;

    @input('float', '39')
    @hint("Local Z this object moves itself to on awake. Must match MatematexBookOfMath.containerWorldZ.")
    planeZ: number;

    @input('vec4', '{0.12, 0.16, 0.30, 0.22}')
    @hint("Cover fill RGBA. Low alpha on purpose: enough to tint, not enough to block the room.")
    coverColor: vec4;

    @input('vec4', '{0.65, 0.78, 1.00, 0.85}')
    @hint("Edge rule RGBA. On an additive display the EDGES are what make a slab read as a solid.")
    edgeColor: vec4;

    @input('vec4', '{1.00, 0.78, 0.35, 1.00}')
    @hint("Colour of the XR superscript. Keep it the same as MatematexBookOfMath.titleAccentColor — cover and title page are the same title and should look it.")
    titleAccentColor: vec4;

    // ─── Rain ───────────────────────────────────────────────────────────

    @input('int', '9')
    @hint("Columns of falling symbols across the cover face. columns x perColumn x facesPerDrop KaTeX layouts run once, when the cover is first shown — the build time is printed.")
    columns: number;

    @input('int', '4')
    @hint("Symbols per column. columns x perColumn is the number of drops.")
    perColumn: number;

    @input('float', '9.0')
    @hint("Base fall speed in world units per second. Each column varies 0.6-1.4x so they never phase-lock.")
    fallSpeed: number;

    @input('float', '0.5')
    @hint("Glyph scale for the rain, relative to the book's own text.")
    rainScale: number;

    @input('int', '2')
    @hint("Pre-laid-out fragments per drop. One is enabled at a time and they cycle on recycle, so this is how much variety a column has before it repeats. Every one costs a KaTeX layout at build.")
    facesPerDrop: number;

    @input('bool', 'true')
    rainEnabled: boolean;

    private root: SceneObject | null = null;
    private rainRoot: SceneObject | null = null;
    private drops: Drop[] = [];
    private built: boolean = false;

    onAwake(): void {
        if (!this.material || !this.templateText) {
            print('[MatematexCover] ERROR: assign material and templateText');
            return;
        }
        const t = this.getSceneObject().getTransform();
        const p = t.getLocalPosition();
        t.setLocalPosition(new vec3(p.x, p.y, this.planeZ));
    }

    /** Build on first show rather than at awake: the cover costs a few hundred
     *  objects, and paying for it during lens startup delays the first frame
     *  the wearer sees. */
    show(): void {
        if (!this.built) { this.build(); this.built = true; }
        if (this.root) this.root.enabled = true;
    }

    hide(): void {
        if (this.root) this.root.enabled = false;
    }

    private build(): void {
        const t0 = Date.now();
        this.root = global.scene.createSceneObject('Cover');
        this.root.setParent(this.getSceneObject());

        this.buildSlab();
        this.buildType();
        if (this.rainEnabled) this.buildRain();

        this.createEvent('UpdateEvent').bind(() => this.onUpdate());
        print(`[MatematexCover] built in ${Date.now() - t0}ms`);
    }

    // ─── The slab ───────────────────────────────────────────────────────

    private buildSlab(): void {
        const W = this.coverHalfWidth, H = this.coverHalfHeight, D = this.coverHalfDepth;

        // Front face plus a spine down the left, seen at a slight yaw. Faces are
        // shaded by which way they point so the solid has form under an unlit
        // material — the same reason MatematexProof bakes a Lambert term into
        // its vertex colours.
        this.quad([[-W,-H,D],[W,-H,D],[W,H,D],[-W,H,D]], this.coverColor, 1.00, 'CoverFront');
        this.quad([[-W,-H,-D],[-W,-H,D],[-W,H,D],[-W,H,-D]], this.coverColor, 0.72, 'CoverSpine');
        this.quad([[-W,H,-D],[-W,H,D],[W,H,D],[W,H,-D]], this.coverColor, 0.88, 'CoverTop');

        // The edges. These, not the fill, are what say "solid" on a display
        // that can only add light.
        const e = 0.28;
        const bars: number[][][] = [
            [[-W,H-e,D],[W,H-e,D],[W,H,D],[-W,H,D]],
            [[-W,-H,D],[W,-H,D],[W,-H+e,D],[-W,-H+e,D]],
            [[-W,-H,D],[-W+e,-H,D],[-W+e,H,D],[-W,H,D]],
            [[W-e,-H,D],[W,-H,D],[W,H,D],[W-e,H,D]],
        ];
        for (let i = 0; i < bars.length; i++) {
            this.quad(bars[i], this.edgeColor, 1.0, `CoverEdge${i}`);
        }
    }

    private quad(pts: number[][], color: vec4, shade: number, name: string): void {
        const verts: number[] = [];
        for (const v of pts) verts.push(v[0], v[1], v[2]);
        const builder = new MeshBuilder([{ name: 'position', components: 3 }]);
        builder.topology = MeshTopology.Triangles;
        builder.indexType = MeshIndexType.UInt16;
        builder.appendVerticesInterleaved(verts);
        builder.appendIndices([0, 1, 2, 0, 2, 3]);
        if (!builder.isValid()) return;
        builder.updateMesh();

        const obj = global.scene.createSceneObject(name);
        obj.setParent(this.root);
        const visual = obj.createComponent('Component.RenderMeshVisual') as RenderMeshVisual;
        visual.mesh = builder.getMesh();

        const c = new vec4(color.r * shade, color.g * shade, color.b * shade, color.a);
        visual.mainMaterial = this.materialFor(c);
        const tries = [
            () => (visual.mainPassOverrides as any).baseColor = c,
            () => (visual.mainPassOverrides as any).emissiveColor = c,
            () => (visual.mainPassOverrides as any).emissiveIntensity = 1.0,
        ];
        for (const t of tries) { try { t(); } catch (e) { /* ignore */ } }
    }

    /** A cloned, coloured material with depth writing off — the same reasoning
     *  as MatematexPage: the rain is drawn at a different depth from the slab,
     *  and a depth-writing slab would cull it. */
    private materialFor(color: vec4): Material {
        const src = this.material as any;
        const cache: { [k: string]: Material } =
            src.__mtxCoverMatCache || (src.__mtxCoverMatCache = {});
        const key = `${color.r},${color.g},${color.b},${color.a}`;
        if (cache[key]) return cache[key];

        let mat: Material = this.material;
        try {
            const cloned = src.clone?.();
            if (cloned) {
                mat = cloned as Material;
                const pass = (mat as any).mainPass;
                if (pass) {
                    try { pass.baseColor = color; } catch (e) { /* ignore */ }
                    try { pass.depthWrite = false; } catch (e) { /* ignore */ }
                }
            }
        } catch (e) { /* fall back to the shared material */ }
        cache[key] = mat;
        return mat;
    }

    // ─── Type ───────────────────────────────────────────────────────────

    private buildType(): void {
        const comp = this.textComp(this.templateText);
        if (!comp) { print('[MatematexCover] no Text3D on templateText'); return; }
        const base = this.templateText.getTransform().getLocalScale();

        // The title is composed from three pieces so XR can be raised and
        // tinted — Text3D colours and positions a WHOLE component, so a mixed
        // line has to be several. Same construction as the title page's, and
        // deliberately so: cover and half title are the same title.
        //
        // 0.48 measures ~28 units wide against the cover's ±20 face.
        const BIG = 0.48;
        const SUP = BIG * 0.62;
        const parts: { text: string; scale: number; accent: boolean }[] = [
            { text: 'THE ',          scale: BIG, accent: false },
            { text: 'XR',            scale: SUP, accent: true  },
            { text: ' BOOK OF MATH', scale: BIG, accent: false },
        ];
        const widths = parts.map(p => this.textWidth(p.text, p.scale));
        let total = 0;
        for (const w of widths) total += w;
        const raise = 5.0 * (0.42 * BIG - 0.20 * SUP);

        let cursor = -total / 2;
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            this.coverText(comp, base, p.text, cursor + widths[i] / 2,
                           9 + (p.accent ? raise : 0), p.scale,
                           p.accent ? this.titleAccentColor : this.edgeColor);
            cursor += widths[i];
        }
        if (total / 2 > this.coverHalfWidth) {
            print(`[MatematexCover] WARNING: title is ${total.toFixed(0)} units ` +
                  `wide, past the ±${this.coverHalfWidth} cover face`);
        }

        const lines: { text: string; scale: number; y: number }[] = [
            { text: 'First Edition',               scale: 0.30, y:   2 },
            { text: '80 theorems · four chapters', scale: 0.22, y: -16 },
            { text: 'Built with Matematex',        scale: 0.20, y: -21 },
        ];
        for (const l of lines) {
            this.coverText(comp, base, l.text, 0, l.y, l.scale, this.edgeColor);
        }
    }

    /** Width of a line of template text on the cover, in cover units. Same
     *  model the book uses: one em draws 5 world units at scale 1. */
    private textWidth(text: string, scale: number): number {
        return getTextWidthEm(text, false, 'main', false) * 5.0 * scale;
    }

    private coverText(comp: any, base: vec3, text: string,
                      x: number, y: number, scale: number, color: vec4): void {
        const obj = global.scene.createSceneObject('CoverType');
        obj.setParent(this.root);
        const c: any = (obj as any).copyComponent(comp);
        if (!c) { obj.destroy(); return; }
        c.text = text;
        applyTextColor(c, color);
        obj.getTransform().setLocalPosition(
            new vec3(x, y, this.coverHalfDepth + 0.4));
        obj.getTransform().setLocalScale(new vec3(
            base.x * 3.951 * scale,
            base.y * 3.951 * scale,
            base.z * 3.951 * scale));
    }

    private textComp(obj: SceneObject): any {
        for (const t of ['Component.Text3D', 'Component.Text', 'Component.Text 3D']) {
            try { const c = obj.getComponent(t as any); if (c) return c; } catch (e) { /* ignore */ }
        }
        return null;
    }

    // ─── The rain ───────────────────────────────────────────────────────

    private buildRain(): void {
        const doc = getSpaceDocument();
        const comp = this.textComp(this.templateText);
        if (!doc || !comp) { print('[MatematexCover] rain skipped — no DOM or template'); return; }

        this.rainRoot = global.scene.createSceneObject('CoverRain');
        this.rainRoot.setParent(this.root);

        const tmplScale = this.templateText.getTransform().getLocalScale();
        const W = this.coverHalfWidth, H = this.coverHalfHeight;
        const step = (W * 2 - 6) / Math.max(1, this.columns - 1);
        let laidOut = 0;

        for (let c = 0; c < this.columns; c++) {
            const x = -W + 3 + c * step;
            // Varying speeds so the columns never phase-lock into a visible
            // rank. Derived from the index rather than randomised, so the cover
            // looks the same every launch.
            const speed = this.fallSpeed * (0.6 + 0.8 * (((c * 37) % 100) / 100));

            for (let k = 0; k < this.perColumn; k++) {
                const obj = global.scene.createSceneObject(`Drop${c}_${k}`);
                obj.setParent(this.rainRoot);

                // Each drop carries its OWN pre-laid-out fragments — one scene
                // object cannot be parented in two places, so a shared pool
                // would have to be cloned anyway. Laying them out here is the
                // one and only time KaTeX runs for the rain: from then on the
                // per-frame cost is a transform write and, on recycle, an
                // `enabled` flag.
                const faces: SceneObject[] = [];
                for (let f = 0; f < this.facesPerDrop; f++) {
                    const latex = RAIN_LATEX[(c * 7 + k * 3 + f * 5) % RAIN_LATEX.length];
                    const face = this.layoutFragment(doc, comp, tmplScale, latex, obj);
                    if (face) { face.enabled = false; faces.push(face); laidOut++; }
                }
                if (faces.length === 0) { obj.destroy(); continue; }
                faces[0].enabled = true;

                const y = H - (k * (H * 2) / this.perColumn);
                obj.getTransform().setLocalPosition(
                    new vec3(x, y, this.coverHalfDepth + 0.2));
                this.drops.push({ faces, shown: 0, obj, x, y, speed });
            }
        }
        print(`[MatematexCover] rain: ${this.drops.length} drops, ${laidOut} fragments laid out`);
    }

    /** Lay out one LaTeX fragment under `parent` and return its holder. */
    private layoutFragment(doc: any, comp: any, tmplScale: vec3,
                           latex: string, parent: SceneObject): SceneObject | null {
        const holder = global.scene.createSceneObject('Frag');
        holder.setParent(parent);
        try {
            const wrapper = doc.createElement('div');
            katex.render(latex, wrapper, { throwOnError: false, displayMode: false });
            const html = this.findFirstWithClass(wrapper, 'katex-html');
            if (!html) { holder.destroy(); return null; }

            const walker = new MatematexLayoutWalker();
            const result = walker.layout(html as any, 5.0 * this.rainScale);

            const renderer = new MatematexSceneRenderer();
            renderer.render(
                result.items,
                holder,
                10,
                this.edgeColor,
                this.material,
                comp,
                tmplScale,
                3.951 * this.rainScale,
                null,
                null,
                null,
            );
            // Centre the fragment on its holder so a column reads as a column
            // rather than as a left-aligned ragged edge.
            holder.getTransform().setLocalPosition(new vec3(-result.width / 2, 0, 0));
            return holder;
        } catch (e) {
            holder.destroy();
            return null;
        }
    }

    private findFirstWithClass(node: any, cls: string): any {
        for (const child of node._childNodes || []) {
            if (child.nodeType !== 1) continue;
            const c = child.getAttribute && child.getAttribute('class');
            if (c && c.split(/\s+/).indexOf(cls) >= 0) return child;
            const found = this.findFirstWithClass(child, cls);
            if (found) return found;
        }
        return null;
    }

    private onUpdate(): void {
        if (!this.root || !this.root.enabled || this.drops.length === 0) return;
        const dt = getDeltaTime();
        const H = this.coverHalfHeight;

        for (const d of this.drops) {
            d.y -= d.speed * dt;
            if (d.y < -H) {
                // Recycled: back to the top, showing a different fragment. The
                // swap is an `enabled` flag on pre-built geometry — no layout,
                // no `.text` write, nothing that costs more than a boolean.
                d.y += H * 2;
                d.faces[d.shown].enabled = false;
                d.shown = (d.shown + 1) % d.faces.length;
                d.faces[d.shown].enabled = true;
            }
            d.obj.getTransform().setLocalPosition(
                new vec3(d.x, d.y, this.coverHalfDepth + 0.2));
        }
    }
}

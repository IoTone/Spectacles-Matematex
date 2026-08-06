// MatematexTextColor.ts — tinting cloned text components.
//
// Its own module rather than living in MatematexBridge, because both the bridge
// and the proof renderer need it, and MatematexBridge drags in the whole KaTeX
// bundle. Importing it from MatematexProof would have cost the proof layer its
// "pure TS, runnable under node" property — which is what lets proof data be
// validated outside Lens Studio.

// Colour parameters worth trying on a text material, in order.
//
// Lens Studio's stock **Text 3D** material is a shader GRAPH, not a lit/unlit
// surface: it has no `baseColor` or `emissiveColor` whatsoever. Its palette is
// a front cap, a back cap, and inner/outer edges, each with its own colour —
// which is why the shipped `Text3D 4` renders a cyan→yellow gradient
// (frontCapStartingColor = 0.13,1.00,0.82) and why assigning `baseColor` to it
// changed precisely nothing.
//
// Setting every cap and both ends of every edge to the same value flattens the
// gradient to a solid colour. Names are case-sensitive and the capitalisation
// below is Lens Studio's own, inconsistencies included.
const TEXT_COLOR_PARAMS = [
    'baseColor', 'emissiveColor', 'color',
    'frontCapStartingColor', 'frontCapEndingColor',
    'backCapStartingColor', 'backCapEndingColor',
    'InnerEdgeStartingColor', 'InnerEdgeEndingColor',
    'outerEdgeStartingColor', 'outerEdgeEndingColor',
];

/** Tint a cloned text component to `color`, whichever text type it is.
 *
 *  `Component.Text` (2D) exposes `textFill`. `Component.Text3D` does NOT — its
 *  colour comes from its *material*. The renderer only ever tried the
 *  `textFill` path, wrapped in a try/catch, so on Text3D it threw, was
 *  swallowed, and every glyph silently kept the template material's colour.
 *  That is why `textColor` appeared to do nothing while sqrt radicals — which
 *  take the RenderMeshVisual `mainPassOverrides` path — came out correct.
 *
 *  Materials are shared assets, so we can't tint the template's own: that would
 *  repaint the template and everything else cloned from it. Instead clone once
 *  per distinct colour and cache the clone on the source material. */
export function applyTextColor(comp: any, color: vec4): void {
    if (!comp) return;

    // 2D Text: per-component fill, no material juggling needed.
    try {
        if (comp.textFill) {
            try { comp.textFill.mappingType = 0; } catch (e) { /* ignore */ }
            comp.textFill.color = color;
            return;
        }
    } catch (e) { /* fall through to the material path */ }

    // Text3D: colour lives on the material.
    try {
        const src = comp.mainMaterial;
        if (!src) return;
        const key = `${color.r},${color.g},${color.b},${color.a}`;
        const cache = (src as any).__mtxTextColorCache || ((src as any).__mtxTextColorCache = {});
        let mat = cache[key];
        if (!mat) {
            const cloned = (src as any).clone?.();
            mat = cloned || src;
            const pass = (mat as any).mainPass;
            if (pass) {
                let hit = 0;
                for (const prop of TEXT_COLOR_PARAMS) {
                    try {
                        if (pass[prop] !== undefined) { pass[prop] = color; hit++; }
                    } catch (e) { /* ignore */ }
                }
                if (hit === 0) {
                    print('[Matematex] applyTextColor: material exposes none of the known ' +
                          'colour parameters — text will keep its material colour');
                }
            }
            cache[key] = mat;
        }
        comp.mainMaterial = mat;
    } catch (e) { /* ignore */ }
}

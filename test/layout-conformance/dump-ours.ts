// dump-ours.ts — Run the Matematex layout walker under node and emit its
// per-glyph geometry as JSON.
//
//   npx ts-node --transpile-only test/layout-conformance/dump-ours.ts > ours.json
//   npx ts-node --transpile-only test/layout-conformance/dump-ours.ts --ids=all
//
// emToWorld is fixed at 1.0 so every coordinate comes out directly in em, which
// is the unit the browser reference normalises to. The other knobs default to
// the values the shipping scene actually carries (see NOTE below).

import './ls-stubs';

import { installSpaceDOMAdapter, getSpaceDocument } from '../../Matematex/Assets/ProjectScripts/SpaceDOMAdapter';
installSpaceDOMAdapter();

// @ts-ignore — katex_bundle is @ts-nocheck
import katex from '../../Matematex/Assets/ProjectScripts/katex_bundle';

import {
    SpaceElement,
    SpaceNode,
    ELEMENT_NODE,
} from '../../Matematex/Assets/ProjectScripts/SpaceDOM';

import { MatematexLayoutWalker, LayoutItem } from '../../Matematex/Assets/ProjectScripts/MatematexBridge';

import { formulasFor, idsFromArgv } from './formulas';

// NOTE — three different values for sqrtWidthScale exist in the tree:
//   MatematexBridge.MatematexLayoutWalker._sqrtWidthScale = 0.5   (code default)
//   MatematexBookOfMath.@input sqrtWidthScale             = 1.0   (input default)
//   the shipping scene's stored component value           = 0.85
// We use the scene's value, because that's what a user actually sees. The drift
// is worth reconciling separately.
const CONFIG = {
    emToWorld: 1.0,          // 1 world unit == 1 em, so output is em-space
    displayMode: true,       // matches the scene's displayMode input
    layoutWidthMargin: numArg('--width-margin', 1.0),
    sqrtWidthScale: numArg('--sqrt-scale', 1.0),
    // Must track MatematexLayoutWalker._italicMinGapEm's default, or the harness
    // measures a configuration nobody ships. Now 0 — the real italic correction
    // comes from KaTeX's inline margins. Override to compare compensator settings.
    italicMinGapEm: numArg('--italic-min-gap', 0),
};

function numArg(flag: string, dflt: number): number {
    const a = process.argv.find(x => x.startsWith(flag + '='));
    if (!a) return dflt;
    const v = parseFloat(a.slice(flag.length + 1));
    return isNaN(v) ? dflt : v;
}

function findFirstWithClass(node: SpaceNode, cls: string): SpaceElement | null {
    for (const child of (node as any)._childNodes) {
        if (child.nodeType !== ELEMENT_NODE) continue;
        const el = child as SpaceElement;
        const c = el.getAttribute('class');
        if (c && c.split(/\s+/).indexOf(cls) >= 0) return el;
        const found = findFirstWithClass(el, cls);
        if (found) return found;
    }
    return null;
}

function main(): void {
    const ids = idsFromArgv(process.argv);
    const formulas = formulasFor(ids);
    const doc = getSpaceDocument();
    if (!doc) throw new Error('SpaceDOM adapter did not install');

    const out: any = { generator: 'matematex-walker', config: CONFIG, formulas: [] };

    for (const f of formulas) {
        const record: any = { id: f.id, name: f.name, latex: f.latex };
        try {
            const wrapper = doc.createElement('div');
            // @ts-ignore
            katex.render(f.latex, wrapper, { throwOnError: true, displayMode: CONFIG.displayMode });

            const katexHtml = findFirstWithClass(wrapper as any, 'katex-html');
            if (!katexHtml) throw new Error('no .katex-html produced');

            const walker = new MatematexLayoutWalker();
            walker._layoutWidthMargin = CONFIG.layoutWidthMargin;
            walker._sqrtWidthScale = CONFIG.sqrtWidthScale;
            walker._italicMinGapEm = CONFIG.italicMinGapEm;
            const result = walker.layout(katexHtml as any, CONFIG.emToWorld);

            record.width = result.width;
            record.warnings = result.warnings;
            record.items = result.items.map((it: LayoutItem) => {
                const base: any = {
                    kind: it.kind,
                    x: round(it.x),
                    y: round(it.y),
                    scale: round(it.scale),
                };
                if (it.kind === 'text') {
                    base.text = it.text;
                    base.italic = it.italic;
                    if (it.bold) base.bold = true;
                    // Advance width, so the comparator can recover the pen
                    // position (x is the visual centre).
                    //
                    // Taken from the item, never recomputed. Only the walker
                    // knows which metrics table measured a glyph — a delimiter
                    // inside a `delimsizing size3` subtree is KaTeX_Size3, and
                    // `{text, italic}` alone cannot tell you that. This line
                    // used to call getTextWidthEm(it.text, it.italic), which
                    // silently fell back to Main and so reported every scaled
                    // delimiter as a layout error of half the width difference.
                    base.w = round(it.widthEm * it.scale);
                } else if (it.kind === 'line') {
                    base.width = round(it.width);
                    base.thickness = round(it.thickness);
                } else if (it.kind === 'svg') {
                    base.width = round(it.width);
                    base.height = round(it.height);
                }
                return base;
            });
        } catch (e: any) {
            record.error = e && e.message ? e.message : String(e);
            record.items = [];
        }
        out.formulas.push(record);
    }

    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

function round(n: number): number {
    return Math.round(n * 10000) / 10000;
}

main();

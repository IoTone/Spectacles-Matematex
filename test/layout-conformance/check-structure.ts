// check-structure.ts — Assert the walker loses no content, for all 80 formulas.
//
//   npx ts-node --transpile-only test/layout-conformance/check-structure.ts
//
// This is the node-side twin of the guard in MatematexBookOfMath.validateAll:
// every text node KaTeX produces must survive the walk. It needs no browser and
// no reference.json, so it works as a fast pre-commit / CI gate, while the full
// conformance diff covers positioning.
//
// Exits non-zero if any formula drops (or duplicates) content.

import './ls-stubs';

import { installSpaceDOMAdapter, getSpaceDocument } from '../../Matematex/Assets/ProjectScripts/SpaceDOMAdapter';
installSpaceDOMAdapter();

// @ts-ignore
import katex from '../../Matematex/Assets/ProjectScripts/katex_bundle';
import { SpaceElement, SpaceNode, ELEMENT_NODE } from '../../Matematex/Assets/ProjectScripts/SpaceDOM';
import {
    MatematexLayoutWalker,
    LayoutItem,
    countRenderableTextNodes,
} from '../../Matematex/Assets/ProjectScripts/MatematexBridge';
import { MATH_FORMULAS } from '../../Matematex/Assets/ProjectScripts/MathBookData';

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

const doc: any = getSpaceDocument();
let bad = 0;

for (const f of MATH_FORMULAS) {
    let expected = -1, actual = -1, err = '';
    try {
        const wrapper = doc.createElement('div');
        // @ts-ignore
        katex.render(f.latex, wrapper, { throwOnError: true, displayMode: true });
        const katexHtml = findFirstWithClass(wrapper, 'katex-html');
        if (!katexHtml) throw new Error('no .katex-html');

        const walker = new MatematexLayoutWalker();
        const result = walker.layout(katexHtml as any, 1.0);
        expected = countRenderableTextNodes(katexHtml as any);
        actual = result.items.filter((i: LayoutItem) => i.kind === 'text').length;
    } catch (e: any) {
        err = e && e.message ? e.message : String(e);
    }

    if (err) {
        console.log(`#${f.id} ${f.name}: ERROR ${err}`);
        bad++;
    } else if (actual !== expected) {
        const verb = actual < expected ? 'DROPPED' : 'DUPLICATED';
        console.log(`#${f.id} ${f.name}: ${verb} content — ${actual}/${expected} text items`);
        console.log(`     ${f.latex}`);
        bad++;
    }
}

console.log(`\nstructural check: ${MATH_FORMULAS.length - bad}/${MATH_FORMULAS.length} formulas intact`);
process.exit(bad > 0 ? 1 : 0);

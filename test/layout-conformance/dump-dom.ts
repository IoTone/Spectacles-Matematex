// dump-dom.ts — Print the KaTeX DOM tree the walker sees, for one formula.
//
//   npx ts-node --transpile-only test/layout-conformance/dump-dom.ts --ids=56
//   npx ts-node --transpile-only test/layout-conformance/dump-dom.ts --latex='\frac{a}{b}'
//
// Indispensable when a conformance failure needs explaining: it shows the class
// names, inline styles, and nesting the walker is actually dispatching on.

import './ls-stubs';

import { installSpaceDOMAdapter, getSpaceDocument } from '../../Matematex/Assets/ProjectScripts/SpaceDOMAdapter';
installSpaceDOMAdapter();

// @ts-ignore
import katex from '../../Matematex/Assets/ProjectScripts/katex_bundle';
import { ELEMENT_NODE, TEXT_NODE } from '../../Matematex/Assets/ProjectScripts/SpaceDOM';
import { formulasFor, idsFromArgv } from './formulas';

const STYLE_KEYS = [
    'top', 'height', 'width', 'minWidth', 'verticalAlign',
    'marginLeft', 'marginRight', 'paddingLeft', 'paddingRight',
    'left', 'borderBottomWidth',
];

function findByClass(node: any, cls: string): any {
    for (const c of node._childNodes) {
        if (c.nodeType !== ELEMENT_NODE) continue;
        const k = (c.getAttribute('class') || '').split(/\s+/);
        if (k.indexOf(cls) >= 0) return c;
        const f = findByClass(c, cls);
        if (f) return f;
    }
    return null;
}

function dump(node: any, depth = 0): void {
    for (const c of node._childNodes) {
        if (c.nodeType === TEXT_NODE) {
            const t = c.data;
            if (t && t !== '​') console.log('  '.repeat(depth) + JSON.stringify(t));
            continue;
        }
        if (c.nodeType !== ELEMENT_NODE) continue;
        const cls = c.getAttribute('class') || '';
        const st = c._style || {};
        const styles = STYLE_KEYS.filter(k => st[k] != null).map(k => `${k}=${st[k]}`).join(' ');
        console.log('  '.repeat(depth) + `<${c.localName}${cls ? ` .${cls.split(/\s+/).join('.')}` : ''}${styles ? '  ' + styles : ''}>`);
        dump(c, depth + 1);
    }
}

const doc: any = getSpaceDocument();
const latexArg = process.argv.find(a => a.startsWith('--latex='));
const targets = latexArg
    ? [{ id: 0, name: 'ad-hoc', latex: latexArg.slice('--latex='.length) }]
    : formulasFor(idsFromArgv(process.argv));

for (const f of targets) {
    console.log(`\n=== #${f.id} ${f.name}\n    ${f.latex}\n`);
    const wrapper = doc.createElement('div');
    // @ts-ignore
    katex.render(f.latex, wrapper, { throwOnError: true, displayMode: true });
    const html = findByClass(wrapper, 'katex-html');
    if (!html) { console.log('  (no .katex-html)'); continue; }
    dump(html);
}

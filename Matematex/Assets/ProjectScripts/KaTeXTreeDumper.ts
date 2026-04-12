// KaTeXTreeDumper.ts — Phase 2 exploration tool
//
// Walks the SpaceDOM tree that KaTeX.render() produces and prints a
// human-readable structured dump. The output reveals exactly how KaTeX
// encodes positioning, sizing, and content via tags / classes / styles
// for each LaTeX construct.
//
// This data informs the design of the KaTeX-to-SVG bridge in Phase 2.

import { installSpaceDOMAdapter, getSpaceDocument } from './SpaceDOMAdapter';
installSpaceDOMAdapter();

// @ts-ignore
import katex from './katex_bundle';

import {
    SpaceElement,
    SpaceText,
    SpaceNode,
    ELEMENT_NODE,
    TEXT_NODE,
} from './SpaceDOM';

interface DumpExpr {
    name: string;
    latex: string;
}

@component
export class KaTeXTreeDumper extends BaseScriptComponent {

    @input
    @hint("Maximum depth to dump (0 = unlimited)")
    private maxDepth: number = 0;

    @input
    @hint("Skip the outer .katex / .katex-html wrappers (drill into .base)")
    private skipWrappers: boolean = true;

    @input
    @hint("Show only structural attrs (class, style); hide aria-* and data-*")
    private terseAttrs: boolean = true;

    private exprs: DumpExpr[] = [
        { name: "Variable", latex: "x" },
        { name: "Superscript", latex: "x^2" },
        { name: "Subscript", latex: "a_n" },
        { name: "Fraction", latex: "\\frac{1}{2}" },
        { name: "SquareRoot", latex: "\\sqrt{x}" },
        { name: "Equation", latex: "E = mc^2" },
        { name: "GreekLetter", latex: "\\alpha" },
    ];

    onAwake(): void {
        const doc = getSpaceDocument();
        if (!doc) {
            print("[KaTeXTreeDumper] FATAL: SpaceDOM not installed");
            return;
        }

        print("[KaTeXTreeDumper] ====== Phase 2 Exploration: KaTeX SpaceDOM Output ======");

        for (const expr of this.exprs) {
            this.dumpExpression(expr);
        }

        print("[KaTeXTreeDumper] ====== End of Dump ======");
    }

    private dumpExpression(expr: DumpExpr): void {
        print(`\n[KaTeXTreeDumper] ========================================`);
        print(`[KaTeXTreeDumper] ${expr.name}: ${expr.latex}`);
        print(`[KaTeXTreeDumper] ========================================`);

        const doc = getSpaceDocument()!;
        const container = doc.createElement('div');

        try {
            // @ts-ignore
            katex.render(expr.latex, container, { throwOnError: true });
        } catch (e: any) {
            print(`[KaTeXTreeDumper] FAIL to render: ${e.message || e}`);
            return;
        }

        // Find the root .katex element
        let root: SpaceNode = container;
        if (this.skipWrappers) {
            // Drill into .katex > .katex-html > .base
            const katexEl = this.findFirstWithClass(container, 'katex');
            if (katexEl) {
                const html = this.findFirstWithClass(katexEl, 'katex-html');
                if (html) {
                    root = html;
                }
            }
        }

        this.dumpNode(root, 0);
    }

    private findFirstWithClass(node: SpaceNode, cls: string): SpaceElement | null {
        for (const child of node._childNodes) {
            if (child.nodeType === ELEMENT_NODE) {
                const el = child as SpaceElement;
                const elClass = el.getAttribute('class') ?? '';
                if (elClass.split(/\s+/).indexOf(cls) >= 0) {
                    return el;
                }
                const found = this.findFirstWithClass(el, cls);
                if (found) return found;
            }
        }
        return null;
    }

    private dumpNode(node: SpaceNode, depth: number): void {
        if (this.maxDepth > 0 && depth > this.maxDepth) return;

        const indent = '  '.repeat(depth);

        if (node.nodeType === TEXT_NODE) {
            const text = node as SpaceText;
            const data = text.data;
            // Show non-empty text content (but escape newlines)
            if (data && data.trim().length > 0) {
                const escaped = data.replace(/\n/g, '\\n');
                print(`${indent}#text "${escaped}"`);
            }
            return;
        }

        if (node.nodeType !== ELEMENT_NODE) return;

        const el = node as SpaceElement;
        const tag = el.localName;

        // Build summary line: <tag class="..." style="...">
        const parts: string[] = [tag];

        const classAttr = el.getAttribute('class');
        if (classAttr) {
            parts.push(`class="${classAttr}"`);
        }

        // Inline style — read from the .style property bag if set
        const styleObj = (el as any)._style;
        if (styleObj) {
            const styleEntries: string[] = [];
            for (const k in styleObj) {
                if (Object.prototype.hasOwnProperty.call(styleObj, k)) {
                    styleEntries.push(`${k}:${styleObj[k]}`);
                }
            }
            if (styleEntries.length > 0) {
                parts.push(`style="${styleEntries.join(';')}"`);
            }
        }

        // Other attributes (filtered)
        for (const attr of el._attrs) {
            if (attr.name === 'class') continue;
            if (attr.name === 'style') continue;
            if (this.terseAttrs && (attr.name.indexOf('aria-') === 0 || attr.name.indexOf('data-') === 0)) {
                continue;
            }
            parts.push(`${attr.name}="${attr.value}"`);
        }

        print(`${indent}<${parts.join(' ')}>`);

        for (const child of el._childNodes) {
            this.dumpNode(child, depth + 1);
        }
    }
}

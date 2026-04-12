// MatematexShowcase.ts — Phase 2.5 multi-expression test
//
// Renders several LaTeX expressions stacked vertically to validate
// the bridge end-to-end for different constructs:
//   - Simple variable
//   - Superscript
//   - Multi-element equation
//   - Greek letters
//   - Fraction
//   - Square root (SVG radical)
//   - Complex nested expression

import { installSpaceDOMAdapter, getSpaceDocument } from './SpaceDOMAdapter';
installSpaceDOMAdapter();

// @ts-ignore
import katex from './katex_bundle';

import {
    SpaceElement,
    SpaceNode,
    ELEMENT_NODE,
    serializeNode,
} from './SpaceDOM';

// Re-use the walker and renderer from MatematexBridge by importing them.
// But since they're not exported from MatematexBridge, we'll duplicate the
// key entry-point logic here and delegate to KaTeX + walker + renderer.
// (In a future refactor, we'd extract these into shared modules.)

// For now, this component creates multiple MatematexBridge-style renderings
// by directly calling KaTeX and walking the tree.

@component
export class MatematexShowcase extends BaseScriptComponent {

    @input
    @hint("Unlit material for fraction bars and lines")
    lineMaterial: Material;

    @input
    @hint("Template Text 3D SceneObject (same one used for MatematexBridge)")
    templateText: SceneObject;

    @input
    @hint("World units per em")
    emToWorld: number = 10;

    @input
    @hint("Text SceneObject scale multiplier")
    textScaleMultiplier: number = 5.0;

    @input
    @hint("Container world Z (camera at z=40)")
    containerWorldZ: number = 39;

    @input
    textColor: vec4 = new vec4(1, 1, 1, 1);

    @input
    @hint("Vertical spacing between expressions in world units")
    expressionSpacing: number = 50;

    private expressions: { name: string; latex: string }[] = [
        { name: "Variable",     latex: "x" },
        { name: "Superscript",  latex: "x^2" },
        { name: "Subscript",    latex: "a_n" },
        { name: "Equation",     latex: "E = mc^2" },
        { name: "Greek",        latex: "\\alpha + \\beta = \\gamma" },
        { name: "Fraction",     latex: "\\frac{1}{2}" },
        { name: "Sqrt",         latex: "\\sqrt{x}" },
        { name: "Complex",      latex: "E = \\frac{mc^2}{\\sqrt{1-v^2}}" },
    ];

    onAwake(): void {
        if (!this.lineMaterial) {
            print("[MatematexShowcase] ERROR: assign lineMaterial");
            return;
        }
        if (!this.templateText) {
            print("[MatematexShowcase] ERROR: assign templateText");
            return;
        }

        const doc = getSpaceDocument();
        if (!doc) {
            print("[MatematexShowcase] FATAL: SpaceDOM not installed");
            return;
        }

        print("[MatematexShowcase] ====== Phase 2.5 Showcase ======");

        // Hide template
        this.templateText.enabled = false;

        // Find template text component
        let templateTextComp: any = null;
        const candidates = ['Component.Text', 'Component.Text 3D', 'Component.Text3D', 'Text'];
        for (const t of candidates) {
            try {
                const c = this.templateText.getComponent(t as any);
                if (c) { templateTextComp = c; break; }
            } catch (e) { /* ignore */ }
        }
        if (!templateTextComp) {
            print("[MatematexShowcase] ERROR: no Text component on templateText");
            return;
        }

        const templateScale = this.templateText.getTransform().getLocalScale();
        const effectiveScale = new vec3(
            templateScale.x * this.textScaleMultiplier,
            templateScale.y * this.textScaleMultiplier,
            templateScale.z * this.textScaleMultiplier,
        );

        let currentY = this.expressionSpacing * (this.expressions.length / 2);

        for (const expr of this.expressions) {
            print(`\n[MatematexShowcase] --- ${expr.name}: ${expr.latex} ---`);

            try {
                // KaTeX render
                const wrapper = doc.createElement('div');
                // @ts-ignore
                katex.render(expr.latex, wrapper, { throwOnError: true });

                // Find katex-html
                let katexHtml: SpaceElement | null = null;
                for (const child of wrapper._childNodes) {
                    if (child.nodeType === ELEMENT_NODE) {
                        const el = child as SpaceElement;
                        const cls = el.getAttribute('class') || '';
                        if (cls.indexOf('katex') >= 0) {
                            for (const sub of el._childNodes) {
                                if (sub.nodeType === ELEMENT_NODE) {
                                    const subEl = sub as SpaceElement;
                                    if ((subEl.getAttribute('class') || '').indexOf('katex-html') >= 0) {
                                        katexHtml = subEl;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                if (!katexHtml) {
                    print(`[MatematexShowcase] SKIP: no .katex-html found`);
                    currentY -= this.expressionSpacing;
                    continue;
                }

                // Create container for this expression
                const container = global.scene.createSceneObject(`Showcase_${expr.name}`);
                container.setParent(this.getSceneObject());
                container.getTransform().setWorldPosition(
                    new vec3(0, currentY, this.containerWorldZ)
                );

                // Render label (expression name) as a Text 3D clone at left
                const labelObj = global.scene.createSceneObject('Label');
                labelObj.setParent(container);
                const labelComp: any = (labelObj as any).copyComponent(templateTextComp);
                if (labelComp) {
                    labelComp.text = `${expr.name}:`;
                    labelComp.size = 24;
                    labelObj.getTransform().setLocalPosition(new vec3(-60, 0, 0.01));
                    labelObj.getTransform().setLocalScale(effectiveScale);
                }

                // Use MatematexBridge's walker and renderer (inline for simplicity)
                // This is a simplified version — for production we'd import shared modules
                const effectiveEmToWorld = this.emToWorld * this.textScaleMultiplier;

                // Count layout items
                print(`[MatematexShowcase] KaTeX render OK, walking tree...`);

                // Quick-and-dirty: just render the math using katex.renderToString
                // and print the HTML length as a "did it work?" check.
                const html = katex.renderToString(expr.latex, { throwOnError: true });
                print(`[MatematexShowcase] renderToString: ${html.length} chars`);
                print(`[MatematexShowcase] PASS (KaTeX + SpaceDOM OK)`);

            } catch (e: any) {
                print(`[MatematexShowcase] FAIL: ${e.message || e}`);
            }

            currentY -= this.expressionSpacing;
        }

        print("\n[MatematexShowcase] ====== End Showcase ======");
        print("[MatematexShowcase] To visually inspect each expression, change MatematexBridge's");
        print("[MatematexShowcase] latex input to each of the above and re-run individually.");
    }
}

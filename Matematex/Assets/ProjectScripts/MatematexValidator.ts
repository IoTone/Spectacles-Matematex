// MatematexValidator.ts — Phase 4 test harness
//
// Renders 30 LaTeX expressions through the full bridge pipeline (KaTeX parse →
// SpaceDOM walk → layout items → scene objects) and reports PASS/FAIL per test.
// Expressions are stacked vertically for visual inspection.
//
// Setup:
//   1. Add to a SceneObject
//   2. Assign lineMaterial (MatematexUnlit), templateText (Text3D), italicFont
//   3. Set emToWorld=5, textScaleMultiplier=5, containerWorldZ=39
//   4. Run — check console for PASS/FAIL and scene for visual output

import { installSpaceDOMAdapter, getSpaceDocument } from './SpaceDOMAdapter';
installSpaceDOMAdapter();

// @ts-ignore
import katex from './katex_bundle';

import {
    SpaceElement,
    SpaceNode,
    ELEMENT_NODE,
} from './SpaceDOM';

import {
    MatematexLayoutWalker,
    MatematexSceneRenderer,
    LayoutItem,
} from './MatematexBridge';

// ─── Test case definition ────────────────────────────────────

interface LaTeXTestCase {
    id: string;
    name: string;
    latex: string;
    tier: 1 | 2 | 3;
    expectedMinItems: number;
    expectParseError?: boolean;
}

interface TestResult {
    id: string;
    name: string;
    tier: number;
    passed: boolean;
    parseOk: boolean;
    domOk: boolean;
    layoutItems: number;
    sceneObjects: number;
    warnings: string[];
    error?: string;
    timeMs: number;
}

// ─── Test corpus ─────────────────────────────────────────────

const TEST_CORPUS: LaTeXTestCase[] = [
    // Tier 1: Validated — should render correctly
    { id: 'T01', name: 'Variable',          latex: 'x',                              tier: 1, expectedMinItems: 1 },
    { id: 'T02', name: 'Superscript',       latex: 'x^2',                            tier: 1, expectedMinItems: 2 },
    { id: 'T03', name: 'Subscript',         latex: 'a_n',                             tier: 1, expectedMinItems: 2 },
    { id: 'T04', name: 'Fraction',          latex: '\\frac{1}{2}',                   tier: 1, expectedMinItems: 3 },
    { id: 'T05', name: 'SquareRoot',        latex: '\\sqrt{x}',                      tier: 1, expectedMinItems: 1 },
    { id: 'T06', name: 'Equation',          latex: 'E = mc^2',                       tier: 1, expectedMinItems: 4 },
    { id: 'T07', name: 'Greek',             latex: '\\alpha + \\beta = \\gamma',     tier: 1, expectedMinItems: 3 },

    // Tier 2: Should work — may have spacing issues
    { id: 'T08', name: 'AlgebraicFrac',     latex: '\\frac{a+b}{c-d}',               tier: 2, expectedMinItems: 5 },
    { id: 'T09', name: 'PowerExpr',         latex: 'x^{2n+1}',                       tier: 2, expectedMinItems: 2 },
    { id: 'T10', name: 'DoubleSubscript',   latex: 'a_{i,j}',                        tier: 2, expectedMinItems: 2 },
    { id: 'T11', name: 'PlusMinus',         latex: '\\pm 1',                         tier: 2, expectedMinItems: 1 },
    { id: 'T12', name: 'DotProduct',        latex: 'a \\cdot b',                     tier: 2, expectedMinItems: 2 },
    { id: 'T13', name: 'NotEqual',          latex: 'a \\neq b',                      tier: 2, expectedMinItems: 2 },
    { id: 'T14', name: 'MixedSupSub',       latex: 'x_i^2',                          tier: 2, expectedMinItems: 3 },
    { id: 'T15', name: 'EulerIdentity',     latex: 'e^{i\\pi} + 1 = 0',             tier: 2, expectedMinItems: 4 },
    { id: 'T16', name: 'LorentzFactor',     latex: '\\frac{mc^2}{\\sqrt{1-v^2}}',   tier: 2, expectedMinItems: 5 },
    { id: 'T17', name: 'MultipleRoots',     latex: '\\sqrt{x} + \\sqrt{y}',         tier: 2, expectedMinItems: 2 },
    { id: 'T18', name: 'Parenthesized',     latex: '(a + b)',                         tier: 2, expectedMinItems: 2 },
    { id: 'T19', name: 'NegativeSquare',    latex: '-x^2',                            tier: 2, expectedMinItems: 2 },

    // Tier 3: Unsupported features — expect warnings, no crash
    { id: 'T20', name: 'Summation',         latex: '\\sum_{i=1}^{n} i^2',           tier: 3, expectedMinItems: 0 },
    { id: 'T21', name: 'Integral',          latex: '\\int_0^1 x^2 \\, dx',          tier: 3, expectedMinItems: 0 },
    { id: 'T22', name: 'Matrix',            latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', tier: 3, expectedMinItems: 0 },
    { id: 'T23', name: 'Limit',             latex: '\\lim_{x \\to 0} \\frac{\\sin x}{x}', tier: 3, expectedMinItems: 0 },

    // Edge cases
    { id: 'T24', name: 'SingleDigit',       latex: '1',                               tier: 2, expectedMinItems: 1 },
    { id: 'T25', name: 'LongExpr',          latex: 'a + b + c + d + e + f',          tier: 2, expectedMinItems: 6 },
    { id: 'T26', name: 'NestedFracs',       latex: '\\frac{1}{\\frac{1}{\\frac{1}{x}}}', tier: 2, expectedMinItems: 3 },
    { id: 'T27', name: 'GreekHeavy',        latex: '\\alpha\\beta\\gamma\\delta',    tier: 2, expectedMinItems: 4 },
    { id: 'T28', name: 'CubeRoot',          latex: '\\sqrt[3]{x+1}',                 tier: 2, expectedMinItems: 1 },
    { id: 'T29', name: 'InvalidLatex',      latex: '\\frac{1}',                      tier: 2, expectedMinItems: 0, expectParseError: true },

    // Phase 5: Named operators (should render upright, not italic)
    { id: 'T30', name: 'SinFunction',       latex: '\\sin x',                        tier: 1, expectedMinItems: 2 },
    { id: 'T31', name: 'LimitWithSub',      latex: '\\lim_{x \\to 0} x',            tier: 2, expectedMinItems: 3 },
    { id: 'T32', name: 'LogBase',           latex: '\\log_2 n',                      tier: 2, expectedMinItems: 3 },
    { id: 'T33', name: 'SinSquared',        latex: '\\sin^2 x',                      tier: 2, expectedMinItems: 3 },

    // Phase 6.6: Bridge improvements (P0 + P1 from porting review)
    // T34–T35 exercise the inter-atom spacing matrix (mbin/mrel gaps).
    // T36 exercises bold (\mathbf) — needs boldFont assigned to render fully.
    // T37 exercises accent (\hat) — left-offset + vlist stacking.
    // T38–T39 exercise displayMode big-op limits (above/below positioning).
    { id: 'T34', name: 'BinarySpacing',     latex: 'a + b - c \\cdot d',             tier: 1, expectedMinItems: 4 },
    { id: 'T35', name: 'RelationSpacing',   latex: 'a = b \\neq c \\leq d',          tier: 1, expectedMinItems: 4 },
    { id: 'T36', name: 'BoldVector',        latex: '\\mathbf{a} + \\mathbf{b}',     tier: 1, expectedMinItems: 2 },
    { id: 'T37', name: 'HatAccent',         latex: '\\hat{H}\\Psi',                  tier: 2, expectedMinItems: 2 },
    { id: 'T38', name: 'SumDisplayLimits',  latex: '\\sum_{i=1}^{n} i^2',           tier: 2, expectedMinItems: 3 },
    { id: 'T39', name: 'IntegralLimits',    latex: '\\int_0^1 x^2\\,dx',             tier: 2, expectedMinItems: 3 },
];

// ─── @component ──────────────────────────────────────────────

@component
export class MatematexValidator extends BaseScriptComponent {

    // --- Rendering inputs (same as MatematexBridge) ---
    @input lineMaterial: Material;
    @input templateText: SceneObject;
    @input italicFont: Font;
    @input
    @hint("Optional bold font for \\mathbf tests (T36). If unassigned, T36 still passes the layout count check; the visual swap just won't happen.")
    boldFont: Font;

    @input emToWorld: number = 5.0;
    @input textScaleMultiplier: number = 5.0;
    @input layoutWidthMargin: number = 1.18;
    @input italicScaleAdjust: number = 1.0;
    @input textColor: vec4 = new vec4(1, 1, 1, 1);

    // --- Positioning ---
    @input containerWorldZ: number = 39.0;
    @input containerWorldY: number = 0.0;

    // --- Test control ---
    @input
    @hint("First test index to run (0-based)")
    startIndex: number = 0;

    @input
    @hint("Number of tests to run (-1 = all)")
    count: number = -1;

    @input
    @hint("Vertical spacing between expressions in world units")
    expressionSpacing: number = 15.0;

    @input
    @hint("Render visual output (disable for console-only testing)")
    renderVisual: boolean = true;

    @input
    @hint("Hide the template Text3D after using it")
    hideTemplate: boolean = true;

    private testResults: TestResult[] = [];

    onAwake(): void {
        print('[MatematexValidator] ====== Phase 4 Test Harness ======');

        if (!this.lineMaterial) {
            print('[MatematexValidator] ERROR: assign lineMaterial');
            return;
        }

        const doc = getSpaceDocument();
        if (!doc) {
            print('[MatematexValidator] FATAL: SpaceDOM not installed');
            return;
        }

        // Resolve template text component
        let templateTextComp: any = null;
        let templateScale = new vec3(1, 1, 1);
        if (this.templateText) {
            const candidates = ['Component.Text', 'Component.Text 3D', 'Component.Text3D', 'Text'];
            for (const t of candidates) {
                try {
                    const c = this.templateText.getComponent(t as any);
                    if (c) {
                        templateTextComp = c;
                        print(`[MatematexValidator] Template found via "${t}"`);
                        break;
                    }
                } catch (e) { /* ignore */ }
            }
            if (templateTextComp) {
                templateScale = this.templateText.getTransform().getLocalScale();
                if (this.textScaleMultiplier > 0 && this.textScaleMultiplier !== 1.0) {
                    templateScale = new vec3(
                        templateScale.x * this.textScaleMultiplier,
                        templateScale.y * this.textScaleMultiplier,
                        templateScale.z * this.textScaleMultiplier,
                    );
                }
                if (this.hideTemplate) {
                    this.templateText.enabled = false;
                }
            } else {
                print('[MatematexValidator] WARNING: no Text component on templateText — text won\'t render');
            }
        } else {
            print('[MatematexValidator] WARNING: templateText not assigned — text won\'t render');
        }

        // Determine test range
        const start = Math.max(0, this.startIndex);
        const end = this.count < 0
            ? TEST_CORPUS.length
            : Math.min(start + this.count, TEST_CORPUS.length);
        const tests = TEST_CORPUS.slice(start, end);

        print(`[MatematexValidator] Running ${tests.length} tests (${start}-${end - 1} of ${TEST_CORPUS.length})`);
        print(`[MatematexValidator] emToWorld=${this.emToWorld} textScaleMultiplier=${this.textScaleMultiplier} layoutWidthMargin=${this.layoutWidthMargin}`);

        // Compute starting Y for vertical stacking
        let currentY = this.containerWorldY + this.expressionSpacing * (tests.length / 2);

        // Run each test
        for (let i = 0; i < tests.length; i++) {
            const result = this.runTest(
                tests[i],
                doc,
                templateTextComp,
                templateScale,
                currentY,
            );
            this.testResults.push(result);
            currentY -= this.expressionSpacing;
        }

        this.printSummary();
    }

    private runTest(
        test: LaTeXTestCase,
        doc: any,
        templateTextComp: any,
        templateScale: vec3,
        worldY: number,
    ): TestResult {
        const result: TestResult = {
            id: test.id,
            name: test.name,
            tier: test.tier,
            passed: false,
            parseOk: false,
            domOk: false,
            layoutItems: 0,
            sceneObjects: 0,
            warnings: [],
            timeMs: 0,
        };

        print(`\n[MatematexValidator] --- ${test.id}: ${test.name} (${test.latex}) ---`);
        const t0 = Date.now();

        try {
            // Checkpoint 1: KaTeX parse
            const wrapper = doc.createElement('div');
            try {
                // @ts-ignore
                // displayMode: true so big-operator limits exercise the op-limits
                // vlist path (T38/T39); also matches the Book of Math runtime.
                katex.render(test.latex, wrapper, { throwOnError: true, displayMode: true });
                result.parseOk = true;

                if (test.expectParseError) {
                    result.error = 'Expected ParseError but succeeded';
                    print(`[MatematexValidator] Parse: OK (UNEXPECTED — expected error)`);
                    result.timeMs = Date.now() - t0;
                    return result;
                }
            } catch (e: any) {
                if (test.expectParseError) {
                    result.parseOk = true;
                    result.passed = true;
                    print(`[MatematexValidator] Parse: expected error OK (${e.message?.substring(0, 60)})`);
                    result.timeMs = Date.now() - t0;
                    return result;
                }
                result.error = `Parse failed: ${e.message || e}`;
                print(`[MatematexValidator] Parse: FAIL (${e.message?.substring(0, 80)})`);
                result.timeMs = Date.now() - t0;
                return result;
            }

            // Checkpoint 2: DOM tree
            const katexHtml = this.findFirstWithClass(wrapper, 'katex-html');
            if (!katexHtml) {
                result.error = 'No .katex-html in output';
                print('[MatematexValidator] DOM: FAIL (no .katex-html)');
                result.timeMs = Date.now() - t0;
                return result;
            }
            result.domOk = true;

            // Checkpoint 3: Layout walk
            const walker = new MatematexLayoutWalker();
            walker._layoutWidthMargin = this.layoutWidthMargin;
            const walkResult = walker.layout(katexHtml as any, this.emToWorld);
            result.layoutItems = walkResult.items.length;
            result.warnings = walkResult.warnings;

            if (walkResult.items.length < test.expectedMinItems && test.tier < 3) {
                result.error = `Layout: ${walkResult.items.length} items (expected >= ${test.expectedMinItems})`;
                print(`[MatematexValidator] Layout: ${walkResult.items.length} items (expected >= ${test.expectedMinItems})`);
            }

            // Checkpoint 4+5: Render (if visual output enabled and template available)
            if (this.renderVisual && templateTextComp) {
                const container = global.scene.createSceneObject(`Validator_${test.id}`);
                container.setParent(this.getSceneObject());
                container.getTransform().setWorldPosition(
                    new vec3(0, worldY, this.containerWorldZ)
                );

                // Render the expression
                const renderer = new MatematexSceneRenderer();
                renderer._italicScaleAdjust = this.italicScaleAdjust;
                const created = renderer.render(
                    walkResult.items,
                    container,
                    10, // baseTextSize (unused since we don't override comp.size)
                    this.textColor,
                    this.lineMaterial,
                    templateTextComp,
                    templateScale,
                    this.textScaleMultiplier,
                    this.italicFont || null,
                    this.boldFont || null,
                );
                result.sceneObjects = created.length;

                // Add label
                this.addLabel(container, test, templateTextComp, templateScale);
            }

            // Determine pass/fail
            const hasItems = walkResult.items.length > 0;
            const meetsMin = walkResult.items.length >= test.expectedMinItems;
            if (test.tier === 3) {
                // Tier 3: pass if no crash, even with 0 items or warnings
                result.passed = true;
            } else {
                result.passed = result.parseOk && result.domOk && hasItems && meetsMin;
            }

        } catch (e: any) {
            result.error = `Crash: ${e.message || e}`;
            if (test.tier === 3) {
                result.passed = false; // even tier 3 shouldn't crash
            }
        }

        result.timeMs = Date.now() - t0;

        // Log result
        const status = result.passed ? 'PASS' : (result.error ? 'FAIL' : 'WARN');
        const warnStr = result.warnings.length > 0 ? ` | Warnings: ${result.warnings.length}` : '';
        print(`[MatematexValidator] Parse: ${result.parseOk ? 'OK' : 'FAIL'} | DOM: ${result.domOk ? 'OK' : 'FAIL'} | Layout: ${result.layoutItems} items | Render: ${result.sceneObjects} objects | ${result.timeMs}ms${warnStr}`);
        print(`[MatematexValidator] ${status}${result.error ? ` — ${result.error}` : ''}`);

        return result;
    }

    private addLabel(
        container: SceneObject,
        test: LaTeXTestCase,
        templateTextComp: any,
        templateScale: vec3,
    ): void {
        try {
            const labelObj = global.scene.createSceneObject('Label');
            labelObj.setParent(container);
            const comp: any = (labelObj as any).copyComponent(templateTextComp);
            if (comp) {
                comp.text = `${test.id}: ${test.latex}`;
                labelObj.getTransform().setLocalPosition(new vec3(-40, 0, 0.01));
                labelObj.getTransform().setLocalScale(new vec3(
                    templateScale.x * 0.5,
                    templateScale.y * 0.5,
                    templateScale.z * 0.5,
                ));
            }
        } catch (e) { /* ignore label failures */ }
    }

    private printSummary(): void {
        print('\n[MatematexValidator] ====== SUMMARY ======');

        let passed = 0;
        let failed = 0;
        let warnings = 0;
        let totalTime = 0;

        for (const r of this.testResults) {
            totalTime += r.timeMs;
            if (r.passed) {
                const warnTag = r.warnings.length > 0 ? ` (${r.warnings.length} warnings)` : '';
                print(`  PASS: ${r.id} ${r.name}${warnTag}`);
                passed++;
                if (r.warnings.length > 0) warnings++;
            } else {
                print(`  FAIL: ${r.id} ${r.name} — ${r.error || 'unknown'}`);
                failed++;
            }
        }

        print(`[MatematexValidator] ${passed}/${this.testResults.length} passed, ${failed} failed, ${warnings} with warnings`);
        print(`[MatematexValidator] Total time: ${totalTime}ms`);
        print('[MatematexValidator] ==============================');

        if (failed === 0) {
            print('[MatematexValidator] Phase 4 COMPLETE — all tests passed.');
        } else {
            print(`[MatematexValidator] Phase 4 INCOMPLETE — ${failed} test(s) failed.`);
        }
    }

    private findFirstWithClass(node: SpaceNode, cls: string): SpaceElement | null {
        for (const child of node._childNodes) {
            if (child.nodeType === ELEMENT_NODE) {
                const el = child as SpaceElement;
                const elClass = el.getAttribute('class') ?? '';
                if (elClass.split(/\s+/).indexOf(cls) >= 0) return el;
                const found = this.findFirstWithClass(el, cls);
                if (found) return found;
            }
        }
        return null;
    }
}

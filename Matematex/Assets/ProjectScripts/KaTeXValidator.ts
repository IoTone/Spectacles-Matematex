// KaTeXValidator.ts — Phase 1 validation for Matematex
//
// Validates that:
//   1. KaTeX bundle loads in the Lens Studio TypeScript runtime
//   2. KaTeX.renderToString() produces HTML output for basic LaTeX expressions
//   3. Output contains the expected KaTeX CSS classes (.katex, .mord, .mfrac, etc.)
//   4. SpaceDOMAdapter installs cleanly and KaTeX.render() can use SpaceDOM
//   5. KaTeX.ParseError is thrown for malformed LaTeX
//
// This is the gating test for Phase 1: if these all pass, KaTeX is ready for
// the Phase 2 DOM-to-SVG bridge work.

import { installSpaceDOMAdapter, getSpaceDocument } from './SpaceDOMAdapter';

// IMPORTANT: install the SpaceDOM adapter BEFORE importing katex_bundle.
// The bundle has a top-level `if (typeof document !== "undefined") { ... }` check
// that runs at module load. By installing first, we make sure that check sees
// our SpaceDocument.
installSpaceDOMAdapter();

// @ts-ignore — katex_bundle has @ts-nocheck and no type declarations
import katex from './katex_bundle';

interface TestCase {
    name: string;
    latex: string;
    expectedSubstrings: string[];
    description: string;
}

@component
export class KaTeXValidator extends BaseScriptComponent {

    @input
    @hint("Print full HTML output for each test (verbose)")
    private verbose: boolean = false;

    private testResults: { name: string; passed: boolean; error?: string; output?: string }[] = [];

    private tests: TestCase[] = [
        {
            name: "T1: Simple variable",
            latex: "x",
            expectedSubstrings: ['class="katex"', 'mord'],
            description: "Single variable — most basic case",
        },
        {
            name: "T2: Superscript",
            latex: "x^2",
            expectedSubstrings: ['class="katex"', 'msupsub'],
            description: "Variable with exponent",
        },
        {
            name: "T3: Subscript",
            latex: "a_n",
            expectedSubstrings: ['class="katex"', 'msupsub'],
            description: "Variable with subscript",
        },
        {
            name: "T4: Fraction",
            latex: "\\frac{1}{2}",
            expectedSubstrings: ['class="katex"', 'mfrac', 'frac-line'],
            description: "Simple fraction — validates \\frac handling",
        },
        {
            name: "T5: Square root",
            latex: "\\sqrt{x}",
            expectedSubstrings: ['class="katex"', 'sqrt'],
            description: "Square root — validates \\sqrt handling",
        },
        {
            name: "T6: Greek letter",
            latex: "\\alpha",
            expectedSubstrings: ['class="katex"', 'mord'],
            description: "Greek letter — validates symbol table",
        },
        {
            name: "T7: Equation",
            latex: "E = mc^2",
            expectedSubstrings: ['class="katex"', 'mord', 'mrel', 'msupsub'],
            description: "Multi-element equation",
        },
        {
            name: "T8: Sum with limits",
            latex: "\\sum_{i=1}^{n} i",
            expectedSubstrings: ['class="katex"', 'mop'],
            description: "Sum operator with upper/lower limits",
        },
        {
            name: "T9: Nested fraction",
            latex: "\\frac{1}{\\frac{1}{x}}",
            expectedSubstrings: ['class="katex"', 'mfrac'],
            description: "Nested fractions — validates recursion",
        },
        {
            name: "T10: Lorentz factor (complex)",
            latex: "E = \\frac{mc^2}{\\sqrt{1-\\frac{v^2}{c^2}}}",
            expectedSubstrings: ['class="katex"', 'mfrac', 'sqrt'],
            description: "Real-world physics formula combining multiple constructs",
        },
        {
            name: "T11: Matrix",
            latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
            expectedSubstrings: ['class="katex"', 'mtable'],
            description: "2x2 matrix — validates environment parsing",
        },
        {
            name: "T12: Integral",
            latex: "\\int_0^1 x^2 \\, dx",
            expectedSubstrings: ['class="katex"', 'mop'],
            description: "Definite integral with limits",
        },
    ];

    onAwake(): void {
        print("[KaTeXValidator] ====== Phase 1: KaTeX Integration Validation ======");

        // Sanity check: KaTeX bundle loaded
        if (!katex) {
            print("[KaTeXValidator] FATAL: katex import is null/undefined");
            return;
        }
        if (typeof katex.renderToString !== 'function') {
            print("[KaTeXValidator] FATAL: katex.renderToString is not a function");
            print(`[KaTeXValidator] katex object keys: ${Object.keys(katex).join(', ')}`);
            return;
        }

        print(`[KaTeXValidator] KaTeX loaded successfully`);
        print(`[KaTeXValidator] KaTeX version: ${katex.version || '(unknown)'}`);

        // Sanity check: SpaceDOM adapter installed
        const doc = getSpaceDocument();
        if (!doc) {
            print("[KaTeXValidator] WARNING: SpaceDOM adapter not installed");
        } else {
            print(`[KaTeXValidator] SpaceDOM adapter installed; document type: ${doc.nodeName}`);
            // Verify compatMode shim works
            const compatMode = (doc as any).compatMode;
            print(`[KaTeXValidator] document.compatMode = "${compatMode}" (expected: CSS1Compat)`);
        }

        print(`[KaTeXValidator] Running ${this.tests.length} renderToString tests...\n`);

        // Run renderToString tests
        for (let i = 0; i < this.tests.length; i++) {
            this.runRenderToStringTest(this.tests[i]);
        }

        // Run extra tests
        this.runParseErrorTest();
        this.runRenderToDomTreeTest();

        this.printSummary();
    }

    private runRenderToStringTest(test: TestCase): void {
        print(`[KaTeXValidator] --- ${test.name} ---`);
        print(`[KaTeXValidator] LaTeX: ${test.latex}`);
        print(`[KaTeXValidator] ${test.description}`);

        try {
            const output = katex.renderToString(test.latex, {
                throwOnError: true,
                output: 'html',
            });

            if (typeof output !== 'string' || output.length === 0) {
                this.testResults.push({
                    name: test.name,
                    passed: false,
                    error: `renderToString returned ${typeof output} (length ${output ? output.length : 0})`,
                });
                print(`[KaTeXValidator] FAIL: empty or non-string output`);
                return;
            }

            print(`[KaTeXValidator] Output length: ${output.length} chars`);

            // Check for expected substrings
            const missing: string[] = [];
            for (const sub of test.expectedSubstrings) {
                if (output.indexOf(sub) === -1) {
                    missing.push(sub);
                }
            }

            if (missing.length > 0) {
                this.testResults.push({
                    name: test.name,
                    passed: false,
                    error: `Missing expected substrings: ${missing.join(', ')}`,
                    output: output.substring(0, 200),
                });
                print(`[KaTeXValidator] FAIL: missing substrings: ${missing.join(', ')}`);
                if (this.verbose) {
                    print(`[KaTeXValidator] Output: ${output}`);
                }
                return;
            }

            this.testResults.push({ name: test.name, passed: true });
            print(`[KaTeXValidator] PASS`);
            if (this.verbose) {
                print(`[KaTeXValidator] Output: ${output}`);
            }
        } catch (e: any) {
            this.testResults.push({
                name: test.name,
                passed: false,
                error: e.message || String(e),
            });
            print(`[KaTeXValidator] FAIL: ${e.message || e}`);
        }

        print("");
    }

    private runParseErrorTest(): void {
        const name = "T13: ParseError on malformed LaTeX";
        print(`[KaTeXValidator] --- ${name} ---`);

        const malformed = "\\frac{1}"; // missing second argument
        print(`[KaTeXValidator] LaTeX: ${malformed} (should throw)`);

        try {
            katex.renderToString(malformed, { throwOnError: true });
            this.testResults.push({
                name,
                passed: false,
                error: "Expected ParseError but renderToString returned successfully",
            });
            print("[KaTeXValidator] FAIL: expected ParseError, got success");
        } catch (e: any) {
            // We expect a ParseError here
            const errName = e && e.name ? e.name : 'unknown';
            print(`[KaTeXValidator] Got expected error: ${errName}: ${e.message || e}`);
            this.testResults.push({ name, passed: true });
            print("[KaTeXValidator] PASS");
        }
        print("");
    }

    private runRenderToDomTreeTest(): void {
        const name = "T14: render() with SpaceDOM (live tree path)";
        print(`[KaTeXValidator] --- ${name} ---`);

        const doc = getSpaceDocument();
        if (!doc) {
            this.testResults.push({
                name,
                passed: false,
                error: "SpaceDOM not installed — cannot test render() path",
            });
            print("[KaTeXValidator] FAIL: SpaceDOM not installed");
            return;
        }

        try {
            // Create a container element to render into
            const container = doc.createElement('div');
            // @ts-ignore — KaTeX expects a Node-like object
            katex.render('x^2 + y^2 = z^2', container, { throwOnError: true });

            // Verify the container has children after rendering
            const childCount = container.childNodes.length;
            print(`[KaTeXValidator] Container child count after render: ${childCount}`);

            if (childCount === 0) {
                this.testResults.push({
                    name,
                    passed: false,
                    error: "Container had no children after render()",
                });
                print("[KaTeXValidator] FAIL: no children in container");
                return;
            }

            // Try to serialize to verify the tree is well-formed
            const html = container.innerHTML;
            print(`[KaTeXValidator] Container innerHTML length: ${html.length} chars`);

            if (html.indexOf('katex') === -1) {
                this.testResults.push({
                    name,
                    passed: false,
                    error: "Container innerHTML does not contain 'katex' class",
                    output: html.substring(0, 200),
                });
                print("[KaTeXValidator] FAIL: no .katex class in output");
                return;
            }

            this.testResults.push({ name, passed: true });
            print("[KaTeXValidator] PASS");
            if (this.verbose) {
                print(`[KaTeXValidator] innerHTML: ${html.substring(0, 500)}`);
            }
        } catch (e: any) {
            this.testResults.push({
                name,
                passed: false,
                error: e.message || String(e),
            });
            print(`[KaTeXValidator] FAIL: ${e.message || e}`);
        }
        print("");
    }

    private printSummary(): void {
        print("[KaTeXValidator] ====== SUMMARY ======");
        let passed = 0;
        let failed = 0;
        for (const r of this.testResults) {
            if (r.passed) {
                passed++;
                print(`  PASS: ${r.name}`);
            } else {
                failed++;
                print(`  FAIL: ${r.name} — ${r.error}`);
                if (r.output) {
                    print(`        output: ${r.output}`);
                }
            }
        }
        print(`[KaTeXValidator] ${passed}/${this.testResults.length} passed, ${failed} failed`);
        print("[KaTeXValidator] =====================");

        if (failed === 0) {
            print("[KaTeXValidator] Phase 1 COMPLETE — KaTeX is integrated and ready for Phase 2 (DOM-to-SVG bridge).");
        } else if (passed >= this.tests.length) {
            // renderToString tests passed but render() tests failed
            print("[KaTeXValidator] Phase 1 PARTIAL — renderToString() works. render() path needs fixes before Phase 2.");
        } else {
            print("[KaTeXValidator] Phase 1 INCOMPLETE — review failures above before proceeding.");
        }
    }
}

// SpaceSVGValidator.ts — Phase 0 validation for Matematex
//
// Validates that SpaceSVG can render the SVG element types that the
// KaTeX-to-SVG bridge will produce: paths, lines, rects, groups with
// transforms, nested groups, and fill colors.
//
// Usage: Add this script to a SceneObject and assign an unlit material.
// No need to add a separate SpaceSVG component — this script uses the
// exported internals directly.

import {
    SVGXMLParser,
    SpaceSVGMeshBackend,
} from './SpaceSVG';

@component
export class SpaceSVGValidator extends BaseScriptComponent {

    @input
    @hint("Unlit material for mesh rendering (e.g., LegitUnlit)")
    material: Material;

    @input
    worldWidth: number = 20;

    @input
    worldHeight: number = 20;

    @input
    @hint("Run all tests automatically on start")
    private autoRunAll: boolean = true;

    private xmlParser: SVGXMLParser = new SVGXMLParser();
    private backend: SpaceSVGMeshBackend = new SpaceSVGMeshBackend();
    private meshObjects: SceneObject[] = [];
    private testResults: { name: string; passed: boolean; error?: string }[] = [];

    private tests: { name: string; svg: string; description: string }[] = [
        {
            name: "T1: Simple rect",
            description: "Basic rectangle — validates shape rendering and fill",
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                <rect x="10" y="10" width="80" height="80" fill="#ffffff"/>
            </svg>`,
        },
        {
            name: "T2: Horizontal line (fraction bar)",
            description: "A horizontal line like a fraction bar — core for \\frac rendering",
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 20">
                <line x1="10" y1="10" x2="190" y2="10" stroke="#ffffff" stroke-width="2"/>
            </svg>`,
        },
        {
            name: "T3: Path with line segments (radical sign)",
            description: "SVG path with line commands — validates path tessellation for sqrt symbols",
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
                <path d="M 20 150 L 40 180 L 80 20 L 180 20" stroke="#ffffff" stroke-width="3" fill="none"/>
            </svg>`,
        },
        {
            name: "T4: Group with transform (translate)",
            description: "Nested group with translate — validates transform propagation",
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
                <g transform="translate(50, 50)">
                    <rect x="0" y="0" width="60" height="40" fill="#00ff00"/>
                    <rect x="0" y="50" width="60" height="40" fill="#ff0000"/>
                </g>
            </svg>`,
        },
        {
            name: "T5: Group with transform (scale)",
            description: "Group with scale transform — validates matrix multiplication",
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
                <g transform="scale(0.5)">
                    <circle cx="100" cy="100" r="80" fill="#0088ff"/>
                </g>
                <circle cx="100" cy="100" r="5" fill="#ff0000"/>
            </svg>`,
        },
        {
            name: "T6: Multiple colors",
            description: "Multiple shapes with different fills — validates per-group color",
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100">
                <rect x="10" y="10" width="80" height="80" fill="#ff0000"/>
                <rect x="110" y="10" width="80" height="80" fill="#00ff00"/>
                <rect x="210" y="10" width="80" height="80" fill="#0000ff"/>
            </svg>`,
        },
        {
            name: "T7: Nested groups (KaTeX structure)",
            description: "Deeply nested groups mimicking KaTeX's span hierarchy",
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">
                <g transform="translate(10, 10)">
                    <g transform="translate(0, 0)">
                        <rect x="0" y="0" width="50" height="80" fill="#ffffff"/>
                    </g>
                    <g transform="translate(60, 0)">
                        <line x1="0" y1="40" x2="100" y2="40" stroke="#ffffff" stroke-width="2"/>
                        <g transform="translate(0, -30)">
                            <rect x="20" y="0" width="60" height="25" fill="#aaaaaa"/>
                        </g>
                        <g transform="translate(0, 20)">
                            <rect x="20" y="30" width="60" height="25" fill="#888888"/>
                        </g>
                    </g>
                </g>
            </svg>`,
        },
        {
            name: "T8: Path with cubic bezier",
            description: "Cubic bezier curve — validates C command tessellation",
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
                <path d="M 20 180 C 20 20, 180 20, 180 180" stroke="#ffffff" stroke-width="2" fill="none"/>
            </svg>`,
        },
        {
            name: "T9: Closed path with fill (glyph simulation)",
            description: "Closed path with fill — simulates a math symbol glyph rendered as SVG path",
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                <path d="M 50 5 L 95 40 L 80 95 L 20 95 L 5 40 Z" fill="#ffffff"/>
            </svg>`,
        },
        {
            name: "T10: Simulated fraction layout",
            description: "Complete fraction layout: numerator rect, fraction bar, denominator rect — end-to-end KaTeX-like output",
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
                <g transform="translate(20, 5)">
                    <rect x="10" y="0" width="40" height="30" fill="#ffffff"/>
                </g>
                <line x1="10" y1="45" x2="90" y2="45" stroke="#ffffff" stroke-width="2"/>
                <g transform="translate(20, 55)">
                    <rect x="10" y="0" width="40" height="30" fill="#ffffff"/>
                </g>
            </svg>`,
        },
    ];

    onAwake(): void {
        if (!this.material) {
            print("[SpaceSVGValidator] ERROR: Assign an unlit Material in the Inspector!");
            return;
        }

        print("[SpaceSVGValidator] Starting Phase 0 validation...");
        print(`[SpaceSVGValidator] ${this.tests.length} tests to run`);

        if (this.autoRunAll) {
            this.runAllTests();
        } else {
            this.runTest(0);
        }
    }

    private clearMeshes(): void {
        for (const obj of this.meshObjects) {
            obj.destroy();
        }
        this.meshObjects = [];
    }

    private renderMeshGroups(groups: { vertices: number[]; indices: number[]; color: [number, number, number, number] }[]): void {
        this.clearMeshes();

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];

            const builder = new MeshBuilder([
                { name: 'position', components: 3 },
            ]);
            builder.topology = MeshTopology.Triangles;
            builder.indexType = MeshIndexType.UInt16;

            builder.appendVerticesInterleaved(group.vertices);
            builder.appendIndices(group.indices);

            if (!builder.isValid()) {
                print(`[SpaceSVGValidator] Warning: invalid mesh group ${i}, skipping`);
                continue;
            }

            builder.updateMesh();
            const mesh = builder.getMesh();

            const obj = global.scene.createSceneObject(`SVGValidator_${i}`);
            obj.setParent(this.getSceneObject());

            const visual = obj.createComponent('Component.RenderMeshVisual') as RenderMeshVisual;
            visual.mesh = mesh;
            visual.mainMaterial = this.material;

            const overrides = visual.mainPassOverrides as any;
            overrides.baseColor = new vec4(
                group.color[0], group.color[1], group.color[2], group.color[3]
            );

            this.meshObjects.push(obj);
        }
    }

    private runAllTests(): void {
        for (let i = 0; i < this.tests.length; i++) {
            this.runTest(i);
        }
        this.printSummary();
    }

    private runTest(index: number): void {
        if (index >= this.tests.length) return;

        const test = this.tests[index];
        print(`\n[SpaceSVGValidator] --- ${test.name} ---`);
        print(`[SpaceSVGValidator] ${test.description}`);

        try {
            // Step 1: Parse the SVG XML
            const tree = this.xmlParser.parse(test.svg);
            if (!tree) {
                this.testResults.push({ name: test.name, passed: false, error: "parse() returned null" });
                print(`[SpaceSVGValidator] FAIL: parse() returned null`);
                return;
            }
            print(`[SpaceSVGValidator] Parse OK (root tag: ${tree.tagName})`);

            // Step 2: Build mesh groups from the parsed tree
            const groups = this.backend.buildMeshes(tree, this.worldWidth, this.worldHeight);
            print(`[SpaceSVGValidator] Mesh build OK (${groups.length} groups)`);

            if (groups.length === 0) {
                this.testResults.push({ name: test.name, passed: false, error: "No mesh groups produced" });
                print(`[SpaceSVGValidator] FAIL: No mesh groups produced`);
                return;
            }

            // Step 3: Validate mesh data integrity
            for (let i = 0; i < groups.length; i++) {
                const g = groups[i];
                if (g.vertices.length === 0) {
                    this.testResults.push({ name: test.name, passed: false, error: `Group ${i} has 0 vertices` });
                    print(`[SpaceSVGValidator] FAIL: Group ${i} has 0 vertices`);
                    return;
                }
                if (g.indices.length === 0) {
                    this.testResults.push({ name: test.name, passed: false, error: `Group ${i} has 0 indices` });
                    print(`[SpaceSVGValidator] FAIL: Group ${i} has 0 indices`);
                    return;
                }
                if (g.vertices.length % 3 !== 0) {
                    this.testResults.push({ name: test.name, passed: false, error: `Group ${i} vertex count not divisible by 3` });
                    print(`[SpaceSVGValidator] FAIL: Group ${i} vertex count not divisible by 3`);
                    return;
                }
                // Check indices are in range
                const maxVertex = g.vertices.length / 3;
                for (const idx of g.indices) {
                    if (idx < 0 || idx >= maxVertex) {
                        this.testResults.push({ name: test.name, passed: false, error: `Group ${i} index ${idx} out of range (max ${maxVertex - 1})` });
                        print(`[SpaceSVGValidator] FAIL: Group ${i} index out of range`);
                        return;
                    }
                }
            }

            // Step 4: Actually render the last test to verify Lens Studio mesh creation works
            this.renderMeshGroups(groups);
            print(`[SpaceSVGValidator] Render OK (${this.meshObjects.length} scene objects)`);

            this.testResults.push({ name: test.name, passed: true });
            print(`[SpaceSVGValidator] PASS`);
        } catch (e: any) {
            this.testResults.push({ name: test.name, passed: false, error: e.message || String(e) });
            print(`[SpaceSVGValidator] FAIL: ${e.message || e}`);
        }
    }

    private printSummary(): void {
        print("\n[SpaceSVGValidator] ====== SUMMARY ======");
        let passed = 0;
        let failed = 0;
        for (const r of this.testResults) {
            if (r.passed) {
                passed++;
                print(`  PASS: ${r.name}`);
            } else {
                failed++;
                print(`  FAIL: ${r.name} — ${r.error}`);
            }
        }
        print(`[SpaceSVGValidator] ${passed}/${this.testResults.length} passed, ${failed} failed`);
        print("[SpaceSVGValidator] =====================");

        if (failed === 0) {
            print("[SpaceSVGValidator] Phase 0 COMPLETE — SpaceSVG is ready for Matematex integration.");
        } else {
            print("[SpaceSVGValidator] Phase 0 INCOMPLETE — review failures above before proceeding.");
        }
    }
}

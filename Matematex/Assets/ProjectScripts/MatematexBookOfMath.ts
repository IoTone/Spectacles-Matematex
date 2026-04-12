// MatematexBookOfMath.ts — Interactive math formula viewer
//
// Renders 60 math formulas from geometry, algebra, and calculus using the
// Matematex bridge. Navigate with prev/next buttons (SpaceSVGDemo pattern).
// On startup, validates all formulas via KaTeX parse + walk and logs results.
//
// Setup:
//   1. Add to a SceneObject
//   2. Assign lineMaterial, templateText, italicFont (same as MatematexBridge)
//   3. Assign prevButton and nextButton SceneObjects (with Interactable component)
//   4. Run — startup validates all 60 formulas, then shows formula #1

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

import { MATH_FORMULAS, MathFormula } from './MathBookData';

@component
export class MatematexBookOfMath extends BaseScriptComponent {

    // --- Rendering inputs (same as MatematexBridge) ---
    @input lineMaterial: Material;
    @input templateText: SceneObject;
    @input italicFont: Font;

    @input emToWorld: number = 5.0;
    @input textScaleMultiplier: number = 5.0;
    @input layoutWidthMargin: number = 1.18;
    @input italicScaleAdjust: number = 1.0;
    @input textColor: vec4 = new vec4(1, 1, 1, 1);

    // --- Positioning ---
    @input containerWorldZ: number = 39.0;
    @input containerWorldY: number = 0.0;

    // --- Navigation ---
    @input
    @hint("SceneObject with Interactable — pinch to go to previous formula")
    prevButton: SceneObject;

    @input
    @hint("SceneObject with Interactable — pinch to go to next formula")
    nextButton: SceneObject;

    @input
    @hint("Hide template after cloning")
    hideTemplate: boolean = true;

    @input
    @hint("Auto-advance interval in seconds (0 = disabled). Useful for testing without buttons.")
    autoAdvanceSec: number = 0;

    // --- Internal state ---
    private currentIndex: number = 0;
    private container: SceneObject | null = null;
    private labelObj: SceneObject | null = null;
    private chapterLabelObj: SceneObject | null = null;
    private renderer: MatematexSceneRenderer | null = null;
    private templateTextComp: any = null;
    private templateScale: vec3 = new vec3(1, 1, 1);

    onAwake(): void {
        print('[MatematexBook] ====== Book of Math ======');
        print(`[MatematexBook] ${MATH_FORMULAS.length} formulas loaded`);

        if (!this.lineMaterial) {
            print('[MatematexBook] ERROR: assign lineMaterial');
            return;
        }

        const doc = getSpaceDocument();
        if (!doc) {
            print('[MatematexBook] FATAL: SpaceDOM not installed');
            return;
        }

        // Resolve template
        this.resolveTemplate();

        // Create container
        this.container = global.scene.createSceneObject('BookContainer');
        this.container.setParent(this.getSceneObject());
        this.container.getTransform().setWorldPosition(
            new vec3(0, this.containerWorldY, this.containerWorldZ)
        );

        // Create label objects
        this.createLabels();

        // Setup navigation buttons
        this.setupNavigation();

        // Validate all formulas on startup
        this.validateAll(doc);

        // Show first formula
        this.renderFormula(0);
    }

    // ─── Template resolution ─────────────────────────────────

    private resolveTemplate(): void {
        if (!this.templateText) {
            print('[MatematexBook] WARNING: templateText not assigned');
            return;
        }

        const candidates = ['Component.Text', 'Component.Text 3D', 'Component.Text3D', 'Text'];
        for (const t of candidates) {
            try {
                const c = this.templateText.getComponent(t as any);
                if (c) {
                    this.templateTextComp = c;
                    print(`[MatematexBook] Template found via "${t}"`);
                    break;
                }
            } catch (e) { /* ignore */ }
        }

        if (this.templateTextComp) {
            this.templateScale = this.templateText.getTransform().getLocalScale();
            if (this.textScaleMultiplier > 0 && this.textScaleMultiplier !== 1.0) {
                this.templateScale = new vec3(
                    this.templateScale.x * this.textScaleMultiplier,
                    this.templateScale.y * this.textScaleMultiplier,
                    this.templateScale.z * this.textScaleMultiplier,
                );
            }
            if (this.hideTemplate) {
                this.templateText.enabled = false;
            }
        }
    }

    // ─── Label management ────────────────────────────────────

    private createLabels(): void {
        if (!this.container || !this.templateTextComp) return;

        // Formula name label (above the formula)
        this.labelObj = global.scene.createSceneObject('BookLabel');
        this.labelObj.setParent(this.container);
        const labelComp: any = (this.labelObj as any).copyComponent(this.templateTextComp);
        if (labelComp) {
            labelComp.text = '';
            this.labelObj.getTransform().setLocalPosition(new vec3(0, 20, 0.01));
            this.labelObj.getTransform().setLocalScale(new vec3(
                this.templateScale.x * 0.4,
                this.templateScale.y * 0.4,
                this.templateScale.z * 0.4,
            ));
        }

        // Chapter label (below the formula)
        this.chapterLabelObj = global.scene.createSceneObject('ChapterLabel');
        this.chapterLabelObj.setParent(this.container);
        const chapterComp: any = (this.chapterLabelObj as any).copyComponent(this.templateTextComp);
        if (chapterComp) {
            chapterComp.text = '';
            this.chapterLabelObj.getTransform().setLocalPosition(new vec3(0, -20, 0.01));
            this.chapterLabelObj.getTransform().setLocalScale(new vec3(
                this.templateScale.x * 0.3,
                this.templateScale.y * 0.3,
                this.templateScale.z * 0.3,
            ));
        }
    }

    private updateLabels(formula: MathFormula): void {
        if (this.labelObj) {
            const labelComp = this.getTextComp(this.labelObj);
            if (labelComp) {
                labelComp.text = `${formula.id}/${MATH_FORMULAS.length}  ${formula.name}`;
            }
        }
        if (this.chapterLabelObj) {
            const chapterComp = this.getTextComp(this.chapterLabelObj);
            if (chapterComp) {
                chapterComp.text = `Chapter: ${formula.chapter}`;
            }
        }
    }

    private getTextComp(obj: SceneObject): any {
        const candidates = ['Component.Text', 'Component.Text3D', 'Component.Text 3D'];
        for (const t of candidates) {
            try {
                const c = obj.getComponent(t as any);
                if (c) return c;
            } catch (e) { /* ignore */ }
        }
        return null;
    }

    // ─── Navigation ──────────────────────────────────────────

    private setupNavigation(): void {
        let prevBound = false;
        let nextBound = false;

        if (this.prevButton) {
            prevBound = this.bindButton(this.prevButton, () => this.navigate(-1));
        }
        if (this.nextButton) {
            nextBound = this.bindButton(this.nextButton, () => this.navigate(1));
        }

        if (!prevBound && !nextBound) {
            print('[MatematexBook] No buttons bound — using auto-advance if enabled');
        }

        // Auto-advance timer for testing without buttons
        if (this.autoAdvanceSec > 0) {
            print(`[MatematexBook] Auto-advance every ${this.autoAdvanceSec}s`);
            const advanceEvent = this.createEvent('DelayedCallbackEvent') as any;
            const scheduleNext = () => {
                const evt = this.createEvent('DelayedCallbackEvent') as any;
                evt.bind(() => {
                    this.navigate(1);
                    scheduleNext();
                });
                evt.reset(this.autoAdvanceSec);
            };
            scheduleNext();
        }
    }

    private bindButton(buttonObj: SceneObject, callback: () => void): boolean {
        // SIK LabeledPinchButton has Interactable deep in its prefab hierarchy.
        // Recursively search all descendants for any component with onTriggerEnd.
        print(`[MatematexBook] Searching for Interactable on "${buttonObj.name}"...`);

        const searchRecursive = (obj: SceneObject, depth: number): boolean => {
            if (depth > 10) return false; // safety limit

            // Check all components on this object
            for (let i = 0; i < 30; i++) {
                try {
                    const comp = (obj as any).getComponentByIndex?.(i);
                    if (!comp) break;
                    // Look for onTriggerEnd (Interactable) or onButtonPinched (PinchButton)
                    if ((comp as any).onTriggerEnd) {
                        (comp as any).onTriggerEnd.add(callback);
                        print(`[MatematexBook] Bound via onTriggerEnd on "${obj.name}" (depth ${depth})`);
                        return true;
                    }
                    if ((comp as any).onButtonPinched) {
                        (comp as any).onButtonPinched.add(callback);
                        print(`[MatematexBook] Bound via onButtonPinched on "${obj.name}" (depth ${depth})`);
                        return true;
                    }
                } catch (e) { break; }
            }

            // Recurse into children
            for (let c = 0; c < obj.getChildrenCount(); c++) {
                if (searchRecursive(obj.getChild(c), depth + 1)) return true;
            }
            return false;
        };

        const found = searchRecursive(buttonObj, 0);
        if (!found) {
            print(`[MatematexBook] WARNING: no bindable event found in "${buttonObj.name}" hierarchy`);
        }
        return found;
    }

    navigate(direction: number): void {
        this.currentIndex = (this.currentIndex + direction + MATH_FORMULAS.length) % MATH_FORMULAS.length;
        this.renderFormula(this.currentIndex);
    }

    // ─── Rendering ───────────────────────────────────────────

    private renderFormula(index: number): void {
        const formula = MATH_FORMULAS[index];
        if (!formula || !this.container) return;

        print(`\n[MatematexBook] Rendering ${formula.id}/${MATH_FORMULAS.length}: ${formula.name}`);

        // Clear previous rendering
        if (this.renderer) {
            this.renderer.clear();
        }

        // Update labels
        this.updateLabels(formula);

        const doc = getSpaceDocument();
        if (!doc) return;

        try {
            // KaTeX render
            const wrapper = doc.createElement('div');
            // @ts-ignore
            katex.render(formula.latex, wrapper, { throwOnError: true });

            // Find katex-html
            const katexHtml = this.findFirstWithClass(wrapper, 'katex-html');
            if (!katexHtml) {
                print(`[MatematexBook] ERROR: no .katex-html for formula ${formula.id}`);
                return;
            }

            // Walk
            const walker = new MatematexLayoutWalker();
            walker._layoutWidthMargin = this.layoutWidthMargin;
            const result = walker.layout(katexHtml as any, this.emToWorld);

            // Render
            this.renderer = new MatematexSceneRenderer();
            this.renderer._italicScaleAdjust = this.italicScaleAdjust;
            this.renderer.render(
                result.items,
                this.container,
                10,
                this.textColor,
                this.lineMaterial,
                this.templateTextComp,
                this.templateScale,
                this.textScaleMultiplier,
                this.italicFont || null,
            );

            print(`[MatematexBook] OK: ${result.items.length} items, ${result.warnings.length} warnings`);

        } catch (e: any) {
            print(`[MatematexBook] FAIL: ${e.message || e}`);
        }
    }

    // ─── Startup validation ──────────────────────────────────

    private validateAll(doc: any): void {
        print(`\n[MatematexBook] ====== Validating ${MATH_FORMULAS.length} formulas ======`);
        let passed = 0;
        let failed = 0;
        const t0 = Date.now();

        for (const formula of MATH_FORMULAS) {
            try {
                const wrapper = doc.createElement('div');
                // @ts-ignore
                katex.render(formula.latex, wrapper, { throwOnError: true });

                const katexHtml = this.findFirstWithClass(wrapper, 'katex-html');
                if (!katexHtml) {
                    print(`[MatematexBook] [${formula.id}] ${formula.name}: FAIL (no DOM)`);
                    failed++;
                    continue;
                }

                const walker = new MatematexLayoutWalker();
                walker._layoutWidthMargin = this.layoutWidthMargin;
                const result = walker.layout(katexHtml as any, this.emToWorld);

                if (result.items.length > 0) {
                    passed++;
                } else {
                    print(`[MatematexBook] [${formula.id}] ${formula.name}: FAIL (0 items)`);
                    failed++;
                }
            } catch (e: any) {
                print(`[MatematexBook] [${formula.id}] ${formula.name}: FAIL (${e.message?.substring(0, 50)})`);
                failed++;
            }
        }

        const elapsed = Date.now() - t0;
        print(`[MatematexBook] ====== Validation: ${passed}/${MATH_FORMULAS.length} passed, ${failed} failed (${elapsed}ms) ======\n`);
    }

    // ─── Helpers ─────────────────────────────────────────────

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

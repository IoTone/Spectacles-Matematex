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

import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";
// import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
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
    @input
    @hint("Scale factor for sqrt radical width. 1.0 is correct with the overbar clipping fix; lower only if you need to force a shorter overbar.")
    sqrtWidthScale: number = 1.0;
    @input italicScaleAdjust: number = 1.0;
    @input textColor: vec4 = new vec4(1, 1, 1, 1);

    // --- Positioning ---
    // For ON-DEVICE use: parent this script's SceneObject to the Camera Object
    // so content follows the user's head. Position below is relative to parent.
    @input
    @hint("Local Z offset (negative = in front of parent). For device: parent this SceneObject to Camera Object.")
    containerWorldZ: number = -100.0;

    @input
    @hint("Local Y offset (height relative to parent)")
    containerWorldY: number = 0.0;

    @input
    @hint("Use world-space positioning (legacy). Leave OFF for on-device / head-tracked content.")
    useWorldSpace: boolean = false;

    // --- Navigation ---
    @input
    @hint("PinchButton — previous formula")
    prevButton: PinchButton;

    @input
    @hint("PinchButton — next formula")
    nextButton: PinchButton;

    @input
    @hint("PinchButton on the splash/TOC page — jump to Chapter 1 Geometry (formula #1)")
    chapter1Button: PinchButton;

    @input
    @hint("PinchButton on the splash/TOC page — jump to Chapter 2 Algebra (formula #21)")
    chapter2Button: PinchButton;

    @input
    @hint("PinchButton on the splash/TOC page — jump to Chapter 3 Calculus (formula #41)")
    chapter3Button: PinchButton;

    @input
    @hint("Hide template after cloning")
    hideTemplate: boolean = true;

    @input
    @hint("Auto-advance interval in seconds (0 = disabled). Useful for testing without buttons.")
    autoAdvanceSec: number = 0;

    // --- Internal state ---
    // currentIndex: -1 = splash/TOC page, 0..59 = formulas
    private currentIndex: number = -1;
    private container: SceneObject | null = null;
    private labelObj: SceneObject | null = null;
    private chapterLabelObj: SceneObject | null = null;
    private splashObjects: SceneObject[] = [];
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

        // Create container. Use LOCAL positioning so content follows the
        // script's parent (e.g., Camera Object for head-tracked content).
        // Set useWorldSpace=true for fixed-world emulator testing.
        this.container = global.scene.createSceneObject('BookContainer');
        this.container.setParent(this.getSceneObject());
        if (this.useWorldSpace) {
            this.container.getTransform().setWorldPosition(
                new vec3(0, this.containerWorldY, this.containerWorldZ)
            );
        } else {
            this.container.getTransform().setLocalPosition(
                new vec3(0, this.containerWorldY, this.containerWorldZ)
            );
        }

        // Create label objects
        this.createLabels();

        // Setup navigation buttons
        this.setupNavigation();

        // Validate all formulas on startup
        this.validateAll(doc);

        // Start on the splash/TOC page (currentIndex = -1)
        this.renderPage();
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
        // Defer button binding to OnStartEvent (PinchButton initialization
        // order is not guaranteed relative to our onAwake).
        const startEvent = this.createEvent('OnStartEvent');
        startEvent.bind(() => this.bindButtonsOnStart());

        // Auto-advance timer for testing without buttons
        if (this.autoAdvanceSec > 0) {
            print(`[MatematexBook] Auto-advance every ${this.autoAdvanceSec}s`);
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

    private bindButtonsOnStart(): void {
        if (this.prevButton) {
            try {
                const pb = this.prevButton as any;
                if (pb.onButtonPinched && typeof pb.onButtonPinched.add === 'function') {
                    pb.onButtonPinched.add(() => {
                        print('[MatematexBook] prev pinched');
                        this.navigate(-1);
                    });
                    print('[MatematexBook] Bound prevButton.onButtonPinched');
                } else {
                    print(`[MatematexBook] prevButton has no onButtonPinched (keys: ${Object.keys(pb).join(',')})`);
                }
            } catch (e: any) {
                print(`[MatematexBook] Failed to bind prevButton: ${e.message || e}`);
            }
        }
        if (this.nextButton) {
            try {
                const pb = this.nextButton as any;
                if (pb.onButtonPinched && typeof pb.onButtonPinched.add === 'function') {
                    pb.onButtonPinched.add(() => {
                        print('[MatematexBook] next pinched');
                        this.navigate(1);
                    });
                    print('[MatematexBook] Bound nextButton.onButtonPinched');
                } else {
                    print(`[MatematexBook] nextButton has no onButtonPinched (keys: ${Object.keys(pb).join(',')})`);
                }
            } catch (e: any) {
                print(`[MatematexBook] Failed to bind nextButton: ${e.message || e}`);
            }
        }

        // Chapter buttons: jump directly to first formula of each chapter.
        // Formula IDs are 1-based, but MATH_FORMULAS is 0-indexed, so
        // Chapter 1 first formula (id=1) is at index 0, id=21 is at index 20, etc.
        this.bindChapterButton(this.chapter1Button, 0,  'Chapter 1 (Geometry)');
        this.bindChapterButton(this.chapter2Button, 20, 'Chapter 2 (Algebra)');
        this.bindChapterButton(this.chapter3Button, 40, 'Chapter 3 (Calculus)');
    }

    private bindChapterButton(btn: PinchButton | null | undefined, formulaIndex: number, label: string): void {
        if (!btn) return;
        try {
            const pb = btn as any;
            if (pb.onButtonPinched && typeof pb.onButtonPinched.add === 'function') {
                pb.onButtonPinched.add(() => {
                    print(`[MatematexBook] ${label} pinched — jumping to formula #${formulaIndex + 1}`);
                    this.goToFormula(formulaIndex);
                });
                print(`[MatematexBook] Bound ${label} button`);
            } else {
                print(`[MatematexBook] ${label} button has no onButtonPinched`);
            }
        } catch (e: any) {
            print(`[MatematexBook] Failed to bind ${label} button: ${e.message || e}`);
        }
    }

    goToFormula(index: number): void {
        if (index < 0 || index >= MATH_FORMULAS.length) return;
        this.currentIndex = index;
        this.renderPage();
    }

    navigate(direction: number): void {
        // Total pages: 1 splash + 60 formulas = 61.
        // Map currentIndex (-1 to 59) to paged (0 to 60) for modulo, then back.
        const total = MATH_FORMULAS.length + 1;
        const paged = (this.currentIndex + 1 + direction + total) % total;
        this.currentIndex = paged - 1;
        this.renderPage();
    }

    private renderPage(): void {
        // Show chapter buttons only on the splash/TOC page
        const showChapterButtons = (this.currentIndex === -1);
        this.setChapterButtonsEnabled(showChapterButtons);

        if (this.currentIndex === -1) {
            this.renderSplash();
        } else {
            this.renderFormula(this.currentIndex);
        }
    }

    private setChapterButtonsEnabled(enabled: boolean): void {
        const buttons = [this.chapter1Button, this.chapter2Button, this.chapter3Button];
        for (const btn of buttons) {
            if (!btn) continue;
            try {
                const obj = (btn as any).getSceneObject?.() || (btn as any).sceneObject;
                if (obj) {
                    obj.enabled = enabled;
                }
            } catch (e) { /* ignore */ }
        }
    }

    // ─── Rendering ───────────────────────────────────────────

    private renderFormula(index: number): void {
        const formula = MATH_FORMULAS[index];
        if (!formula || !this.container) return;

        print(`\n[MatematexBook] Rendering ${formula.id}/${MATH_FORMULAS.length}: ${formula.name}`);

        // Clear previous rendering (both formula and splash)
        if (this.renderer) {
            this.renderer.clear();
        }
        this.clearSplash();

        // Make sure labels are visible again
        if (this.labelObj) this.labelObj.enabled = true;
        if (this.chapterLabelObj) this.chapterLabelObj.enabled = true;

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
            walker._sqrtWidthScale = this.sqrtWidthScale;
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

    // ─── Splash / TOC page ───────────────────────────────────

    private renderSplash(): void {
        if (!this.container || !this.templateTextComp) return;

        print('[MatematexBook] Rendering splash / TOC page');

        // Clear previous formula rendering and hide formula labels
        if (this.renderer) this.renderer.clear();
        this.clearSplash();
        if (this.labelObj) this.labelObj.enabled = false;
        if (this.chapterLabelObj) this.chapterLabelObj.enabled = false;

        // Vertical layout: stack text lines with spacing
        const lineHeight = 7;
        let y = 40; // start high, descend with each line

        const lines: { text: string; scale: number }[] = [
            { text: 'MATEMATEX',                     scale: 0.8 },
            { text: 'Book of Math',                  scale: 0.6 },
            { text: '',                              scale: 0.3 },
            { text: 'A catalog of 60 theorems from',  scale: 0.35 },
            { text: 'geometry, algebra, and calculus',scale: 0.35 },
            { text: '',                              scale: 0.3 },
            { text: '— Table of Contents —',         scale: 0.4 },
            { text: 'Chapter 1  Geometry     (1–20)', scale: 0.35 },
            { text: 'Chapter 2  Algebra      (21–40)',scale: 0.35 },
            { text: 'Chapter 3  Calculus     (41–60)',scale: 0.35 },
            { text: '',                              scale: 0.3 },
            { text: 'Content sources (CC / public domain):', scale: 0.3 },
            { text: 'ProofWiki  •  DLMF / NIST',     scale: 0.28 },
            { text: 'OpenStax  •  Wikibooks  •  LibreTexts', scale: 0.28 },
            { text: '',                              scale: 0.3 },
            { text: 'Pinch Next to begin',           scale: 0.35 },
            { text: '',                              scale: 0.5 },
            { text: '© IoTone, Inc.',                scale: 0.3 },
        ];

        for (const line of lines) {
            if (line.text.length > 0) {
                this.makeSplashLine(line.text, y, line.scale);
            }
            y -= lineHeight * line.scale / 0.35; // scale-proportional spacing
        }
    }

    private makeSplashLine(text: string, y: number, scaleFactor: number): void {
        if (!this.container || !this.templateTextComp) return;

        const obj = global.scene.createSceneObject('SplashLine');
        obj.setParent(this.container);

        const comp: any = (obj as any).copyComponent(this.templateTextComp);
        if (!comp) return;

        comp.text = text;
        try { (comp.textFill as any).mappingType = 0; } catch (e) { /* ignore */ }
        try { comp.textFill.color = this.textColor; } catch (e) { /* ignore */ }

        obj.getTransform().setLocalPosition(new vec3(0, y, 0.01));
        obj.getTransform().setLocalScale(new vec3(
            this.templateScale.x * scaleFactor,
            this.templateScale.y * scaleFactor,
            this.templateScale.z * scaleFactor,
        ));

        this.splashObjects.push(obj);
    }

    private clearSplash(): void {
        for (const obj of this.splashObjects) {
            obj.destroy();
        }
        this.splashObjects = [];
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
            walker._sqrtWidthScale = this.sqrtWidthScale;
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

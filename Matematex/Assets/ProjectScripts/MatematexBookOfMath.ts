// MatematexBookOfMath.ts — Interactive math formula viewer
//
// Renders 80 math formulas across 4 chapters (Geometry, Algebra, Calculus,
// Linear Algebra) using the Matematex bridge. Three screens: Splash/TOC,
// Search (delegated to MatematexSearchScreen), and Formula. Navigate
// with prev/next buttons or jump via chapter buttons / search results.
// On startup, validates all formulas via KaTeX parse + walk and logs results.
//
// Setup:
//   1. Add to a SceneObject
//   2. Assign lineMaterial, templateText, italicFont (same as MatematexBridge)
//   3. Assign prevButton and nextButton SceneObjects (with Interactable component)
//   4. (Optional) Assign searchScreen — a SceneObject with MatematexSearchScreen
//   5. Run — startup validates all 80 formulas, then shows splash

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
    countRenderableTextNodes,
    applyTextColor,
} from './MatematexBridge';

import { MATH_FORMULAS, MathFormula } from './MathBookData';
import { buildIndex, MathSearchIndex } from './MathSearchIndex';
import { PROOFS, hasProof } from './MathProofData';
import { renderProof } from './MatematexProof';

// Screen state machine. `formulaIndex` is only meaningful when
// currentScreen === Formula. Search is delegated to a sibling
// MatematexSearchScreen component (optional — if not assigned, the
// "Search" entry points are inert and behavior reduces to the v1 viewer).
const enum Screen {
    Splash = 'splash',   // Splash + TOC merged (chapter buttons visible)
    About = 'about',     // Sources, licences, credits — off the splash
    Proof = 'proof',     // Full-viewport visual proof for the current formula
    Search = 'search',   // Delegated to MatematexSearchScreen
    Formula = 'formula', // Single-formula display
}

// ─── Field-of-view budget ───────────────────────────────────────────────
//
// The desktop preview lies about how much you can see. Lens Studio's preview
// camera runs a ~63.5° vertical FOV; Spectacles is ~46° DIAGONAL, roughly 33°
// vertical. At the shipped viewing distance (~101 world units: parent at
// z=-100 + containerWorldZ 39, camera at z=+40) that works out to:
//
//     preview      ±62 world units   ← what you see in Lens Studio
//     Spectacles   ±30 world units   ← what the wearer actually sees
//
// So the preview shows about twice the vertical extent of the device. The
// original splash was 149 units tall — even its title sat off-screen on
// device, while looking perfectly fine on the desktop.
//
// Anything laid out by hand must stay inside this half-height. It's checked at
// runtime rather than left as a comment, because the failure is invisible in
// the only view most of this gets built in.
const SAFE_HALF_HEIGHT = 27;

// Horizontal half-extent, same derivation. Formulas are laid out left-to-right
// from x=0, so without centring a 51-unit formula occupies 0..51 — running 17
// units off the right edge while leaving 34 units of empty space on the left.
// That is what made wide formulas look "pushed over" and clipped.
const SAFE_HALF_WIDTH = 34;

@component
export class MatematexBookOfMath extends BaseScriptComponent {

    // --- Rendering inputs (same as MatematexBridge) ---
    @input lineMaterial: Material;
    @input templateText: SceneObject;
    @input
    @allowUndefined
    @hint("Upright font for non-italic glyphs — should be KaTeX_Main-Regular. The layout measures every upright glyph (digits, operators, parens) with KaTeX_Main metrics, so drawing them in any other font guarantees collisions like the 2 in '2ab' touching the a. Leave empty only to fall back to whatever font the template carries.")
    mainFont: Font;

    @input italicFont: Font;
    @input
    @allowUndefined
    @hint("Bold font (e.g., NotoSans-Bold). Used when the walker encounters \\mathbf or \\boldsymbol. Leave empty to fall back to the regular template font.")
    boldFont: Font;

    // ── Glyph scale ────────────────────────────────────────────────────
    // The pen advances `emToWorld` world units per em, so a glyph must DRAW at
    // that same scale or it will not fit the slot the pen leaves it. Those two
    // numbers were never tied together, and the calibration probe measured the
    // gap directly (identical to 3 decimals across every glyph of a font):
    //
    //     1 em of upright text drew as 6.327 world units   (1.265x too big)
    //     1 em of italic  text drew as 7.968 world units   (1.594x too big)
    //
    // At which point the upright '2's INK (1.767w) was already wider than its
    // whole advance (1.750w) — zero side bearing — and the italic 'a's ink was
    // 1.43x its entire advance. That is the collision every report described:
    // 2ab, b^2, |a|, denominators fouling the fraction bar. It is invisible to
    // the conformance harness, which measures pen positions in em, not ink.
    //
    // The extra italic factor is the two fonts' hhea ascent-descent spans:
    // Lens Studio fits that span to `size`, and KaTeX_Math-Italic's is 0.9350em
    // against KaTeX_Main-Regular's 1.1750em — a ratio of 1.2567, matching the
    // measured 1.594/1.265 = 1.260. So the correction is uniform (both axes),
    // not horizontal: that is why superscripts collided vertically too.
    @input
    @hint("World units per em — the scale factor between LAYOUT and RENDERING. Kept at 5.0 and the DRAWN glyphs shrunk to match, rather than the reverse: total formula width is the pen span, so this value alone decides how many formulas overflow the display (2 of 88 here, against 11 at 6.327). Does not affect layout fidelity: the conformance harness measures in em, so this cancels out.")
    emToWorld: number = 5.0;
    @input
    @hint("SceneObject scale for cloned glyphs. 3.951 = 5.0 / 1.2654, the measured factor by which Text3D over-draws against emToWorld. Changing emToWorld without rescaling this by the same ratio re-breaks glyph spacing.")
    textScaleMultiplier: number = 3.951;
    @input
    @hint("Multiplier on fraction width/bar. 1.0 matches KaTeX exactly. It was set to 1.18 in the scene to stretch bars out to glyphs that were drawn 1.265x oversize — with the scale fixed, that compensation is wrong and 1.0 is correct.")
    layoutWidthMargin: number = 1.0;
    @input
    @hint("Scale factor for sqrt radical width. 1.0 is correct with the overbar clipping fix; lower only if you need to force a shorter overbar.")
    sqrtWidthScale: number = 1.0;
    @input
    @hint("Uniform scale for italic glyphs, on top of textScaleMultiplier. 0.7957 = 935/1175, the ratio of the two fonts' hhea ascent-descent spans — Lens Studio fits that span to the requested size, so KaTeX_Math-Italic draws 1.2567x larger than KaTeX_Main at the same setting. Not a fudge factor: it is read straight out of the font headers.")
    italicScaleAdjust: number = 0.7957;

    @input
    @hint("Extra gap (em) forced after every italic glyph. A RENDERING compensator with no basis in TeX layout — 0 is layout-correct. Raise toward 0.12 only as a stopgap if italic glyphs collide; prefer fixing italicScaleAdjust, which addresses the cause instead of padding around it.")
    italicMinGapEm: number = 0.0;
    @input textColor: vec4 = new vec4(1, 1, 1, 1);

    @input
    @hint("KaTeX displayMode (textbook style). Big operators get above/below limits, fractions and sqrts render larger. Recommended: ON.")
    displayMode: boolean = true;

    // ─── Visual proofs (Phase 7.0) ─────────────────────────────────────
    @input
    @hint("Render visual proofs alongside formulas that have one (currently: Pythagorean Theorem #1). Toggle off to hide.")
    showProofs: boolean = true;

    @input
    @hint("Multiplier from proof units to world units. ~1.5 places a 3-4-5 triangle in a comfortable ~15-unit footprint.")
    proofWorldScale: number = 1.5;

    @input
    @hint("Local X offset for the proof relative to the formula container.")
    proofOffsetX: number = 0.0;

    @input
    @hint("Local Y offset for the proof relative to the formula container. Negative places it below the formula.")
    proofOffsetY: number = -25.0;

    @input
    @hint("Local Z offset for the proof relative to the formula container. More negative pushes the proof further from the user.")
    proofOffsetZ: number = -10.0;

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
    @allowUndefined
    @hint("PinchButton on the splash/TOC page — jump to Chapter 4 Linear Algebra (formula #61). Optional — leave empty if not added to scene yet.")
    chapter4Button: PinchButton;

    @input
    @allowUndefined
    @hint("PinchButton — open the Search screen. Optional.")
    searchButton: PinchButton;

    @input
    @allowUndefined
    @hint("PinchButton — toggle the About page (sources, licences, credits). Pinching it again returns to the splash. Optional.")
    aboutButton: PinchButton;

    @input
    @allowUndefined
    @hint("PinchButton — show the visual proof for the current formula, full size. Only appears on formulas that have one. Pinching it again returns to the formula. Optional.")
    proofButton: PinchButton;

    @input
    @allowUndefined
    @hint("SceneObject hosting the MatematexSearchScreen component. Optional — search is unavailable if empty.")
    searchScreen: SceneObject;

    @input
    @hint("Hide template after cloning")
    hideTemplate: boolean = true;

    @input
    @hint("Auto-advance interval in seconds (0 = disabled). Useful for testing without buttons.")
    autoAdvanceSec: number = 0;

    @input
    @hint("Log the first few glyphs of each formula with their metric advance vs their drawn width. Use when glyphs collide or drift: a ratio far from 1.0 means the layout and the renderer disagree about how big an em is.")
    calibrationProbe: boolean = false;

    // --- Internal state ---
    // currentScreen: which screen is active.
    // formulaIndex: 0..(N-1) — only valid when currentScreen === Screen.Formula.
    private currentScreen: Screen = Screen.Splash;
    private formulaIndex: number = 0;
    private container: SceneObject | null = null;
    private labelObj: SceneObject | null = null;
    private chapterLabelObj: SceneObject | null = null;
    private splashObjects: SceneObject[] = [];
    private renderer: MatematexSceneRenderer | null = null;
    private templateTextComp: any = null;
    private templateScale: vec3 = new vec3(1, 1, 1);
    private searchIndex: MathSearchIndex | null = null;
    private proofContainer: SceneObject | null = null;
    // Holds the rendered formula so it can be centred and, if needed, shrunk to
    // fit — without disturbing the labels, which stay on `container`.
    private formulaFit: SceneObject | null = null;

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

        // Formula content lives under its own transform so it can be centred
        // and scaled independently of the labels.
        this.formulaFit = global.scene.createSceneObject('FormulaFit');
        this.formulaFit.setParent(this.container);

        // Create label objects
        this.createLabels();

        // Setup navigation buttons
        this.setupNavigation();

        // Build the search index (cheap — ~80 entries)
        this.searchIndex = buildIndex(MATH_FORMULAS);

        // Validate all formulas on startup
        this.validateAll(doc);

        // Start on the splash/TOC screen
        this.showScreen(Screen.Splash);
    }

    /** Public accessor for the search index. The MatematexSearchScreen reads
     *  this to query results and calls back via {@link goToFormula}. */
    getSearchIndex(): MathSearchIndex | null {
        return this.searchIndex;
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
            applyTextColor(labelComp, this.textColor);
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
            applyTextColor(chapterComp, this.textColor);
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
        // Formula IDs are 1-based, but MATH_FORMULAS is 0-indexed.
        this.bindChapterButton(this.chapter1Button, 0,  'Chapter 1 (Geometry)');
        this.bindChapterButton(this.chapter2Button, 20, 'Chapter 2 (Algebra)');
        this.bindChapterButton(this.chapter3Button, 40, 'Chapter 3 (Calculus)');
        this.bindChapterButton(this.chapter4Button, 60, 'Chapter 4 (Linear Algebra)');

        this.alignChapterButtons();

        // Proof button — toggles the full-size proof view
        if (this.proofButton) {
            try {
                const pb = this.proofButton as any;
                if (pb.onButtonPinched && typeof pb.onButtonPinched.add === 'function') {
                    pb.onButtonPinched.add(() => {
                        print('[MatematexBook] proof pinched');
                        this.toggleProof();
                    });
                    print('[MatematexBook] Bound proofButton.onButtonPinched');
                }
            } catch (e: any) {
                print(`[MatematexBook] Failed to bind proofButton: ${e.message || e}`);
            }
        }

        // About button — toggles the About page
        if (this.aboutButton) {
            try {
                const ab = this.aboutButton as any;
                if (ab.onButtonPinched && typeof ab.onButtonPinched.add === 'function') {
                    ab.onButtonPinched.add(() => {
                        print('[MatematexBook] about pinched');
                        this.toggleAbout();
                    });
                    print('[MatematexBook] Bound aboutButton.onButtonPinched');
                }
            } catch (e: any) {
                print(`[MatematexBook] Failed to bind aboutButton: ${e.message || e}`);
            }
        }

        // Search button — opens the search screen (no-op if no searchScreen wired)
        if (this.searchButton) {
            try {
                const sb = this.searchButton as any;
                if (sb.onButtonPinched && typeof sb.onButtonPinched.add === 'function') {
                    sb.onButtonPinched.add(() => {
                        print('[MatematexBook] search pinched');
                        this.showScreen(Screen.Search);
                    });
                    print('[MatematexBook] Bound searchButton.onButtonPinched');
                }
            } catch (e: any) {
                print(`[MatematexBook] Failed to bind searchButton: ${e.message || e}`);
            }
        }
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

    /** Return to the splash / table-of-contents screen.
     *
     *  Exists so collaborators don't have to reach for `showScreen` with a
     *  stringly-typed argument: `Screen` is a non-exported const enum, so
     *  `MatematexSearchScreen` previously had to cast to `any` and pass the
     *  literal `'splash'`, kept in sync by a comment. That is the search
     *  screen's ONLY way out — if the literal ever drifted from the enum the
     *  user would be stuck there with no error. */
    goToSplash(): void {
        this.showScreen(Screen.Splash);
    }

    /** Jump to a specific formula by zero-based index. Switches to Formula screen. */
    goToFormula(index: number): void {
        if (index < 0 || index >= MATH_FORMULAS.length) return;
        this.formulaIndex = index;
        this.showScreen(Screen.Formula);
    }

    /** Move to prev/next formula. Wraps Splash → first formula and last formula → Splash.
     *  Only meaningful from Splash or Formula screens. */
    navigate(direction: number): void {
        if (this.currentScreen === Screen.Search) {
            // From search, prev/next does nothing — close search first.
            return;
        }
        const N = MATH_FORMULAS.length;
        // Splash counts as a virtual page at index -1. Total pages = N + 1.
        const total = N + 1;
        const currentPaged =
            this.currentScreen === Screen.Splash ? 0 : this.formulaIndex + 1;
        const nextPaged = (currentPaged + direction + total) % total;
        if (nextPaged === 0) {
            this.showScreen(Screen.Splash);
        } else {
            this.formulaIndex = nextPaged - 1;
            this.showScreen(Screen.Formula);
        }
    }

    /** Switch to a screen and render it. Single source of truth for screen
     *  transitions — handles tearing down per-screen UI and toggling button visibility. */
    showScreen(screen: Screen): void {
        this.currentScreen = screen;

        // Show chapter + search buttons only on Splash. Hide them on Formula
        // and Search to avoid visual clutter.
        const onSplash = screen === Screen.Splash;
        const onAbout = screen === Screen.About;
        const onSearch = screen === Screen.Search;
        const onProof = screen === Screen.Proof;

        // The proof affordance only makes sense where a proof exists. Offering
        // it on all 80 formulas and doing nothing for 75 of them would be worse
        // than not offering it at all.
        const formulaHasProof = hasProof(MATH_FORMULAS[this.formulaIndex]?.id ?? -1);
        this.setSceneObjectEnabled(
            this.proofButton,
            (screen === Screen.Formula && formulaHasProof) || onProof,
        );

        this.setChapterButtonsEnabled(onSplash);
        this.setSceneObjectEnabled(this.searchButton, onSplash);

        // About stays reachable ON the about page too — pinching it again is
        // the way back, so it must not hide itself.
        this.setSceneObjectEnabled(this.aboutButton, onSplash || onAbout);

        // Prev/next belong to the book, not to these full-screen pages —
        // leaving them on floated them over the search chips. `navigate()`
        // already ignores them there, so they were inert as well as in the way.
        this.setSceneObjectEnabled(this.prevButton, !onSearch && !onAbout && !onProof);
        this.setSceneObjectEnabled(this.nextButton, !onSearch && !onAbout && !onProof);

        // Show/hide the SearchScreen scene object based on screen.
        if (this.searchScreen) {
            this.searchScreen.enabled = onSearch;
        }

        if (screen === Screen.Splash) {
            this.renderSplash();
        } else if (screen === Screen.About) {
            this.renderAbout();
        } else if (screen === Screen.Proof) {
            this.renderProofScreen();
        } else if (screen === Screen.Formula) {
            this.renderFormula(this.formulaIndex);
        } else if (screen === Screen.Search) {
            this.renderSearch();
        }
    }

    /** Toggle the full-size proof view for the current formula. Like About,
     *  the button doubles as the way back, since prev/next hide there. */
    toggleProof(): void {
        this.showScreen(this.currentScreen === Screen.Proof ? Screen.Formula : Screen.Proof);
    }

    /** Toggle the About page. Bound to a single button, which doubles as the
     *  way back — About is a dead end otherwise, since prev/next are hidden. */
    toggleAbout(): void {
        this.showScreen(this.currentScreen === Screen.About ? Screen.Splash : Screen.About);
    }

    private renderSearch(): void {
        // Tear down formula + splash + proof content; the SearchScreen owns its own UI.
        if (this.renderer) this.renderer.clear();
        this.clearSplash();
        this.clearProof();
        if (this.labelObj) this.labelObj.enabled = false;
        if (this.chapterLabelObj) this.chapterLabelObj.enabled = false;

        if (!this.searchScreen) {
            print('[MatematexBook] WARN: search screen requested but no searchScreen assigned');
            // Fall back to splash so the user isn't stranded.
            this.showScreen(Screen.Splash);
            return;
        }
        // The MatematexSearchScreen component is expected to populate itself
        // when its SceneObject becomes enabled. Nothing else to do here.
    }

    /** Snap each chapter button to the y of the TOC row it selects.
     *
     *  Driven from CHAPTER_BUTTON_Y rather than left to the scene, because the
     *  two drifted apart the moment the splash was re-flowed: the buttons kept
     *  their old positions and ended up beside the wrong lines. Only x and z
     *  are respected from the scene, so horizontal placement stays editable. */
    private alignChapterButtons(): void {
        const buttons = [this.chapter1Button, this.chapter2Button, this.chapter3Button, this.chapter4Button];
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            if (!btn) continue;
            try {
                const obj = (btn as any).getSceneObject?.() || (btn as any).sceneObject;
                if (!obj) continue;
                const t = obj.getTransform();
                const p = t.getLocalPosition();
                t.setLocalPosition(new vec3(p.x, MatematexBookOfMath.CHAPTER_BUTTON_Y[i], p.z));
            } catch (e) { /* ignore */ }
        }
    }

    private setChapterButtonsEnabled(enabled: boolean): void {
        const buttons = [this.chapter1Button, this.chapter2Button, this.chapter3Button, this.chapter4Button];
        for (const btn of buttons) {
            this.setSceneObjectEnabled(btn, enabled);
        }
    }

    private setSceneObjectEnabled(btn: PinchButton | null | undefined, enabled: boolean): void {
        if (!btn) return;
        try {
            const obj = (btn as any).getSceneObject?.() || (btn as any).sceneObject;
            if (obj) obj.enabled = enabled;
        } catch (e) { /* ignore */ }
    }

    // ─── Rendering ───────────────────────────────────────────

    private renderFormula(index: number): void {
        const formula = MATH_FORMULAS[index];
        if (!formula || !this.container) return;

        print(`\n[MatematexBook] Rendering ${formula.id}/${MATH_FORMULAS.length}: ${formula.name}`);

        // Clear previous rendering (formula, splash, proof)
        if (this.renderer) {
            this.renderer.clear();
        }
        this.clearSplash();
        this.clearProof();

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
            katex.render(formula.latex, wrapper, { throwOnError: true, displayMode: this.displayMode });

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
            walker._italicMinGapEm = this.italicMinGapEm;
            const result = walker.layout(katexHtml as any, this.emToWorld);

            // Render
            this.renderer = new MatematexSceneRenderer();
            this.renderer._italicScaleAdjust = this.italicScaleAdjust;
            this.renderer._probeEmToWorld = this.emToWorld;
            if (this.calibrationProbe) this.renderer._calibrationSamples = 8;
            // Centre the formula and shrink it if it would run off the display.
            // The walker lays out from x=0 rightward, so the natural centre is
            // width/2, not 0.
            const fit = this.formulaFit || this.container;
            const w = result.width;
            const shrink = w > SAFE_HALF_WIDTH * 2 ? (SAFE_HALF_WIDTH * 2) / w : 1;
            fit.getTransform().setLocalScale(new vec3(shrink, shrink, 1));
            fit.getTransform().setLocalPosition(new vec3(-w * shrink / 2, 0, 0));
            if (shrink < 1) {
                print(`[MatematexBook] formula ${formula.id} is ${w.toFixed(1)} units wide — ` +
                      `scaled to ${(shrink * 100).toFixed(0)}% to fit the ±${SAFE_HALF_WIDTH} display`);
            }

            this.renderer.render(
                result.items,
                fit,
                10,
                this.textColor,
                this.lineMaterial,
                this.templateTextComp,
                this.templateScale,
                this.textScaleMultiplier,
                this.italicFont || null,
                this.boldFont || null,
                this.mainFont || null,
            );

            print(`[MatematexBook] OK: ${result.items.length} items, ${result.warnings.length} warnings`);

            // Bounds are only valid once the glyph meshes exist, so the
            // calibration report has to wait a frame.
            if (this.calibrationProbe) {
                const probeEvt = this.createEvent('DelayedCallbackEvent') as any;
                probeEvt.bind(() => { if (this.renderer) this.renderer.runCalibrationReport(); });
                probeEvt.reset(0.2);
            }

        } catch (e: any) {
            print(`[MatematexBook] FAIL: ${e.message || e}`);
        }

        // No inline proof thumbnail. It was drawn under the formula at a size
        // that made its labels collide with each other and with the chapter
        // label, and most of it fell below the display anyway. The Proof button
        // shows the same figure with the whole viewport to itself.
    }

    /** Full-viewport proof. The inline thumbnail under a formula never had room
     *  — it hangs from y −25 downward, and the device only shows to about −27,
     *  so almost all of it fell off the display. Giving the proof its own screen
     *  lets it use the whole budget and auto-scale to fit. */
    private renderProofScreen(): void {
        if (!this.container || !this.templateTextComp) return;

        if (this.renderer) this.renderer.clear();
        this.clearSplash();
        this.clearProof();
        const formula = MATH_FORMULAS[this.formulaIndex];
        const proof = formula ? PROOFS[formula.id] : undefined;
        if (!proof) {
            print('[MatematexBook] proof screen requested but this formula has none');
            this.showScreen(Screen.Formula);
            return;
        }

        // Reuse the existing name/chapter label slots rather than letting the
        // proof draw its own title and caption. renderProof's title was landing
        // on top of the name label saying the same thing, at 1.2x formula size.
        if (this.labelObj) {
            this.labelObj.enabled = true;
            const c = this.getTextComp(this.labelObj);
            if (c) c.text = proof.title || formula.name;
        }
        if (this.chapterLabelObj) {
            this.chapterLabelObj.enabled = !!proof.caption;
            const c = this.getTextComp(this.chapterLabelObj);
            if (c) c.text = proof.caption || '';
        }

        try {
            this.proofContainer = renderProof(proof, {
                parent: this.container,
                lineMaterial: this.lineMaterial,
                templateTextComp: this.templateTextComp,
                templateScale: this.templateScale,
                worldScale: this.proofWorldScale, // ignored — fitBox wins
                defaultColor: this.textColor,
                offset: new vec3(0, -2, this.proofOffsetZ),
                anchor: 'center',
                showTitleCaption: false,
                // Headroom for the name label at +20 and the caption at −20.
                fitBox: { halfWidth: SAFE_HALF_WIDTH - 4, halfHeight: SAFE_HALF_HEIGHT - 9 },
            });
            print(`[MatematexBook] Proof screen rendered for #${formula.id}`);
        } catch (e: any) {
            print(`[MatematexBook] Proof screen failed: ${e.message || e}`);
        }
    }

    private clearProof(): void {
        if (this.proofContainer) {
            this.proofContainer.destroy();
            this.proofContainer = null;
        }
    }

    // ─── Splash / TOC page ───────────────────────────────────

    private renderSplash(): void {
        if (!this.container || !this.templateTextComp) return;

        print('[MatematexBook] Rendering splash / TOC page');

        // Clear previous formula rendering, proof, and hide formula labels
        if (this.renderer) this.renderer.clear();
        this.clearSplash();
        this.clearProof();
        if (this.labelObj) this.labelObj.enabled = false;
        if (this.chapterLabelObj) this.chapterLabelObj.enabled = false;

        // Explicit `y` per line rather than an accumulator: it keeps the whole
        // page visible at a glance and makes the FOV check below meaningful.
        // Chapter rows sit at the same y as their pinch buttons (see
        // CHAPTER_BUTTON_Y) so each button reads as belonging to its line.
        this.renderLines('splash', [
            { text: 'MATEMATEX',                              scale: 0.70, y:  25 },
            { text: 'Book of Math',                           scale: 0.42, y:  17 },
            { text: `${MATH_FORMULAS.length} theorems · geometry, algebra, calculus, linear algebra`,
                                                              scale: 0.24, y:  11 },
            { text: '— Table of Contents —',                  scale: 0.30, y:   4 },
            { text: 'Chapter 1   Geometry           (1–20)',  scale: 0.28, y:  -3 },
            { text: 'Chapter 2   Algebra            (21–40)', scale: 0.28, y:  -9 },
            { text: 'Chapter 3   Calculus           (41–60)', scale: 0.28, y: -15 },
            { text: 'Chapter 4   Linear Algebra     (61–80)', scale: 0.28, y: -21 },
        ]);
    }

    /** Y positions of the chapter pinch buttons — shared with renderSplash so
     *  the buttons line up with the TOC rows they select. */
    private static readonly CHAPTER_BUTTON_Y = [-3, -9, -15, -21];

    // ─── About page ──────────────────────────────────────────
    //
    // Attribution has to appear somewhere, but it was the tail of the splash —
    // five lines of sources and a copyright that pushed the page to 149 units
    // and shoved everything useful off the top of the display. It is reference
    // material, not a landing screen, so it lives behind a button.

    private renderAbout(): void {
        if (!this.container || !this.templateTextComp) return;

        print('[MatematexBook] Rendering about page');
        if (this.renderer) this.renderer.clear();
        this.clearSplash();
        this.clearProof();
        if (this.labelObj) this.labelObj.enabled = false;
        if (this.chapterLabelObj) this.chapterLabelObj.enabled = false;

        this.renderLines('about', [
            { text: 'About',                                   scale: 0.55, y:  22 },
            { text: 'Matematex · Book of Math',                scale: 0.30, y:  14 },
            { text: `${MATH_FORMULAS.length} theorems rendered on-device with KaTeX`,
                                                               scale: 0.24, y:   8 },
            { text: 'Content sources (CC / public domain)',    scale: 0.26, y:   0 },
            { text: 'ProofWiki  ·  DLMF / NIST',               scale: 0.24, y:  -6 },
            { text: 'OpenStax  ·  Wikibooks  ·  LibreTexts',   scale: 0.24, y: -12 },
            { text: 'Wikipedia (CC BY-SA)',                    scale: 0.24, y: -18 },
            { text: '© IoTone, Inc.',                          scale: 0.24, y: -25 },
        ]);
    }

    /** Emit a page of text lines and assert the page fits the device FOV.
     *
     *  The check is here because the failure mode is silent: a page that runs
     *  off the display looks correct in the Lens Studio preview, which sees
     *  roughly twice the vertical extent Spectacles does. */
    private renderLines(
        page: string,
        lines: { text: string; scale: number; y: number }[],
    ): void {
        let top = -Infinity;
        let bottom = Infinity;
        for (const line of lines) {
            if (!line.text) continue;
            this.makeSplashLine(line.text, line.y, line.scale);
            if (line.y > top) top = line.y;
            if (line.y < bottom) bottom = line.y;
        }
        if (top > SAFE_HALF_HEIGHT || bottom < -SAFE_HALF_HEIGHT) {
            print(
                `[MatematexBook] WARNING: "${page}" spans y ${bottom.toFixed(0)}..${top.toFixed(0)}, ` +
                `outside the ±${SAFE_HALF_HEIGHT} device FOV budget — it will look fine in ` +
                `preview and be clipped on Spectacles`,
            );
        }
    }

    private makeSplashLine(text: string, y: number, scaleFactor: number): void {
        if (!this.container || !this.templateTextComp) return;

        const obj = global.scene.createSceneObject('SplashLine');
        obj.setParent(this.container);

        const comp: any = (obj as any).copyComponent(this.templateTextComp);
        if (!comp) return;

        comp.text = text;
        applyTextColor(comp, this.textColor);

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
        let dropped = 0;
        const t0 = Date.now();

        for (const formula of MATH_FORMULAS) {
            try {
                const wrapper = doc.createElement('div');
                // @ts-ignore
                katex.render(formula.latex, wrapper, { throwOnError: true, displayMode: this.displayMode });

                const katexHtml = this.findFirstWithClass(wrapper, 'katex-html');
                if (!katexHtml) {
                    print(`[MatematexBook] [${formula.id}] ${formula.name}: FAIL (no DOM)`);
                    failed++;
                    continue;
                }

                const walker = new MatematexLayoutWalker();
                walker._layoutWidthMargin = this.layoutWidthMargin;
                walker._sqrtWidthScale = this.sqrtWidthScale;
            walker._italicMinGapEm = this.italicMinGapEm;
                const result = walker.layout(katexHtml as any, this.emToWorld);

                if (result.items.length === 0) {
                    print(`[MatematexBook] [${formula.id}] ${formula.name}: FAIL (0 items)`);
                    failed++;
                    continue;
                }

                // Structural check: every text node KaTeX produced must survive
                // the walk. Item-count > 0 alone would pass a formula that lost
                // an entire sub-expression — see countRenderableTextNodes.
                const expectedText = countRenderableTextNodes(katexHtml as any);
                const actualText = result.items.filter(
                    (i: LayoutItem) => i.kind === 'text',
                ).length;
                if (actualText !== expectedText) {
                    print(
                        `[MatematexBook] [${formula.id}] ${formula.name}: ` +
                        `FAIL (dropped content — ${actualText}/${expectedText} text items)`,
                    );
                    dropped++;
                    failed++;
                    continue;
                }

                passed++;
            } catch (e: any) {
                print(`[MatematexBook] [${formula.id}] ${formula.name}: FAIL (${e.message?.substring(0, 50)})`);
                failed++;
            }
        }

        const elapsed = Date.now() - t0;
        const droppedNote = dropped > 0 ? `, ${dropped} with DROPPED CONTENT` : '';
        print(`[MatematexBook] ====== Validation: ${passed}/${MATH_FORMULAS.length} passed, ${failed} failed${droppedNote} (${elapsed}ms) ======\n`);
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

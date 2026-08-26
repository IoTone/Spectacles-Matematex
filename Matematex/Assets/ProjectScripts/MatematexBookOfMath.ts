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

import { getTextWidthEm } from './KaTeXFontMetrics';
import { MATH_FORMULAS, MathFormula } from './MathBookData';
import { buildIndex, MathSearchIndex } from './MathSearchIndex';
import { PROOFS, hasProof } from './MathProofData';
import { renderProof } from './MatematexProof';
import { MatematexCover } from './MatematexCover';

// Screen state machine. `formulaIndex` is only meaningful when
// currentScreen === Formula. Search is delegated to a sibling
// MatematexSearchScreen component (optional — if not assigned, the
// "Search" entry points are inert and behavior reduces to the v1 viewer).
const enum Screen {
    Cover = 'cover',     // The closed book. Where the lens opens.
    Splash = 'splash',   // Half title. A cover's worth of quiet, nothing else.
    Contents = 'contents', // Table of contents — its own page, as in a book
    About = 'about',     // Sources, licences, credits — off the splash
    Proof = 'proof',     // Full-viewport visual proof for the current formula
    Search = 'search',   // Delegated to MatematexSearchScreen
    Formula = 'formula', // Single-formula display
}

/** The lens version, shown on the About page.
 *
 *  One constant, in the component that owns the About page, because that is the
 *  only place it is displayed. If it ever needs to appear somewhere else — a
 *  cover, a log line — import it from here rather than typing it twice; a
 *  version that disagrees with itself is worse than no version. */
export const MATEMATEX_VERSION = 'v0.1.2';

// ─── Field-of-view budget ───────────────────────────────────────────────
//
// The desktop preview lies about how much you can see. Lens Studio's preview
// camera runs a ~63.5° vertical FOV; Spectacles is ~46° DIAGONAL, roughly 33°
// vertical. At the shipped viewing distance (~131 world units: parent at
// z=-130 + containerWorldZ 39, camera at z=+40) that works out to:
//
//     preview      ±80 world units   ← what you see in Lens Studio
//     Spectacles   ±39 world units   ← what the wearer actually sees
//
// The parent group moved back from z −100 to −130 because at 101 units the
// book was too close to read comfortably AND the ±37 sheet ran off the display
// top and bottom. At 131 the whole sheet subtends 15.8°, inside the 16.5°
// half-angle, so the page edges are visible without stepping back. Everything
// below is in the same world units, so nothing else had to change — the type
// simply subtends less.
//
// So the preview shows about twice the vertical extent of the device. The
// original splash was 149 units tall — even its title sat off-screen on
// device, while looking perfectly fine on the desktop.
//
// Anything laid out by hand must stay inside this half-height. It's checked at
// runtime rather than left as a comment, because the failure is invisible in
// the only view most of this gets built in.
const SAFE_HALF_HEIGHT = 27;

// ─── Page geometry ──────────────────────────────────────────────────────
//
// The book is a PORTRAIT sheet, drawn by MatematexPage, and it is deliberately
// TALLER than the FOV budget above: a real book at reading distance does not
// fit in your field of view either, and the book is world-locked, so a reader
// who wants the whole sheet steps back. What must stay inside ±SAFE_HALF_HEIGHT
// is the TYPE AREA — everything you have to be able to read without moving.
// The sheet's head and foot margins are what run past the edge of vision.
//
// PAGE_* must track the MatematexPage component's halfWidth/halfHeight inputs.
const PAGE_HALF_WIDTH = 26;
const PAGE_HALF_HEIGHT = 37;

// Horizontal half-extent of the type area. Formulas are laid out left-to-right
// from x=0, so without centring a 51-unit formula occupies 0..51 — running off
// the right edge while leaving empty space on the left. That is what made wide
// formulas look "pushed over" and clipped.
//
// 24, not the 34 this was while the page was landscape: 24 leaves a 2-unit
// margin inside the sheet. It costs legibility on wide formulas — 17 of the 80
// now get scaled down to fit, worst case #40 De Moivre at 64% — and that price
// was paid knowingly. `test/layout-conformance/page-fit-audit.ts --half-width=N`
// re-prices it against all 80 in a couple of seconds if this number moves.
const SAFE_HALF_WIDTH = 24;

// Where the page furniture sits, in type-area coordinates. Running head and
// folio go at the TOP OF THE TYPE AREA, not the top of the sheet — a page
// number you have to tilt your head to read is not a page number.
const RUNNING_HEAD_Y = 25;
const BUTTON_ROW_Y = -28;
const BUTTON_ROW_X = 15;
/** Prev/next sit at the foot of the sheet, below the other controls. */
const PREV_NEXT_Y = -34;
/** How far IN FRONT of the content plane the buttons sit.
 *
 *  They used to sit wherever the scene put them — z 60 against the container's
 *  39, i.e. 21 units nearer the reader. That is not a cosmetic difference: a
 *  nearer plane has a smaller visible half-height, so the same `y` number meant
 *  a different ANGLE for a button than for a line of text. prev/next at y 32
 *  worked out to 21.8 degrees off centre against a 16.5 degree limit — the
 *  forward button was not merely small, it was off the display entirely.
 *
 *  Putting them on the content plane plus a small lift makes one set of
 *  coordinates mean one thing, and keeps the controls reading as floating just
 *  above the page rather than embedded in it. */
const BUTTON_PLANE_LIFT = 5;
/** Text scale for the running head — small enough to be furniture. */
const FURNITURE_SCALE = 0.22;
/** The folio is set at twice the running head. A page number is the one piece
 *  of furniture a reader actively looks FOR, and at 0.22 it read as a smudge in
 *  the corner rather than as a number. */
const FOLIO_SCALE = 0.44;

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
    @hint("Local Z offset for the proof relative to the formula container. Must stay IN FRONT of the page (MatematexPage.pageZ, −0.6) — a proof is printed on the page, not floating behind it.")
    proofOffsetZ: number = 0.5;

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

    // ─── Page-turn sound ─────────────────────────────────────────────
    //
    // Owned by the BOOK, not by the swipe detector. The page turns from three
    // places — a swipe, the prev/next buttons, and a jump out of search — and a
    // sound that only one of them makes is a sound that seems broken. The book
    // is the thing that knows a page turned.
    //
    // Credit: "Textbook page turn" by freesound user 21100267,
    // https://freesound.org/people/21100267/sounds/591291/ — also on the About
    // page, where a reader can see it.

    @input
    @allowUndefined
    @hint("The MatematexPage SceneObject that draws the grid-paper sheet. Hidden on the cover.")
    pageSheet: SceneObject;

    @input
    @allowUndefined
    @hint("KaTeX_Size1-Regular — small operators and the smaller scaled delimiters. Also the only shipped face carrying U+2016, which stretchy norm bars are built from.")
    size1Font: Font;

    @input
    @allowUndefined
    @hint("KaTeX_Size2-Regular — display-size large operators. Without it \\int is laid out 2.22em tall and drawn 0.89em, and \\sum has no glyph at all.")
    size2Font: Font;

    @input
    @allowUndefined
    @hint("MatematexCover component — the closed book the lens opens on. Optional: without it the lens opens on the half title instead.")
    cover: MatematexCover;

    @input
    @allowUndefined
    @hint("The page-turn recording. Optional — without it, turns are silent. The AudioComponent that plays it is created in script, so there is nothing else to wire.")
    pageTurnTrack: AudioTrackAsset;

    @input('int', '10')
    @hint("How many one-second windows to pick from in the recording. The source is 11.3s of repeated page turns, so each window is a different turn and no two consecutive pages sound identical.")
    soundWindows: number;

    @input('float', '1.0')
    @hint("Seconds of audio played per turn.")
    soundWindowLength: number;

    @input('float', '1.0')
    @hint("Playback volume for the turn.")
    soundVolume: number;

    @input('vec4', '{1.00, 0.78, 0.35, 1.00}')
    @hint("Colour of the XR superscript on the title page. Gold by default — the title page carries no proof, so this is free to be an accent rather than one of the proof palette's four meaning-bearing hues.")
    titleAccentColor: vec4;

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
    private currentScreen: Screen = Screen.Cover;
    private formulaIndex: number = 0;
    private container: SceneObject | null = null;
    private labelObj: SceneObject | null = null;
    private chapterLabelObj: SceneObject | null = null;
    /** Page furniture: chapter name upper left, page number upper right. */
    private runningHeadObj: SceneObject | null = null;
    private folioObj: SceneObject | null = null;
    private turnAudio: AudioComponent | null = null;
    private stopSoundEvt: any = null;
    private warnedNoSeek: boolean = false;
    /** Counted rather than announced one by one: nine "Bound X" lines at every
     *  launch buried the two lines that actually matter. A failure still
     *  prints — that is the case worth hearing about. */
    private boundButtons: number = 0;
    private splashObjects: SceneObject[] = [];
    private renderer: MatematexSceneRenderer | null = null;
    private templateTextComp: any = null;
    private templateScale: vec3 = new vec3(1, 1, 1);
    private searchIndex: MathSearchIndex | null = null;
    private proofContainer: SceneObject | null = null;
    // Reused one-shot for the proof-build frame timer — see renderProofScreen.
    private _proofFrameEvt: any = null;
    private _proofFrameStart: number = 0;
    private _proofFrameId: number = 0;
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

        this.checkCalibration();

        // Setup navigation buttons
        this.setupNavigation();
        this.setupPageTurnAudio();

        // Build the search index (cheap — ~80 entries)
        this.searchIndex = buildIndex(MATH_FORMULAS);

        // Validate all formulas on startup
        this.validateAll(doc);

        // Open on the cover — but on START, not on AWAKE.
        //
        // showScreen() calls into MatematexCover, a sibling @component. During
        // our onAwake that component may not have been awoken yet, and calling
        // a method on it then throws "TypeError: not a function" followed by
        // "Component is not yet awake" — the whole lens dies on the first
        // frame. Awake order between components is not guaranteed; OnStartEvent
        // runs after every component has awoken, which is what makes it safe.
        // This is the same reason setupNavigation defers its button binding.
        const startEvt = this.createEvent('OnStartEvent');
        startEvt.bind(() => this.showScreen(Screen.Cover));
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

        // Page furniture. Unlike the name and chapter labels these are not
        // about the formula — they are about the PAGE, which is why they sit at
        // the corners of the type area and use the same small size on every
        // screen that has them. A book tells you where you are without being
        // asked.
        this.runningHeadObj = this.makeFurnitureLabel('RunningHead', FURNITURE_SCALE);
        this.folioObj = this.makeFurnitureLabel('Folio', FOLIO_SCALE);

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

    /** One corner label of the page furniture. Small, dim, always in the same
     *  place. Returns null if the template is missing, which the callers treat
     *  as "no furniture" rather than failing the page. */
    private makeFurnitureLabel(name: string, scale: number): SceneObject | null {
        if (!this.container || !this.templateTextComp) return null;
        const obj = global.scene.createSceneObject(name);
        obj.setParent(this.container);
        const comp: any = (obj as any).copyComponent(this.templateTextComp);
        if (!comp) { obj.destroy(); return null; }
        comp.text = '';
        applyTextColor(comp, this.textColor);
        obj.getTransform().setLocalScale(new vec3(
            this.templateScale.x * scale,
            this.templateScale.y * scale,
            this.templateScale.z * scale,
        ));
        obj.enabled = false;
        return obj;   // x is set per-text by setFurniture — see below.
    }

    /** Show or hide the running head and folio, and set what they say. Pass
     *  null for `chapter` to take the furniture off the page entirely — the
     *  cover and the search screen have no folio, the way a cover has no page
     *  number. */
    private setFurniture(chapter: string | null, folio: string): void {
        const on = chapter !== null;

        // Text3D CENTRES its string on the object's position — it does not
        // anchor left. So a corner label has to be positioned from its own
        // measured width, every time the text changes, or it hangs off the
        // page: "Linear Algebra" placed with its CENTRE at the left margin ran
        // 2.6 units past the edge of the type area on all 20 pages of chapter 4.
        if (this.runningHeadObj) {
            this.runningHeadObj.enabled = on;
            const c = this.getTextComp(this.runningHeadObj);
            const text = chapter || '';
            if (c) c.text = text;
            const w = this.lineWidth(text, FURNITURE_SCALE);
            this.runningHeadObj.getTransform().setLocalPosition(
                new vec3(-SAFE_HALF_WIDTH + w / 2, RUNNING_HEAD_Y, 0.01));
        }
        if (this.folioObj) {
            this.folioObj.enabled = on;
            const c = this.getTextComp(this.folioObj);
            if (c) c.text = folio;
            const w = this.lineWidth(folio, FOLIO_SCALE);
            this.folioObj.getTransform().setLocalPosition(
                new vec3(SAFE_HALF_WIDTH - w / 2, RUNNING_HEAD_Y, 0.01));
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

    /** Retitle a PinchButton. The capsule prefab keeps its caption on a child
     *  scene object ("Launch Text") carrying a Component.Text — the button
     *  itself has only the mesh — so walk the children and write the first
     *  text component found. Editor-created, so mutating it is safe; a Text
     *  created from scratch in script does not render at all. */
    private setButtonLabel(btn: PinchButton | null | undefined, text: string): void {
        if (!btn) return;
        try {
            const obj: SceneObject =
                (btn as any).getSceneObject?.() || (btn as any).sceneObject;
            if (!obj) return;
            for (let i = 0; i < obj.getChildrenCount(); i++) {
                const comp = this.getTextComp(obj.getChild(i));
                if (comp) { comp.text = text; return; }
            }
        } catch (e) { /* a button with no caption is not worth failing over */ }
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
                    this.boundButtons++;
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
                    this.boundButtons++;
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
        this.alignPageButtons();
        print(`[MatematexBook] ${this.boundButtons} buttons bound`);

        // Proof button — toggles the full-size proof view
        if (this.proofButton) {
            try {
                const pb = this.proofButton as any;
                if (pb.onButtonPinched && typeof pb.onButtonPinched.add === 'function') {
                    pb.onButtonPinched.add(() => {
                        print('[MatematexBook] proof pinched');
                        this.toggleProof();
                    });
                    this.boundButtons++;
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
                    this.boundButtons++;
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
                    this.boundButtons++;
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
                this.boundButtons++;
            } else {
                print(`[MatematexBook] ${label} button has no onButtonPinched`);
            }
        } catch (e: any) {
            print(`[MatematexBook] Failed to bind ${label} button: ${e.message || e}`);
        }
    }

    /** Complain when the scene disagrees with the code about calibration.
     *
     *  These constants are derived — the derivations live in the @input hints
     *  above — but their VALUES live in a scene asset, and nothing checked that
     *  the two agreed. When a code default was corrected, three stale scene
     *  values kept overriding it and every glyph drew 1.265x oversize while the
     *  source said otherwise. An unset font was worse: the font-selection chain
     *  simply took a different branch and rendered maths in whatever face Lens
     *  Studio felt like, silently.
     *
     *  Warnings, not errors: a caller may legitimately want a different scale.
     *  The point is that a divergence is never invisible again. */
    private checkCalibration(): void {
        if (!this.mainFont) {
            print('[MatematexBook] WARNING: mainFont unassigned — every upright ' +
                  'glyph (digits, parens, sin/log/cos, norm bars) will draw in ' +
                  "Lens Studio's default face while being spaced by KaTeX metrics");
        }
        if (!this.italicFont) {
            print('[MatematexBook] WARNING: italicFont unassigned — variables ' +
                  'will draw in the wrong face');
        }
        if (!this.size2Font) {
            print('[MatematexBook] NOTE: size2Font unassigned — display \\int is ' +
                  'laid out 2.22em tall but drawn from Main at 0.89em, and \\sum ' +
                  'has no glyph in Main at all');
        }

        // The pairing that cannot be checked by inspection: textScaleMultiplier
        // is emToWorld / 1.2654, the measured Text3D over-draw factor. If one
        // moves without the other, spacing and glyph size disagree.
        const expected = this.emToWorld / 1.2654;
        if (Math.abs(this.textScaleMultiplier - expected) > 0.01) {
            print(`[MatematexBook] WARNING: textScaleMultiplier ` +
                  `${this.textScaleMultiplier.toFixed(3)} does not match emToWorld ` +
                  `${this.emToWorld} — expected ${expected.toFixed(3)}. Glyphs will ` +
                  `draw ${(this.textScaleMultiplier / expected).toFixed(3)}x the size ` +
                  `the layout reserved for them.`);
        }
        if (Math.abs(this.italicScaleAdjust - 0.7957) > 0.005) {
            print(`[MatematexBook] WARNING: italicScaleAdjust ` +
                  `${this.italicScaleAdjust.toFixed(4)} is not 0.7957 (= 935/1175, ` +
                  `the ratio of the two fonts' hhea spans). Italics will be ` +
                  `${(this.italicScaleAdjust / 0.7957).toFixed(3)}x the size of uprights.`);
        }
        if (Math.abs(this.layoutWidthMargin - 1.0) > 0.005) {
            print(`[MatematexBook] WARNING: layoutWidthMargin ` +
                  `${this.layoutWidthMargin.toFixed(3)} is not 1.0 — fraction bars ` +
                  `will be ${((this.layoutWidthMargin - 1) * 100).toFixed(0)}% too wide. ` +
                  `1.18 was a compensation for oversize glyphs and is wrong now.`);
        }
    }

    private setupPageTurnAudio(): void {
        if (!this.pageTurnTrack) return;
        try {
            const a = this.getSceneObject()
                .createComponent('Component.AudioComponent') as AudioComponent;
            a.audioTrack = this.pageTurnTrack;
            try { (a as any).volume = this.soundVolume; } catch (e) { /* ignore */ }
            this.turnAudio = a;
            print('[MatematexBook] page-turn sound ready');
        } catch (e: any) {
            print(`[MatematexBook] could not create the page-turn audio: ${e.message || e}`);
        }
    }

    /** One page turn's worth of sound.
     *
     *  The recording is 11.3 seconds of one page being turned over and over, so
     *  a random one-second window is a DIFFERENT turn each time. That matters
     *  more than it sounds: the same 400 ms transient replayed on every page is
     *  what makes a UI sound feel synthetic, and paging through a chapter fires
     *  it twenty times in a row. */
    playPageTurnSound(): void {
        const audio = this.turnAudio;
        if (!audio) return;
        try {
            const windows = Math.max(1, Math.floor(this.soundWindows));
            const start = Math.floor(Math.random() * windows) * this.soundWindowLength;

            audio.play(1);
            // Seek AFTER play(): position belongs to a playing voice, and
            // setting it on a stopped component is silently ignored.
            try {
                (audio as any).position = start;
            } catch (e) {
                if (!this.warnedNoSeek) {
                    this.warnedNoSeek = true;
                    print('[MatematexBook] audio position not settable — every ' +
                          'turn will play the same opening of the clip');
                }
            }

            // Fade rather than cut: the window boundary lands wherever it lands
            // in the recording, and a hard stop mid-transient clicks.
            if (!this.stopSoundEvt) {
                this.stopSoundEvt = this.createEvent('DelayedCallbackEvent');
                this.stopSoundEvt.bind(() => {
                    try { if (this.turnAudio) this.turnAudio.stop(true); } catch (e) { /* ignore */ }
                });
            }
            this.stopSoundEvt.reset(this.soundWindowLength);
        } catch (e: any) {
            print(`[MatematexBook] page-turn sound failed: ${e.message || e}`);
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
        this.playPageTurnSound();
        this.showScreen(Screen.Formula);
    }

    /** True when a page-turn gesture should be honoured.
     *
     *  `Screen` is a non-exported const enum, so a sibling component cannot ask
     *  this question itself — the same reason `goToSplash()` exists. Swipes turn
     *  pages in the book; on the search screen and inside a proof they do
     *  nothing, because there is no next page from either. */
    canTurnPage(): boolean {
        return this.currentScreen === Screen.Formula
            || this.currentScreen === Screen.Cover
            || this.currentScreen === Screen.Splash
            || this.currentScreen === Screen.Contents;
    }

    /** Move to prev/next formula. Wraps Splash → first formula and last formula → Splash.
     *  Only meaningful from Splash or Formula screens. */
    navigate(direction: number): void {
        if (this.currentScreen === Screen.Search) {
            // From search, prev/next does nothing — close search first.
            return;
        }
        const N = MATH_FORMULAS.length;
        // The front matter is part of the sequence, not a place outside it:
        // page 0 is the half title, page 1 the contents, and the body follows.
        // Turning back from formula #1 lands on the contents, the way it would
        // in a book.
        const total = N + 3;
        let currentPaged: number;
        if (this.currentScreen === Screen.Cover) currentPaged = 0;
        else if (this.currentScreen === Screen.Splash) currentPaged = 1;
        else if (this.currentScreen === Screen.Contents) currentPaged = 2;
        else currentPaged = this.formulaIndex + 3;

        const nextPaged = (currentPaged + direction + total) % total;
        this.playPageTurnSound();
        if (nextPaged === 0) {
            this.showScreen(Screen.Cover);
        } else if (nextPaged === 1) {
            this.showScreen(Screen.Splash);
        } else if (nextPaged === 2) {
            this.showScreen(Screen.Contents);
        } else {
            this.formulaIndex = nextPaged - 3;
            this.showScreen(Screen.Formula);
        }
    }

    /** Switch to a screen and render it. Single source of truth for screen
     *  transitions — handles tearing down per-screen UI and toggling button visibility. */
    showScreen(screen: Screen): void {
        this.currentScreen = screen;

        // Show chapter + search buttons only on Splash. Hide them on Formula
        // and Search to avoid visual clutter.
        const onCover = screen === Screen.Cover;
        const onSplash = screen === Screen.Splash;
        const onContents = screen === Screen.Contents;

        // A cover has no buttons on it and no page number. It is the one screen
        // that is an object rather than a page.
        // Guarded, not just null-checked: a sibling @component that has not
        // been awoken yet resolves to an object whose methods do not exist.
        const cov = this.cover as any;
        if (cov && typeof cov.show === 'function') {
            if (onCover) cov.show(); else cov.hide();
        } else if (onCover && this.cover) {
            print('[MatematexBook] cover not awake yet — showing the half title instead');
            this.currentScreen = Screen.Splash;
            screen = Screen.Splash;
        }
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

        // The same button is the way in and the way out, so it has to say
        // which one it is right now. On the proof it is the only control left
        // on screen — prev/next hide there — and "Proof" on the proof page
        // reads as a no-op.
        this.setButtonLabel(this.proofButton, onProof ? 'Back' : 'Proof');

        // Same treatment for About, and for the same reason: one button is both
        // the way in and the way out, so it has to say which one it is right
        // now. "About" while you are ON the About page reads as a no-op, and it
        // is the only control left on that screen — prev/next hide there.
        this.setButtonLabel(this.aboutButton, onAbout ? 'Back' : 'About');

        // Chapter buttons belong to the contents page — they are its rows'
        // controls. Search stays on both front-matter pages.
        this.setChapterButtonsEnabled(onContents);
        this.setSceneObjectEnabled(this.searchButton, onSplash || onContents);

        // About stays reachable ON the about page too — pinching it again is
        // the way back, so it must not hide itself.
        this.setSceneObjectEnabled(this.aboutButton, onSplash || onContents || onAbout);

        // Prev/next belong to the book, not to these full-screen pages —
        // leaving them on floated them over the search chips. `navigate()`
        // already ignores them there, so they were inert as well as in the way.
        // NEXT stays live on the cover, and that is a deliberate retreat from
        // "a cover has no buttons on it".
        //
        // While the swipe existed, the cover was opened by sweeping it. With
        // gestures disabled (see MatematexPageTurn's header) hiding every
        // control here left the lens opening on a screen with NO WAY OUT — the
        // reader is trapped on the cover from launch. A principle that bricks
        // the app is not a principle worth keeping.
        //
        // PREV stays hidden: nothing precedes the cover, and navigate() would
        // wrap it round to page 80, which is a confusing thing for a button on
        // a cover to do.
        this.setSceneObjectEnabled(this.prevButton, !onSearch && !onAbout && !onProof && !onCover);
        this.setSceneObjectEnabled(this.nextButton, !onSearch && !onAbout && !onProof);

        // The paper is the book's pages. The cover is a different object and
        // must not have a sheet of graph paper hanging behind it.
        if (this.pageSheet) this.pageSheet.enabled = !onCover;

        // Show/hide the SearchScreen scene object based on screen.
        if (this.searchScreen) {
            this.searchScreen.enabled = onSearch;
        }

        if (screen === Screen.Cover) {
            this.renderCover();
        } else if (screen === Screen.Splash) {
            this.renderSplash();
        } else if (screen === Screen.Contents) {
            this.renderContents();
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
        this.setFurniture(null, '');

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
            this.placeButton(buttons[i], -BUTTON_ROW_X,
                             MatematexBookOfMath.CHAPTER_BUTTON_Y[i]);
        }
    }

    /** Put the page-level buttons on the sheet.
     *
     *  They were authored at x ±18, y −27, which was inside the old landscape
     *  budget of ±34. On the portrait sheet a capsule is about 9 units wide, so
     *  x 18 put its outer edge at 27 — past the ±26 page edge, floating off the
     *  paper. Positioning in script rather than in the scene keeps this in
     *  version control alongside the constants it depends on, and means the
     *  page geometry has exactly one home. */
    private alignPageButtons(): void {
        this.placeButton(this.searchButton, -BUTTON_ROW_X, BUTTON_ROW_Y);
        this.placeButton(this.aboutButton,   BUTTON_ROW_X, BUTTON_ROW_Y);
        this.placeButton(this.proofButton,   BUTTON_ROW_X, BUTTON_ROW_Y);
        // Prev/next at the FOOT of the sheet, below the other controls. They
        // were above the running head, which put them off the top of the
        // display — and with the swipe gesture disabled they are the only way
        // to turn a page, so being visible is the whole job.
        this.placeButton(this.prevButton, -BUTTON_ROW_X, PREV_NEXT_Y);
        this.placeButton(this.nextButton,  BUTTON_ROW_X, PREV_NEXT_Y);
    }

    private placeButton(btn: PinchButton | null | undefined, x: number, y: number): void {
        if (!btn) return;
        try {
            const obj = (btn as any).getSceneObject?.() || (btn as any).sceneObject;
            if (!obj) return;
            // Z as well as X and Y. Preserving the scene's own z is what left
            // the buttons on a different plane from the page — see
            // BUTTON_PLANE_LIFT.
            obj.getTransform().setLocalPosition(
                new vec3(x, y, this.containerWorldZ + BUTTON_PLANE_LIFT));
        } catch (e) { /* a button we cannot place is not worth failing the page over */ }
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

        // One line per page. This used to be a blank line, a "Rendering" line
        // and an "OK" line — three entries per turn, which buried everything
        // else in the device log once page turns became a gesture.
        print(`[MatematexBook] p${formula.id} ${formula.name}`);

        // Clear previous rendering (formula, splash, proof)
        if (this.renderer) {
            this.renderer.clear();
        }
        this.clearSplash();
        this.clearProof();

        // Make sure labels are visible again
        if (this.labelObj) this.labelObj.enabled = true;
        if (this.chapterLabelObj) this.chapterLabelObj.enabled = true;

        // Update labels. The folio IS the formula id — see the brief: 80
        // formulas, contiguous ids, one per page, so a second pagination model
        // would be a second source of truth for a number we already have.
        this.updateLabels(formula);
        this.setFurniture(formula.chapter, `${formula.id}`);

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
                { size1: this.size1Font || null, size2: this.size2Font || null },
            );

            // Silence is success. Warnings still speak up, and so does the
            // shrink notice above, because those are things worth knowing.
            if (result.warnings.length > 0) {
                print(`[MatematexBook] p${formula.id}: ${result.warnings.length} layout warnings`);
            }

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

        // Same page, same folio. The proof is a figure printed on the formula's
        // page, not a different place in the book.
        this.setFurniture(formula.chapter, `${formula.id}`);

        // Time the build. Every polygon becomes its own SceneObject with its own
        // mesh and material, so a heavy figure is a one-frame spike at the
        // moment the Proof button is pinched — #7 is 388 objects against a
        // catalogue median of 24. If this number is large, mesh batching is the
        // fix, and knowing it beats guessing at it.
        //
        // Date.now(), not getTime(): getTime() is the FRAME clock and does not
        // advance inside a frame, so the first version of this reported #7 as
        // "388 objects in 0ms" — a number that looks like great news and means
        // the stopwatch never started. The validation pass at line 994 was
        // already using Date.now() correctly.
        const t0 = Date.now();
        try {
            this.proofContainer = renderProof(proof, {
                parent: this.container,
                lineMaterial: this.lineMaterial,
                templateTextComp: this.templateTextComp,
                templateScale: this.templateScale,
                worldScale: this.proofWorldScale, // ignored — fitBox wins
                defaultColor: this.textColor,
                // In FRONT of the sheet. This was −10 while there was nothing
                // behind the content, and the portrait page turned that into a
                // figure hidden ten units behind the paper — visible again only
                // because the sheet writes no depth, which is a rendering
                // accident, not the intent. It also cost size: ten units further
                // from the reader draws about 9% smaller than the fitBox asked
                // for. A spatial figure still reaches behind the sheet by its
                // own depth, which is harmless for the same depth-write reason
                // and is what a solid sitting ON a page should look like.
                offset: new vec3(0, -2, this.proofOffsetZ),
                anchor: 'center',
                showTitleCaption: false,
                // Headroom for the name label at +20 and the caption at −20.
                // Near-square rather than the old 30x18 landscape box: the type
                // area is now ±24 wide, and the catalogue's figures are mostly
                // squarish, so height is where the room is.
                fitBox: { halfWidth: SAFE_HALF_WIDTH - 2, halfHeight: SAFE_HALF_HEIGHT - 6 },
            });
            const objs = this.proofContainer ? this.proofContainer.getChildrenCount() : 0;
            print(`[MatematexBook] Proof screen for #${formula.id}: ` +
                  `${objs} objects, built in ${Date.now() - t0}ms`);

            // Build cost is not the whole hitch: meshes are uploaded and
            // materials bound after renderProof returns, and what the wearer
            // feels is the frame, not the function. Fire once on the next
            // update to catch it. The event is created lazily and REUSED —
            // a fresh one-shot per proof view would accumulate a dead event
            // for every proof the reader ever opens.
            this._proofFrameStart = t0;
            this._proofFrameId = formula.id;
            if (!this._proofFrameEvt) {
                this._proofFrameEvt = this.createEvent('DelayedCallbackEvent') as any;
                this._proofFrameEvt.bind(() => {
                    print(`[MatematexBook] Proof screen for #${this._proofFrameId}: ` +
                          `frame took ${Date.now() - this._proofFrameStart}ms end to end`);
                });
            }
            this._proofFrameEvt.reset(0);
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

    /** Clear the book away and let the cover object stand on its own. */
    private renderCover(): void {
        print('[MatematexBook] cover');
        if (this.renderer) this.renderer.clear();
        this.clearSplash();
        this.clearProof();
        if (this.labelObj) this.labelObj.enabled = false;
        if (this.chapterLabelObj) this.chapterLabelObj.enabled = false;
        this.setFurniture(null, '');
    }

    private renderSplash(): void {
        if (!this.container || !this.templateTextComp) return;

        print('[MatematexBook] p i  half title');

        // Clear previous formula rendering, proof, and hide formula labels
        if (this.renderer) this.renderer.clear();
        this.clearSplash();
        this.clearProof();
        if (this.labelObj) this.labelObj.enabled = false;
        if (this.chapterLabelObj) this.chapterLabelObj.enabled = false;
        this.setFurniture('', 'i');

        // Explicit `y` per line rather than an accumulator: it keeps the whole
        // page visible at a glance and makes the FOV check below meaningful.
        // Chapter rows sit at the same y as their pinch buttons (see
        // CHAPTER_BUTTON_Y) so each button reads as belonging to its line.
        // A HALF TITLE, and nothing else. The table of contents used to share
        // this page, which is not how a book opens: you get the title, you turn,
        // and then you get the contents. Splitting them also gave both room —
        // the TOC rows were fighting their own chapter buttons for width.
        // The title is set as three pieces rather than one string, because
        // Text3D colours and positions a WHOLE component: there is no way to
        // raise or tint part of one. So "The Book of", "XR" and "Math" are
        // separate objects, laid out left to right from their measured widths
        // and centred as a group.
        this.renderTitle(10);

        this.renderLines('splash', [
            { text: 'First Edition',                          scale: 0.30, y:   1 },
            { text: `${MATH_FORMULAS.length} theorems · geometry, algebra, calculus, linear algebra`,
                                                              scale: 0.24, y:  -8 },
            { text: 'Built with Matematex library',           scale: 0.22, y: -14 },
        ]);
    }

    /** The table of contents, on its own page. Chapter buttons sit beside their
     *  rows, so the rows are offset right: a button at x −14 is about 9 units
     *  wide and owns everything left of x −5, and a row centred on 0 ran
     *  underneath its own button. The button IS the chapter marker, which is
     *  what let "Chapter N" go from the text. */
    private renderContents(): void {
        if (!this.container || !this.templateTextComp) return;

        print('[MatematexBook] p ii  contents');
        if (this.renderer) this.renderer.clear();
        this.clearSplash();
        this.clearProof();
        if (this.labelObj) this.labelObj.enabled = false;
        if (this.chapterLabelObj) this.chapterLabelObj.enabled = false;
        this.setFurniture('Contents', 'ii');

        this.renderLines('contents', [
            { text: 'Contents',                               scale: 0.42, y:  14 },
            { text: 'Geometry · pages 1–20',                  scale: 0.26, y:  -3, x: 7 },
            { text: 'Algebra · pages 21–40',                  scale: 0.26, y:  -9, x: 7 },
            { text: 'Calculus · pages 41–60',                 scale: 0.26, y: -15, x: 7 },
            { text: 'Linear Algebra · pages 61–80',           scale: 0.26, y: -21, x: 7 },
        ]);
    }

    /** Y positions of the chapter pinch buttons — shared with renderContents so
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

        print('[MatematexBook] about');
        if (this.renderer) this.renderer.clear();
        this.clearSplash();
        this.clearProof();
        if (this.labelObj) this.labelObj.enabled = false;
        if (this.chapterLabelObj) this.chapterLabelObj.enabled = false;
        this.setFurniture(null, '');

        this.renderLines('about', [
            { text: 'About',                                   scale: 0.55, y:  24 },
            { text: `Matematex · Book of Math · ${MATEMATEX_VERSION}`,
                                                               scale: 0.30, y:  17 },
            { text: `${MATH_FORMULAS.length} theorems rendered on-device with KaTeX`,
                                                               scale: 0.24, y:  12 },
            { text: 'Content sources (CC / public domain)',    scale: 0.26, y:   5 },
            { text: 'ProofWiki  ·  DLMF / NIST',               scale: 0.24, y:   0 },
            { text: 'OpenStax  ·  Wikibooks  ·  LibreTexts',   scale: 0.24, y:  -5 },
            { text: 'Wikipedia (CC BY-SA)',                    scale: 0.24, y: -10 },
            // The page-turn sound is licensed, and the licence asks for credit
            // where a person can see it — a comment in the source is not that.
            { text: 'Page-turn sound by 21100267',             scale: 0.24, y: -17 },
            { text: 'freesound.org/s/591291',                  scale: 0.22, y: -21 },
            { text: '© 2026 IoTone, Inc.',                     scale: 0.24, y: -26 },
        ]);
    }

    /** "THE ˣᴿ BOOK OF MATH", with XR raised and tinted.
     *
     *  Every piece is CENTRED on its own object by Text3D, so laying them out
     *  means walking the measured widths and placing each piece's centre — the
     *  same arithmetic the running head needs, for the same reason. */
    private renderTitle(y: number): void {
        // 0.58 measures 34 units wide against the ±24 type area — half-width
        // 17, so it has room. page-fit-audit prices any other size.
        const BIG = 0.58;
        const SUP = BIG * 0.62;

        const parts: { text: string; scale: number; accent: boolean }[] = [
            { text: 'THE ',          scale: BIG, accent: false },
            { text: 'XR',            scale: SUP, accent: true  },
            { text: ' BOOK OF MATH', scale: BIG, accent: false },
        ];

        const widths = parts.map(p => this.lineWidth(p.text, p.scale));
        let total = 0;
        for (const w of widths) total += w;

        // Superscript baseline. Derived from the two sizes rather than nudged
        // by hand, so changing BIG or SUP keeps the XR sitting correctly.
        const raise = this.emToWorld * (0.42 * BIG - 0.20 * SUP);

        let cursor = -total / 2;
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            this.makeSplashLine(p.text, y + (p.accent ? raise : 0), p.scale,
                                cursor + widths[i] / 2,
                                p.accent ? this.titleAccentColor : null);
            cursor += widths[i];
        }

        if (total / 2 > SAFE_HALF_WIDTH) {
            print(`[MatematexBook] WARNING: title is ${total.toFixed(0)} units wide, ` +
                  `outside the ±${SAFE_HALF_WIDTH} type area`);
        }
    }

    /** Emit a page of text lines and assert the page fits the device FOV.
     *
     *  The check is here because the failure mode is silent: a page that runs
     *  off the display looks correct in the Lens Studio preview, which sees
     *  roughly twice the vertical extent Spectacles does. */
    private renderLines(
        page: string,
        lines: { text: string; scale: number; y: number; x?: number }[],
    ): void {
        let top = -Infinity;
        let bottom = Infinity;
        for (const line of lines) {
            if (!line.text) continue;
            const x = line.x || 0;
            this.makeSplashLine(line.text, line.y, line.scale, x);
            if (line.y > top) top = line.y;
            if (line.y < bottom) bottom = line.y;

            // Horizontal guard. A line is centred on its x, so it runs half its
            // width either side. This is a MEASUREMENT, not a character count:
            // the splash template is KaTeX_Main and one em draws emToWorld world
            // units at scale 1, so the same metrics table the formula layout
            // uses answers this exactly.
            const half = this.lineWidth(line.text, line.scale) / 2;
            if (Math.abs(x) + half > SAFE_HALF_WIDTH) {
                print(
                    `[MatematexBook] WARNING: "${page}" line ${JSON.stringify(line.text)} ` +
                    `spans x ${(x - half).toFixed(0)}..${(x + half).toFixed(0)}, ` +
                    `outside the ±${SAFE_HALF_WIDTH} type area — it will overhang the page`,
                );
            }
        }
        if (top > SAFE_HALF_HEIGHT || bottom < -SAFE_HALF_HEIGHT) {
            print(
                `[MatematexBook] WARNING: "${page}" spans y ${bottom.toFixed(0)}..${top.toFixed(0)}, ` +
                `outside the ±${SAFE_HALF_HEIGHT} device FOV budget — it will look fine in ` +
                `preview and be clipped on Spectacles`,
            );
        }
    }

    /** Width in world units of a line of template text at a given scale. */
    private lineWidth(text: string, scaleFactor: number): number {
        return getTextWidthEm(text, false, 'main', false) * this.emToWorld * scaleFactor;
    }

    private makeSplashLine(text: string, y: number, scaleFactor: number,
                           x: number = 0, color: vec4 | null = null): void {
        if (!this.container || !this.templateTextComp) return;

        const obj = global.scene.createSceneObject('SplashLine');
        obj.setParent(this.container);

        const comp: any = (obj as any).copyComponent(this.templateTextComp);
        if (!comp) return;

        comp.text = text;
        applyTextColor(comp, color || this.textColor);

        obj.getTransform().setLocalPosition(new vec3(x, y, 0.01));
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
        // No leading newline: a blank line per launch is still a line.
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
        print(`[MatematexBook] validated ${passed}/${MATH_FORMULAS.length}, ${failed} failed${droppedNote} (${elapsed}ms)`);
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

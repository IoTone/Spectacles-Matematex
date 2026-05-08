// MatematexSearchScreen.ts — Search UI for the Book of Math.
//
// Owns the search screen: a query field (driven by Spectacles' XR keyboard),
// a row of topic chips, and a pool of result-row buttons. Querying is
// delegated to MathSearchIndex (built once by MatematexBookOfMath).
//
// v1 (this file): SIK PinchButton + Text3D — works without Spectacles UI Kit.
// v1.1 (planned): swap PinchButton → UIKit RectangleButton, swap the manual
//                 keyboard-trigger button + Text3D label → UIKit TextInputField.
// v1.1 (planned): wire AsrModule for voice dictation (mic button).
//
// Setup in Lens Studio:
//   1. Create a SceneObject and add this script component.
//   2. Wire `bookOfMath` to the MatematexBookOfMath component.
//   3. Wire `queryButton` (PinchButton) — pinching opens the XR keyboard.
//   4. Wire `queryLabelObj` (SceneObject with Text3D) — shows current query text.
//   5. Wire `resultsLabelObj` (Text3D) — shows "N results".
//   6. Wire 6 topic chip PinchButtons + matching `topicChipLabels` (default
//      labels: matrix, trig, derivative, integral, series, log).
//   7. Wire ~10 result-row PinchButtons + matching `resultRowLabelObjs` (each
//      has a child Text3D for the row label). These form a button pool.
//   8. Wire `closeButton` (PinchButton) — returns to splash.
//   9. Disable the SceneObject by default; MatematexBookOfMath enables it
//      when the search screen is shown.

import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";
import { MathFormula } from './MathBookData';
import { MatematexBookOfMath } from './MatematexBookOfMath';

// Default topic-chip queries. Override per-chip by populating topicChipLabels.
const DEFAULT_CHIP_LABELS = ['matrix', 'trig', 'derivative', 'integral', 'series', 'log'];

@component
export class MatematexSearchScreen extends BaseScriptComponent {

    @input
    @hint("The MatematexBookOfMath component that owns the search index and formula-display state.")
    bookOfMath: MatematexBookOfMath;

    // ─── Query field (v1: manual keyboard-trigger button + display label) ───

    @input
    @hint("PinchButton to open the XR keyboard. v1.1: replaced by UIKit TextInputField.")
    queryButton: PinchButton;

    @input
    @hint("SceneObject with a Text3D component to display the current query string.")
    queryLabelObj: SceneObject;

    @input
    @hint("SceneObject with a Text3D component showing 'N results' or hints. Optional.")
    resultsLabelObj: SceneObject;

    // ─── Topic chips ────────────────────────────────────────────────────────

    @input
    @hint("Topic chip buttons. Pinching seeds the query with the chip's label. Length should match topicChipLabels.")
    topicChips: PinchButton[];

    @input
    @hint("Labels for each topic chip — these are also used as queries when the chip is pinched. Default: matrix/trig/derivative/integral/series/log.")
    topicChipLabels: string[];

    // ─── Result rows (button pool) ──────────────────────────────────────────

    @input
    @hint("Pool of result-row PinchButtons. Each represents one search result; unused rows are hidden. Length determines max visible results.")
    resultRowButtons: PinchButton[];

    @input
    @hint("SceneObjects (with Text3D children) for each result row label. Length must equal resultRowButtons length.")
    resultRowLabelObjs: SceneObject[];

    // ─── Navigation ─────────────────────────────────────────────────────────

    @input
    @hint("PinchButton — close the search screen and return to splash.")
    closeButton: PinchButton;

    // ─── Internal state ─────────────────────────────────────────────────────

    private currentQuery: string = '';
    private currentResults: MathFormula[] = [];
    private keyboardOpen: boolean = false;

    onAwake(): void {
        // Defer button binding until OnStart — same pattern as MatematexBookOfMath.
        const startEvent = this.createEvent('OnStartEvent');
        startEvent.bind(() => this.bindButtonsOnStart());

        // When this SceneObject becomes enabled (search screen shown), refresh
        // the rendered results so it reflects the current query.
        const enableEvent = this.createEvent('OnEnableEvent') as any;
        if (enableEvent && enableEvent.bind) {
            enableEvent.bind(() => this.refresh());
        }
    }

    private bindButtonsOnStart(): void {
        // Query field — open XR keyboard on pinch
        if (this.queryButton) {
            this.bindPinch(this.queryButton, () => this.openKeyboard(), 'queryButton');
        }

        // Topic chips
        if (this.topicChips && this.topicChipLabels) {
            const n = Math.min(this.topicChips.length, this.topicChipLabels.length);
            for (let i = 0; i < n; i++) {
                const chip = this.topicChips[i];
                const label = this.topicChipLabels[i] || DEFAULT_CHIP_LABELS[i] || '';
                if (!chip || !label) continue;
                this.bindPinch(chip, () => this.setQuery(label), `chip[${label}]`);
            }
        }

        // Result rows — capture row index in a closure
        if (this.resultRowButtons) {
            for (let i = 0; i < this.resultRowButtons.length; i++) {
                const row = this.resultRowButtons[i];
                if (!row) continue;
                const idx = i;
                this.bindPinch(row, () => this.onRowPinched(idx), `row[${idx}]`);
            }
        }

        // Close
        if (this.closeButton) {
            this.bindPinch(this.closeButton, () => this.close(), 'closeButton');
        }

        // Initial render — show empty state with the default chips' help text.
        this.refresh();
    }

    private bindPinch(btn: PinchButton, handler: () => void, label: string): void {
        try {
            const pb = btn as any;
            if (pb.onButtonPinched && typeof pb.onButtonPinched.add === 'function') {
                pb.onButtonPinched.add(handler);
            } else {
                print(`[MatematexSearch] ${label} has no onButtonPinched`);
            }
        } catch (e: any) {
            print(`[MatematexSearch] Failed to bind ${label}: ${e.message || e}`);
        }
    }

    // ─── Query handling ─────────────────────────────────────────────────────

    /** Set the query string, re-run search, and re-render result rows. */
    setQuery(q: string): void {
        this.currentQuery = q || '';
        this.refresh();
    }

    private refresh(): void {
        // Update query display
        const qLabel = this.getTextComp(this.queryLabelObj);
        if (qLabel) {
            qLabel.text = this.currentQuery
                ? this.currentQuery
                : 'Tap to search…';
        }

        // Run search
        const idx = this.bookOfMath ? this.bookOfMath.getSearchIndex() : null;
        if (!idx) {
            this.currentResults = [];
        } else {
            const limit = this.resultRowButtons ? this.resultRowButtons.length : 10;
            this.currentResults = idx.search(this.currentQuery, limit);
        }

        // Update results-count label
        const rLabel = this.getTextComp(this.resultsLabelObj);
        if (rLabel) {
            const n = this.currentResults.length;
            rLabel.text = this.currentQuery
                ? `${n} result${n === 1 ? '' : 's'}`
                : 'Pick a topic or tap to search';
        }

        // Populate result rows from the pool; hide unused rows.
        const rows = this.resultRowButtons || [];
        const labels = this.resultRowLabelObjs || [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const labelObj = labels[i];
            if (!row) continue;
            const rowSceneObj = this.getSceneObject(row);
            const formula = this.currentResults[i];
            if (formula) {
                if (rowSceneObj) rowSceneObj.enabled = true;
                const labelComp = this.getTextComp(labelObj);
                if (labelComp) {
                    labelComp.text = `#${formula.id}  ${formula.name}  (${formula.chapter})`;
                }
            } else {
                if (rowSceneObj) rowSceneObj.enabled = false;
            }
        }
    }

    // ─── Row + close handlers ───────────────────────────────────────────────

    private onRowPinched(rowIndex: number): void {
        const formula = this.currentResults[rowIndex];
        if (!formula || !this.bookOfMath) return;
        // Convert formula.id (1-based) to MATH_FORMULAS array index (0-based)
        this.bookOfMath.goToFormula(formula.id - 1);
    }

    private close(): void {
        if (!this.bookOfMath) return;
        // Re-enter splash via the public showScreen API on the parent.
        // (Screen enum is a const enum, so we pass the string literal it
        // erases to. Keep this in sync with MatematexBookOfMath's enum.)
        (this.bookOfMath as any).showScreen('splash');
    }

    // ─── XR keyboard ────────────────────────────────────────────────────────

    private openKeyboard(): void {
        if (this.keyboardOpen) return;
        try {
            // The Spectacles XR keyboard is exposed via TextInputSystem.
            // See docs/about-spectacles-features/apis/key-board.mdx.
            const tis = (global as any).textInputSystem;
            if (!tis || typeof tis.requestKeyboard !== 'function') {
                print('[MatematexSearch] XR keyboard unavailable (no global.textInputSystem.requestKeyboard)');
                return;
            }
            const options: any = {
                initialText: this.currentQuery,
                keyboardType: 0, // default
                returnKeyType: 0, // default ("done")
                enablePreview: true,
                onTextChanged: (text: string, _range: any) => {
                    this.setQuery(text);
                },
                onReturnKeyPressed: () => {
                    this.keyboardOpen = false;
                },
                onKeyboardStateChanged: (isOpen: boolean) => {
                    this.keyboardOpen = isOpen;
                },
                onError: (msg: string) => {
                    print(`[MatematexSearch] keyboard error: ${msg}`);
                    this.keyboardOpen = false;
                },
            };
            tis.requestKeyboard(options);
            this.keyboardOpen = true;
        } catch (e: any) {
            print(`[MatematexSearch] openKeyboard threw: ${e.message || e}`);
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private getTextComp(obj: SceneObject | null | undefined): any {
        if (!obj) return null;
        const candidates = ['Component.Text', 'Component.Text3D', 'Component.Text 3D'];
        for (const t of candidates) {
            try {
                const c = obj.getComponent(t as any);
                if (c) return c;
            } catch (e) { /* ignore */ }
            // Also check first child for the text component (common when label
            // is a child of the row's pinch hit-target SceneObject).
            try {
                const childCount = (obj as any).getChildrenCount?.() || 0;
                for (let i = 0; i < childCount; i++) {
                    const child = (obj as any).getChild(i);
                    if (!child) continue;
                    const c = child.getComponent(t as any);
                    if (c) return c;
                }
            } catch (e) { /* ignore */ }
        }
        return null;
    }

    private getSceneObject(btn: PinchButton): SceneObject | null {
        try {
            const pb = btn as any;
            return pb.getSceneObject?.() || pb.sceneObject || null;
        } catch (e) {
            return null;
        }
    }
}

// SpaceDOMAdapter.ts — Bridges SpaceDOM to the global `document` that KaTeX expects.
//
// KaTeX's renderToString() does NOT need a real DOM (it uses .toMarkup() which is
// pure string manipulation). However, KaTeX's render() and __renderToDomTree().toNode()
// paths call document.createElement, document.createElementNS, document.createTextNode,
// document.createDocumentFragment, and element.style[prop] = value.
//
// This adapter:
//   1. Creates a SpaceDocument and exposes it as `global.document`
//   2. Adds a minimal `.style` property bag to SpaceElement (KaTeX writes inline styles)
//   3. Provides a `compatMode` shim returning "CSS1Compat" so KaTeX doesn't disable render()
//
// Call installSpaceDOMAdapter() ONCE at module load before importing katex_bundle if you
// need the render() path. For renderToString() only, no installation is required.

import {
    SpaceDocument,
    SpaceElement,
    SpaceText,
    SpaceNode,
} from './SpaceDOM';

let installed = false;
let documentInstance: SpaceDocument | null = null;

/**
 * Install the SpaceDOM adapter as the global `document`. Idempotent.
 * Returns the SpaceDocument instance that backs the global.
 */
export function installSpaceDOMAdapter(): SpaceDocument {
    if (installed && documentInstance) {
        return documentInstance;
    }

    documentInstance = new SpaceDocument();

    // Patch SpaceElement to provide a `.style` property bag.
    // KaTeX does: node.style[style] = this.style[style]
    // This means it expects `node.style` to be an object that allows arbitrary
    // string property writes. We attach a plain object lazily on first access.
    const elementProto: any = SpaceElement.prototype;
    if (!Object.prototype.hasOwnProperty.call(elementProto, 'style')) {
        Object.defineProperty(elementProto, 'style', {
            get: function () {
                if (!this._style) {
                    this._style = {};
                }
                return this._style;
            },
            configurable: true,
        });
    }

    // Add `compatMode` to SpaceDocument so KaTeX's quirks-mode check passes.
    const docProto: any = SpaceDocument.prototype;
    if (!Object.prototype.hasOwnProperty.call(docProto, 'compatMode')) {
        Object.defineProperty(docProto, 'compatMode', {
            get: function () {
                return 'CSS1Compat';
            },
            configurable: true,
        });
    }

    // Expose globally as `document` so KaTeX's `typeof document` check sees it.
    // In Lens Studio's runtime, `global` is the global object.
    const g: any = global as any;
    g.document = documentInstance;

    installed = true;
    return documentInstance;
}

/**
 * Returns the installed SpaceDocument, or null if installSpaceDOMAdapter() was not called.
 */
export function getSpaceDocument(): SpaceDocument | null {
    return documentInstance;
}

/**
 * Reset the adapter (mostly for testing).
 */
export function uninstallSpaceDOMAdapter(): void {
    const g: any = global as any;
    if (g.document === documentInstance) {
        g.document = undefined;
    }
    documentInstance = null;
    installed = false;
}

// Re-export SpaceDOM types for convenience
export { SpaceDocument, SpaceElement, SpaceText, SpaceNode };

// ls-stubs.ts — Minimal Lens Studio runtime globals so MatematexBridge.ts can be
// imported under plain node.
//
// MatematexBridge.ts holds two halves in one file: the pure-TS layout walker
// (lines 1–680, zero Lens Studio dependencies) and the scene renderer (lines
// 683+, which extends BaseScriptComponent and uses MeshBuilder). Importing the
// module evaluates BOTH, so the class-definition-time symbols have to exist even
// though the harness only ever calls the walker.
//
// Only what's touched at *class definition* time needs to be real:
//   - the decorators (@component / @input / @hint / @allowUndefined)
//   - the base class named in `extends`
// Method bodies are never invoked here, so MeshBuilder & friends can be inert.
//
// Import this FIRST, before anything that pulls in MatematexBridge.

const g: any = global as any;

// --- Decorators. Lens Studio treats these as ambient; under node they must be
// real functions because TS emits calls to them at class definition time.
if (!g.component) g.component = function (target: any) { return target; };
if (!g.input) g.input = function () { /* property decorator, no-op */ };
if (!g.allowUndefined) g.allowUndefined = function () { /* no-op */ };
if (!g.hint) g.hint = function () { return function () { /* no-op */ }; };
if (!g.label) g.label = function () { return function () { /* no-op */ }; };
if (!g.widget) g.widget = function () { return function () { /* no-op */ }; };
if (!g.ui) g.ui = new Proxy({}, { get: () => () => () => { /* no-op */ } });

// --- Base class referenced by `extends`.
if (!g.BaseScriptComponent) {
    g.BaseScriptComponent = class BaseScriptComponent {
        createEvent(_name: string): any {
            return { bind: () => { /* no-op */ }, reset: () => { /* no-op */ } };
        }
        getSceneObject(): any { return null; }
        getTransform(): any { return null; }
    };
}

// --- Vector types. The walker itself never constructs these (it works in plain
// numbers), but renderer field initializers reference them.
if (!g.vec2) g.vec2 = class vec2 { constructor(public x = 0, public y = 0) {} };
if (!g.vec3) g.vec3 = class vec3 { constructor(public x = 0, public y = 0, public z = 0) {} };
if (!g.vec4) {
    g.vec4 = class vec4 {
        constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}
        get r() { return this.x; }
        get g() { return this.y; }
        get b() { return this.z; }
        get a() { return this.w; }
    };
}

// --- Mesh building. Inert: nothing in the walker path calls these.
if (!g.MeshBuilder) {
    g.MeshBuilder = class MeshBuilder {
        topology: any; indexType: any;
        constructor(_layout?: any) { /* no-op */ }
        appendVerticesInterleaved(_v: number[]): void { /* no-op */ }
        appendIndices(_i: number[]): void { /* no-op */ }
        isValid(): boolean { return false; }
        updateMesh(): void { /* no-op */ }
        getMesh(): any { return null; }
    };
}
if (!g.MeshTopology) g.MeshTopology = { Triangles: 0, TriangleStrip: 1, Lines: 2 };
if (!g.MeshIndexType) g.MeshIndexType = { UInt16: 0, UInt32: 1 };

// --- Logging. The walker prints diagnostics; route them somewhere quiet by
// default so JSON on stdout stays parseable. Set MTX_VERBOSE=1 to see them.
if (!g.print) {
    const verbose = process.env.MTX_VERBOSE === '1';
    g.print = function (...args: any[]) {
        if (verbose) console.error('[lens]', ...args);
    };
}

// --- Scene access. Should never be reached from the walker; throw loudly if a
// future refactor moves scene-touching code into the walker half.
if (!g.scene) {
    g.scene = {
        createSceneObject(): any {
            throw new Error('ls-stubs: global.scene reached from the layout walker — ' +
                'the walker is supposed to be free of Lens Studio dependencies.');
        },
    };
}

export {};

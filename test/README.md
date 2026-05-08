# Tests

Node-runnable tests for pure-TS modules in this project (modules with no Lens Studio dependency).

## Running

The tests are TypeScript with no project-level package.json. Easiest run path:

```bash
npx ts-node test/search-index.test.ts
```

Alternative (compile first, then run):

```bash
npx tsc test/search-index.test.ts --outDir test/dist --module commonjs --target es2019 --esModuleInterop
node test/dist/search-index.test.js
```

## What's tested

- **`search-index.test.ts`** — exercises `MathSearchIndex.buildIndex()` against the 80 formulas in `MathBookData.ts`. Verifies prefix matching ("pythag" → Pythagorean), keyword matching ("right triangle" → Pythagorean), chapter queries ("linear algebra"), topic-chip seeds ("matrix", "trig", "derivative"), and edge cases (empty query, nonsense input).

Exit code is non-zero on any failure.

## Adding tests

If a module has zero Lens Studio runtime dependency (no `@input`, no `BaseScriptComponent`, no `global.scene`, no `Component.*`), it can be tested here. Otherwise it needs in-Lens-Studio testing via `MatematexValidator` or the Book of Math validation pass.

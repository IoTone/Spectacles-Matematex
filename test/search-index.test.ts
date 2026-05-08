// search-index.test.ts — node-runnable smoke test for MathSearchIndex.
//
// Run:
//   npx ts-node test/search-index.test.ts
//   # or
//   npx tsc test/search-index.test.ts --outDir test/dist --module commonjs && node test/dist/search-index.test.js
//
// No Lens Studio runtime needed — MathSearchIndex.ts and MathBookData.ts are
// pure TypeScript with no Lens Studio imports.

import { buildIndex } from '../Matematex/Assets/ProjectScripts/MathSearchIndex';
import { MATH_FORMULAS } from '../Matematex/Assets/ProjectScripts/MathBookData';

interface Case {
    query: string;
    /** Top result's name must equal this exactly. */
    expectName?: string;
    /** Top result's chapter must equal this exactly. */
    expectChapter?: string;
    /** At least this many results must come back. */
    expectAtLeast?: number;
    /** No results expected. */
    expectEmpty?: boolean;
    /** A formula with this name must appear somewhere in the top N. */
    expectAnywhere?: string;
}

const CASES: Case[] = [
    // Direct name matches
    { query: 'pythagorean', expectName: 'Pythagorean Theorem' },
    { query: 'fibonacci', expectName: 'Fibonacci Recurrence' },
    { query: "euler's identity", expectName: "Euler's Identity" },

    // Prefix typing — should match via prefix logic
    { query: 'pythag', expectName: 'Pythagorean Theorem' },
    { query: 'fib', expectName: 'Fibonacci Recurrence' },

    // Keyword matches
    { query: 'right triangle', expectName: 'Pythagorean Theorem' },
    { query: 'cross product', expectName: 'Cross Product Magnitude' },
    { query: 'svd', expectName: 'Singular Value Decomposition' },

    // Multi-word query
    { query: 'matrix multiplication', expectName: 'Matrix Multiplication' },

    // Chapter as query → results from that chapter on top
    { query: 'linear algebra', expectChapter: 'Linear Algebra' },
    { query: 'calculus', expectChapter: 'Calculus' },

    // Topic chip queries (these are the v1 chip labels)
    { query: 'matrix', expectChapter: 'Linear Algebra' },
    { query: 'derivative', expectChapter: 'Calculus' },
    { query: 'trig', expectAnywhere: 'Law of Sines' },
    { query: 'integral', expectAnywhere: 'Fundamental Theorem of Calculus' },
    { query: 'series', expectAnywhere: 'Taylor Series' },
    { query: 'log', expectAnywhere: 'Logarithm Product Rule' },

    // Empty query → return some default set, at least 1
    { query: '', expectAtLeast: 1 },

    // Whitespace-only → treat as empty
    { query: '   ', expectAtLeast: 1 },

    // Nonsense → expect either empty or substring fallback (lenient)
    { query: 'qzqzqzq', expectEmpty: true },
];

const idx = buildIndex(MATH_FORMULAS);

let pass = 0;
let fail = 0;
const failures: string[] = [];

for (const c of CASES) {
    const results = idx.search(c.query, 10);
    const top = results[0];
    let ok = false;
    let detail = '';

    if (c.expectName) {
        ok = !!top && top.name === c.expectName;
        detail = top ? top.name : '(no results)';
    } else if (c.expectChapter) {
        ok = !!top && top.chapter === c.expectChapter;
        detail = top ? `${top.name} (${top.chapter})` : '(no results)';
    } else if (c.expectAnywhere) {
        ok = results.some(r => r.name === c.expectAnywhere);
        detail = results.map(r => r.name).slice(0, 3).join(', ') || '(no results)';
    } else if (c.expectAtLeast !== undefined) {
        ok = results.length >= c.expectAtLeast;
        detail = `${results.length} results`;
    } else if (c.expectEmpty) {
        ok = results.length === 0;
        detail = results.length === 0 ? 'empty' : `unexpectedly got ${results.length}`;
    }

    const expectStr =
        c.expectName ? `name="${c.expectName}"`
        : c.expectChapter ? `chapter="${c.expectChapter}"`
        : c.expectAnywhere ? `anywhere="${c.expectAnywhere}"`
        : c.expectAtLeast !== undefined ? `count >= ${c.expectAtLeast}`
        : c.expectEmpty ? 'empty'
        : '(no expectation)';

    if (ok) {
        console.log(`PASS  "${c.query}"  →  ${detail}`);
        pass++;
    } else {
        const msg = `FAIL  "${c.query}"  expected ${expectStr}, got ${detail}`;
        console.log(msg);
        failures.push(msg);
        fail++;
    }
}

console.log(`\n${pass}/${pass + fail} passed${fail ? ` (${fail} failed)` : ''}`);

if (fail > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
}

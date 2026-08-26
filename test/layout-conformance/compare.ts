// compare.ts — Diff the Matematex walker's layout against KaTeX-in-browser.
//
//   npx ts-node --transpile-only test/layout-conformance/compare.ts
//   npx ts-node --transpile-only test/layout-conformance/compare.ts --json
//
// Both sides traverse the SAME KaTeX DOM, so glyph correspondence is exact —
// there's no engine-difference tolerance to argue about. Every delta is ours.
//
// Positions are compared RELATIVE to the first glyph of each formula. That
// cancels any global origin offset between the two measurement schemes while
// preserving every inter-glyph gap, which is where the defects live.

import * as fs from 'fs';
import * as path from 'path';

const DIR = __dirname;
const FAIL_EM = 0.05;   // ≈ a third of a thin space (0.167em) — clearly a real gap
const WARN_EM = 0.02;   // above font-metric rounding noise

interface OurItem { kind: string; text?: string; x: number; y: number; scale: number; italic?: boolean; w?: number; }
interface RefItem { text: string; x: number; xPen?: number; yBaseline: number; scale: number; width: number; }

// Horizontal comparison uses the PEN POSITION (start of the glyph's advance
// box) on both sides, not the ink-box centre. A glyph's ink is not centred in
// its advance, and KaTeX's Size1–4 fonts (large operators, scaled delimiters)
// have side bearings large enough that centre-to-centre comparison invents
// errors. Falls back to centres for reference dumps predating xPen.
function ourPen(it: OurItem): number {
    return it.x - (it.w || 0) / 2;
}
function refPen(it: RefItem): number {
    return it.xPen != null ? it.xPen : it.x;
}
function usePen(ref: RefItem[]): boolean {
    return ref.length > 0 && ref[0].xPen != null;
}

// The baseline comes from the dump, which computes it with the same metric the
// walker placed the run by.
//
// This used to be `it.y - 0.215 * it.scale`, the constant emitText added. Worth
// being precise about what that did and did not test, because the obvious
// reading is wrong:
//
//   - It DID test the baseline. Subtracting exactly what the walker added
//     recovers the baseline the walker intended, and comparing THAT against the
//     browser is a real check. It passed because the baseline was right.
//   - It did NOT test the CENTRE, which is what actually positions the object.
//     The renderer pins a run's centre at `item.y`, so a run whose true ink
//     centre is 0.334em above the baseline, pinned at 0.215em, is drawn 0.119em
//     low — and the recovered baseline is still perfect. Named operators sagged
//     on device while this harness reported PASS, and it was right to.
//
// So the y axis here verifies layout, not placement. Placement is downstream of
// layout and can only be checked against drawn geometry — see the calibration
// probe, which measures drawn extent against metric extent but only on x.
// Extending it to y is what would close this gap.
function ourBaseline(it: OurItem): number {
    const yb = (it as any).yBaseline;
    if (yb != null) return yb;
    return it.y - 0.215 * it.scale;
}

/** Longest common subsequence over glyph strings; returns aligned index pairs. */
function align(a: string[], b: string[]): Array<[number, number]> {
    const n = a.length, m = b.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const pairs: Array<[number, number]> = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
        else j++;
    }
    return pairs;
}

function pad(s: string, w: number): string {
    return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}
function num(n: number, w = 8): string {
    const s = (n >= 0 ? '+' : '') + n.toFixed(3);
    return ' '.repeat(Math.max(0, w - s.length)) + s;
}
function show(t: string): string {
    return JSON.stringify(t).slice(1, -1);
}

function main(): void {
    const oursPath = path.join(DIR, 'ours.json');
    const refPath = path.join(DIR, 'reference.json');
    for (const p of [oursPath, refPath]) {
        if (!fs.existsSync(p)) {
            console.error(`missing ${path.basename(p)} — see test/layout-conformance/README.md`);
            process.exit(2);
        }
    }
    const ours = JSON.parse(fs.readFileSync(oursPath, 'utf8'));
    const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
    const refById = new Map<number, any>(ref.formulas.map((f: any) => [f.id, f]));

    const jsonMode = process.argv.includes('--json');
    const report: any[] = [];
    let failures = 0;

    for (const of of ours.formulas) {
        const rf = refById.get(of.id);
        const rec: any = { id: of.id, name: of.name };
        if (!rf) { rec.verdict = 'NO_REFERENCE'; report.push(rec); continue; }
        if (of.error || rf.error) {
            rec.verdict = 'ERROR';
            rec.error = of.error || rf.error;
            report.push(rec);
            failures++;
            continue;
        }

        const oursText: OurItem[] = of.items.filter((i: OurItem) => i.kind === 'text');
        const refText: RefItem[] = rf.items;
        const pairs = align(oursText.map(i => i.text || ''), refText.map(i => i.text));

        rec.glyphs = { ours: oursText.length, reference: refText.length, aligned: pairs.length };
        rec.structural = oursText.length !== refText.length || pairs.length !== refText.length;

        if (pairs.length === 0) {
            rec.verdict = 'NO_ALIGNMENT';
            report.push(rec);
            failures++;
            continue;
        }

        // Anchor on the first aligned glyph.
        const pen = usePen(refText);
        const ourAt = (i: number) => (pen ? ourPen(oursText[i]) : oursText[i].x);
        const refAt = (i: number) => (pen ? refPen(refText[i]) : refText[i].x);

        const [ai0, bi0] = pairs[0];
        const ox0 = ourAt(ai0), oy0 = ourBaseline(oursText[ai0]);
        const rx0 = refAt(bi0), ry0 = refText[bi0].yBaseline;

        const rows = pairs.map(([ai, bi]) => {
            const dx = (ourAt(ai) - ox0) - (refAt(bi) - rx0);
            const dy = (ourBaseline(oursText[ai]) - oy0) - (refText[bi].yBaseline - ry0);
            return {
                text: oursText[ai].text || '',
                ourX: ourAt(ai) - ox0,
                refX: refAt(bi) - rx0,
                dx, dy,
                dScale: oursText[ai].scale - refText[bi].scale,
            };
        });

        const maxDx = Math.max(...rows.map(r => Math.abs(r.dx)));
        const maxDy = Math.max(...rows.map(r => Math.abs(r.dy)));
        const meanDx = rows.reduce((s, r) => s + Math.abs(r.dx), 0) / rows.length;
        const maxDScale = Math.max(...rows.map(r => Math.abs(r.dScale)));

        rec.maxDx = +maxDx.toFixed(4);
        rec.meanDx = +meanDx.toFixed(4);
        rec.maxDy = +maxDy.toFixed(4);
        rec.maxDScale = +maxDScale.toFixed(4);
        rec.widthOurs = of.width;
        rec.widthRef = rf.width;
        rec.verdict = (maxDx > FAIL_EM || maxDy > FAIL_EM || rec.structural) ? 'FAIL'
                    : (maxDx > WARN_EM || maxDy > WARN_EM) ? 'WARN' : 'PASS';
        if (rec.verdict === 'FAIL') failures++;
        rec.rows = rows;
        report.push(rec);
    }

    if (jsonMode) {
        process.stdout.write(JSON.stringify({ failures, report }, null, 2) + '\n');
        process.exit(failures > 0 ? 1 : 0);
    }

    // --- Human-readable ---
    console.log('Matematex layout conformance — walker vs KaTeX-in-browser');
    console.log(`reference: KaTeX ${ref.katexVersion}   thresholds: warn ${WARN_EM}em, fail ${FAIL_EM}em`);
    console.log('all positions in em, relative to each formula\'s first glyph\n');

    console.log(pad('id', 5) + pad('formula', 26) + pad('glyphs', 9) +
                pad('maxDx', 9) + pad('meanDx', 9) + pad('maxDy', 9) + 'verdict');
    console.log('-'.repeat(84));
    for (const r of report) {
        const glyphs = r.glyphs ? `${r.glyphs.ours}/${r.glyphs.reference}` : '-';
        console.log(
            pad('#' + r.id, 5) + pad(r.name, 26) + pad(glyphs, 9) +
            pad(r.maxDx != null ? r.maxDx.toFixed(3) : '-', 9) +
            pad(r.meanDx != null ? r.meanDx.toFixed(3) : '-', 9) +
            pad(r.maxDy != null ? r.maxDy.toFixed(3) : '-', 9) +
            r.verdict + (r.structural ? '  (glyph count mismatch)' : ''),
        );
    }

    const bad = report.filter(r => r.verdict === 'FAIL' || r.verdict === 'WARN');
    for (const r of bad) {
        console.log(`\n── #${r.id} ${r.name} — ${r.verdict}`);
        if (r.error) { console.log('   error: ' + r.error); continue; }
        console.log('   ' + pad('glyph', 10) + pad('ourX', 9) + pad('refX', 9) + pad('dx', 9) + pad('dy', 9));
        for (const row of r.rows) {
            const flag = Math.abs(row.dx) > FAIL_EM ? '  <-- dx'
                       : Math.abs(row.dy) > FAIL_EM ? '  <-- dy' : '';
            console.log('   ' + pad(show(row.text), 10) + num(row.ourX) + ' ' +
                        num(row.refX) + ' ' + num(row.dx) + ' ' + num(row.dy) + flag);
        }
    }

    const counts = { PASS: 0, WARN: 0, FAIL: 0, other: 0 } as any;
    for (const r of report) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
    console.log(`\nPASS ${counts.PASS || 0}   WARN ${counts.WARN || 0}   FAIL ${counts.FAIL || 0}   of ${report.length}`);
    process.exit(failures > 0 ? 1 : 0);
}

main();

// formulas.ts — Which formulas the conformance prototype covers.
//
// Phase 6.5 visual QA flagged Geometry rows 3–10 as ⚠️ spacing defects. Those
// are the subjects. Rows 1 and 12 were walked and left unmarked, so they act as
// controls: if the harness reports deltas on THEM, the harness is wrong, not
// the bridge.

import { MATH_FORMULAS, MathFormula } from '../../Matematex/Assets/ProjectScripts/MathBookData';

// Constructs we want conformance coverage for that aren't (yet) in the shipping
// book. Kept separate so measuring a new construct never means editing user-
// facing content. ids start at 900 to avoid colliding with MathBookData.
// Include with `--extras`; `--ids=all` covers the book only.
export const EXTRA_FORMULAS: MathFormula[] = [
    { id: 901, chapter: 'Extras', name: 'pmatrix 2x2',   latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
    { id: 902, chapter: 'Extras', name: 'bmatrix 2x2',   latex: '\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}' },
    { id: 903, chapter: 'Extras', name: 'det of pmatrix', latex: '\\det\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc' },
    { id: 904, chapter: 'Extras', name: 'matrix 3x3',    latex: '\\begin{matrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{matrix}' },
    { id: 905, chapter: 'Extras', name: 'vmatrix 2x2',   latex: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}' },
    { id: 906, chapter: 'Extras', name: 'cases',         latex: 'f(x) = \\begin{cases} x & x > 0 \\\\ -x & x \\leq 0 \\end{cases}' },
    { id: 907, chapter: 'Extras', name: 'aligned',       latex: '\\begin{aligned} a &= b + c \\\\ d &= e - f \\end{aligned}' },
    { id: 908, chapter: 'Extras', name: 'pmatrix x vec',  latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\begin{pmatrix} x \\\\ y \\end{pmatrix}' },
];

const ALL_BY_ID: { [id: number]: MathFormula } = {};
for (const f of MATH_FORMULAS) ALL_BY_ID[f.id] = f;
for (const f of EXTRA_FORMULAS) ALL_BY_ID[f.id] = f;

/** Formula ids flagged ⚠️ in phase6-visual-qa.md (spacing defects). */
export const SUBJECT_IDS = [3, 4, 5, 6, 7, 8, 9, 10];

/** Formula ids the QA pass left unmarked — expected to come back clean. */
export const CONTROL_IDS = [1, 12];

export const PROTOTYPE_IDS = [...CONTROL_IDS, ...SUBJECT_IDS].sort((a, b) => a - b);

export function formulasFor(ids: number[]): MathFormula[] {
    return ids.map(id => {
        const f = ALL_BY_ID[id];
        if (!f) throw new Error(`No formula with id ${id} in MathBookData or EXTRA_FORMULAS`);
        return f;
    });
}

/** Parse a comma-separated id list, or "all", from argv. Defaults to the
 *  prototype set. `--extras` appends the non-book construct coverage. */
export function idsFromArgv(argv: string[]): number[] {
    const extras = argv.indexOf('--extras') >= 0 ? EXTRA_FORMULAS.map(f => f.id) : [];
    const arg = argv.find(a => a.startsWith('--ids='));
    if (!arg) return extras.length ? extras : PROTOTYPE_IDS;
    const val = arg.slice('--ids='.length);
    if (val === 'all') return MATH_FORMULAS.map(f => f.id).concat(extras);
    const ids = val.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    return ids.concat(extras);
}

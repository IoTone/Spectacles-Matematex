// dump-formulas.ts — Emit the formula set the reference page should render, so
// the browser and the node walker are provably working from the same list.
//
//   npx ts-node --transpile-only test/layout-conformance/dump-formulas.ts \
//     > test/layout-conformance/reference/formulas.json

import { formulasFor, idsFromArgv } from './formulas';

const formulas = formulasFor(idsFromArgv(process.argv))
    .map(f => ({ id: f.id, name: f.name, latex: f.latex }));

process.stdout.write(JSON.stringify(formulas, null, 2) + '\n');

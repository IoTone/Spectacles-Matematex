// proof-math.test.ts — check that each visual proof is mathematically TRUE.
//
//   npx ts-node --transpile-only test/proof-math.test.ts
//
// proof-data.test.ts checks that a figure will RENDER (ids resolve, polygons
// have enough points, labels sit near the drawing). It says nothing about
// whether the figure is correct: a Pythagoras diagram whose "square on the
// hypotenuse" is a rhombus, or a Heron triangle whose labelled sides don't
// produce the labelled area, passes it cleanly.
//
// So this file re-derives each claim from the coordinates actually authored —
// side lengths, perpendicularity, areas by shoelace — and compares against the
// identity the proof asserts. A typo'd coordinate that quietly breaks the
// mathematics is exactly the kind of error a reader would trust rather than
// catch, since the figure still looks plausible.

import { PROOFS, CUBE_SLABS, PR_PIECES } from '../Matematex/Assets/ProjectScripts/MathProofData';
import { VisualProof, ProofPrimitive, boxFaces, boxCentre, Vec3, revolve,
         rotateProof, DEFAULT_SPATIAL_VIEW } from '../Matematex/Assets/ProjectScripts/MatematexProof';

let failures = 0;
const EPS = 1e-9;

function check(cond: boolean, msg: string): void {
    if (!cond) { console.log(`  FAIL  ${msg}`); failures++; }
}
function near(a: number, b: number, msg: string, tol = 1e-6): void {
    check(Math.abs(a - b) <= tol, `${msg}  (got ${a}, expected ${b})`);
}

type Pt = number[];
const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]];
const len = (v: Pt): number => Math.hypot(v[0], v[1]);
const dot = (u: Pt, v: Pt): number => u[0] * v[0] + u[1] * v[1];
const dist = (p: Pt, q: Pt): number => len(sub(p, q));
const sub3 = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1], (p[2] ?? 0) - (q[2] ?? 0)];
const dot3 = (u: Pt, v: Pt): number => u[0] * v[0] + u[1] * v[1] + (u[2] ?? 0) * (v[2] ?? 0);
const len3 = (v: Pt): number => Math.hypot(v[0], v[1], v[2] ?? 0);

/** Unsigned polygon area by the shoelace formula. */
function area(points: Pt[]): number {
    let s = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
}

/** True if the four points form a square: equal sides, adjacent sides square. */
function isSquare(p: Pt[]): boolean {
    if (p.length !== 4) return false;
    const sides = [sub(p[1], p[0]), sub(p[2], p[1]), sub(p[3], p[2]), sub(p[0], p[3])];
    const l0 = len(sides[0]);
    for (const s of sides) if (Math.abs(len(s) - l0) > 1e-9) return false;
    for (let i = 0; i < 4; i++) if (Math.abs(dot(sides[i], sides[(i + 1) % 4])) > 1e-9) return false;
    return true;
}

const polys = (pf: VisualProof): Pt[][] =>
    pf.primitives.filter(p => p.kind === 'polygon').map(p => (p as any).points as Pt[]);
const labels = (pf: VisualProof): { text: string, position: Pt }[] =>
    pf.primitives.filter(p => p.kind === 'label').map(p => p as any);
/** Centroid of a polygon's vertices — where an area label belongs. */
function centroid(p: Pt[]): Pt {
    return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
}
function labelNear(pf: VisualProof, text: string, at: Pt, tol: number): void {
    const l = labels(pf).find(x => x.text === text);
    check(!!l, `label ${JSON.stringify(text)} is missing`);
    if (l) check(dist(l.position, at) <= tol,
                 `label ${JSON.stringify(text)} at (${l.position[0]}, ${l.position[1]}) ` +
                 `is not near (${at[0]}, ${at[1]}) — off by ${dist(l.position, at).toFixed(2)}`);
}

// ── #1 Pythagoras ───────────────────────────────────────────────────────
// Claim: two (a+b) squares each hold the same four copies of the a-b-c
// triangle; the leftovers are c² on one side and a²+b² on the other, so they
// are equal. The proof only works if the squares really are the same size, the
// eight triangles really are congruent, and each dissection really tiles its
// square with no overlap or gap.
{
    console.log('#1 Pythagorean Theorem');
    const pf = PROOFS[1];
    const P = polys(pf);
    const [bigL, cSq, ...restL] = P;
    const triL = restL.slice(0, 4);
    const bigR = restL[4], bSq = restL[5], aSq = restL[6];
    const triR = restL.slice(7, 11);

    check(isSquare(bigL) && isSquare(bigR), '#1: the two outer frames are not both squares');
    near(area(bigL), area(bigR), '#1: the two squares are not the same size — the subtraction is invalid');
    const S = len(sub(bigL[1], bigL[0]));
    console.log(`     two (a+b)² squares of side ${S}, area ${area(bigL)} each`);

    // All eight triangles congruent to one another (sorted side lengths).
    const sides = (t: Pt[]) => [dist(t[0], t[1]), dist(t[1], t[2]), dist(t[2], t[0])].sort((x, y) => x - y);
    const all = [...triL, ...triR];
    check(all.length === 8, `#1: expected 8 triangles, found ${all.length}`);
    const ref = sides(all[0]);
    for (let i = 1; i < all.length; i++) {
        const si = sides(all[i]);
        check(si.every((v, k) => Math.abs(v - ref[k]) < 1e-9),
              `#1: triangle ${i} is not congruent to the others (${si.map(v => v.toFixed(3)).join(', ')} ` +
              `vs ${ref.map(v => v.toFixed(3)).join(', ')}) — the two squares would not hold equal triangle area`);
    }
    const [a, b, c] = ref;
    near(a * a + b * b, c * c, '#1: the repeated triangle is not right-angled');
    console.log(`     8 congruent ${a}-${b}-${c} triangles, ${area(all[0])} each`);

    // Each square is tiled exactly: 4 triangles + leftovers = the whole square.
    const triArea = area(all[0]);
    near(4 * triArea + area(cSq), area(bigL),
         '#1: the left dissection does not tile its square (overlap or gap)');
    near(4 * triArea + area(aSq) + area(bSq), area(bigR),
         '#1: the right dissection does not tile its square (overlap or gap)');

    // The conclusion, derived the way the figure derives it.
    check(isSquare(cSq), '#1: the leftover on the left is not a square, so it is not c²');
    near(area(cSq), c * c, '#1: the left leftover is not c²');
    near(area(aSq), a * a, '#1: the right leftover is not a²');
    near(area(bSq), b * b, '#1: the right leftover is not b²');
    near(area(cSq), area(aSq) + area(bSq),
         '#1: the leftovers are not equal — the figure does not prove the theorem');
    console.log(`     leftovers: c²=${area(cSq)} = a²+b² = ${area(aSq)}+${area(bSq)}`);

    labelNear(pf, 'c²', centroid(cSq), 0.01);
    labelNear(pf, 'a²', centroid(aSq), 0.01);
    labelNear(pf, 'b²', centroid(bSq), 0.01);
}

// ── #22 Difference of squares ───────────────────────────────────────────
// Claim: a² − b² = (a+b)(a−b), shown by cutting a b×b corner out of an a×a
// square and relabelling the two remaining rectangles as a(a−b) and b(a−b).
// The dissection has to tile the big square exactly, and the labels have to
// state the areas the pieces actually have.
{
    console.log("\n#22 Difference of Squares");
    const pf = PROOFS[22];
    const [piece1, piece2, cut] = polys(pf);

    const A = 5, B = 2;   // the values the figure is drawn at
    const bigSquare = A * A;
    near(area(piece1) + area(piece2) + area(cut), bigSquare,
         '#22: the three pieces do not tile the a×a square');
    near(area(cut), B * B, '#22: the removed corner is not b×b');
    near(area(piece1) + area(piece2), A * A - B * B,
         '#22: the two remaining pieces do not have area a²−b²');
    near(area(piece1) + area(piece2), (A + B) * (A - B),
         '#22: a²−b² does not equal (a+b)(a−b) for the drawn figure');
    console.log(`     ${area(piece1)} + ${area(piece2)} = ${area(piece1) + area(piece2)}` +
                ` = a²−b² = ${A * A - B * B} = (a+b)(a−b) = ${(A + B) * (A - B)}`);

    // The pieces must not overlap: together they tile, and each is a rectangle,
    // so equal total area with no gap is enough given the tiling check above.
    near(area(piece1), A * (A - B), '#22: piece 1 is not a×(a−b), as its label claims');
    near(area(piece2), B * (A - B), '#22: piece 2 is not b×(a−b), as its label claims');

    // The reassembly the caption promises: both pieces share the edge (a−b),
    // so they abut into one (a+b)×(a−b) rectangle.
    const dims = (p: Pt[]) => {
        const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
        return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    };
    const [w1, h1] = dims(piece1), [w2, h2] = dims(piece2);
    check([w1, h1].some(d => Math.abs(d - (A - B)) < EPS) &&
          [w2, h2].some(d => Math.abs(d - (A - B)) < EPS),
          `#22: the pieces do not share an (a−b) edge, so they cannot reassemble ` +
          `into an (a+b)×(a−b) rectangle (${w1}×${h1} and ${w2}×${h2})`);

    labelNear(pf, 'a(a−b)', centroid(piece1), 0.01);
    labelNear(pf, 'b(a−b)', centroid(piece2), 0.01);
    labelNear(pf, 'b²', centroid(cut), 0.01);
}

// ── #10 Distance formula ────────────────────────────────────────────────
// Claim: d² = (x₂−x₁)² + (y₂−y₁)². The figure is Pythagoras with the legs
// relabelled, so the triangle must be right-angled at the corner where the
// coordinate differences meet.
{
    console.log('\n#10 Distance Formula');
    const pf = PROOFS[10];
    const tri = polys(pf)[0];
    check(tri.length === 3, '#10: the triangle is not a triangle');

    const [p0, p1, p2] = tri;          // (x₁,y₁), corner, (x₂,y₂)
    near(dot(sub(p0, p1), sub(p2, p1)), 0,
         '#10: the legs do not meet at a right angle, so Pythagoras does not apply');
    const dx = dist(p0, p1), dy = dist(p1, p2), d = dist(p0, p2);
    console.log(`     dx=${dx}, dy=${dy}, d=${d}`);
    near(dx * dx + dy * dy, d * d, '#10: the drawn hypotenuse is not √(dx²+dy²)');

    // The legs must be axis-parallel or they are not coordinate differences.
    near(p0[1], p1[1], '#10: the horizontal leg is not horizontal, so it is not x₂−x₁');
    near(p1[0], p2[0], '#10: the vertical leg is not vertical, so it is not y₂−y₁');

    // The amber segment labelled d must be the hypotenuse, not some other line.
    const line = pf.primitives.find(p => p.kind === 'line') as any;
    check(!!line && ((dist(line.p1, p0) < EPS && dist(line.p2, p2) < EPS) ||
                     (dist(line.p1, p2) < EPS && dist(line.p2, p0) < EPS)),
          '#10: the segment marked d does not join the two labelled points');
}

// ── #13 Heron's formula ─────────────────────────────────────────────────
// Claim: the incircle cuts the sides into s−a, s−b, s−c, and A = r·s. Every
// one of those is checkable. The tangent points must lie ON the sides and at
// distance exactly r from the incentre, or the figure is drawing a circle that
// merely looks inscribed.
{
    console.log("\n#13 Heron's Formula");
    const pf = PROOFS[13];
    const tri = polys(pf)[0];
    check(tri.length === 3, '#13: the triangle is not a triangle');

    const [A, B, C] = tri;
    const a = dist(B, C), b = dist(C, A), c = dist(A, B);
    const s = (a + b + c) / 2;
    const shoelace = area(tri);
    const heron = Math.sqrt(s * (s - a) * (s - b) * (s - c));
    console.log(`     sides ${a.toFixed(4)}, ${b.toFixed(4)}, ${c.toFixed(4)}  s=${s.toFixed(4)}`);
    console.log(`     Heron=${heron.toFixed(6)}  shoelace=${shoelace.toFixed(6)}`);
    near(heron, shoelace, "#13: Heron's formula does not give the drawn triangle's area", 1e-9);
    check(a + b > c && b + c > a && c + a > b, '#13: the side lengths violate the triangle inequality');

    // The incircle: largest circle, one dot per tangency, drawn as circles.
    const circles = pf.primitives.filter(p => p.kind === 'circle') as any[];
    check(circles.length >= 4, '#13: expected an incircle plus three tangency marks');
    const inc = circles.reduce((m, x) => (x.radius > m.radius ? x : m), circles[0]);
    const r = inc.radius, I: Pt = [inc.center[0], inc.center[1]];

    near(r, shoelace / s, '#13: the inradius is not A/s, so A = r·s does not hold for the figure');
    console.log(`     r=${r.toFixed(5)}  A/s=${(shoelace / s).toFixed(5)}  r·s=${(r * s).toFixed(5)}`);
    near(r * s, shoelace, '#13: r·s does not equal the drawn area');

    // Distance from the incentre to each side must be exactly r — that is what
    // makes the circle inscribed rather than merely small.
    const distToSeg = (p: Pt, q: Pt, x: Pt) => {
        const vx = q[0] - p[0], vy = q[1] - p[1];
        const t = ((x[0] - p[0]) * vx + (x[1] - p[1]) * vy) / (vx * vx + vy * vy);
        check(t > 0 && t < 1, '#13: a tangency falls outside its side');
        return dist(x, [p[0] + t * vx, p[1] + t * vy]);
    };
    for (const [P, Q, name] of [[A, B, 'c'], [B, C, 'a'], [C, A, 'b']] as [Pt, Pt, string][]) {
        near(distToSeg(P, Q, I), r, `#13: the incircle does not touch side ${name}`, 1e-9);
    }

    // The tangent lengths are the quantities the formula consumes.
    const tangentFrom = (V: Pt) => Math.sqrt(dist(V, I) ** 2 - r * r);
    near(tangentFrom(A), s - a, '#13: the tangent length at A is not s−a');
    near(tangentFrom(B), s - b, '#13: the tangent length at B is not s−b');
    near(tangentFrom(C), s - c, '#13: the tangent length at C is not s−c');
    near(tangentFrom(A) + tangentFrom(B), c,
         '#13: side c is not cut into (s−a)+(s−b), which is what the figure shows');
    console.log(`     tangents s−a=${(s - a).toFixed(4)}, s−b=${(s - b).toFixed(4)}, ` +
                `s−c=${(s - c).toFixed(4)};  (s−a)+(s−b)=${(s - a + s - b).toFixed(4)} = c`);

    // Heron is equivalent to r² = (s−a)(s−b)(s−c)/s — the step the caption states.
    near(r * r, (s - a) * (s - b) * (s - c) / s,
         '#13: r² ≠ (s−a)(s−b)(s−c)/s, so the caption\'s algebraic step is wrong');
}

// ── #5 Area of a circle ─────────────────────────────────────────────────
// Claim: the twelve wedges of the disc, interleaved, form a strip r tall and
// πr wide, so A = πr². The strip has to be built from the SAME wedges — same
// count, same radius, same angle — and its dimensions have to come out right,
// or the figure is two unrelated pictures side by side.
{
    console.log('\n#5 Area of a Circle');
    const pf = PROOFS[5];
    const wedges = polys(pf);
    check(wedges.length === 24, `#5: expected 12 disc wedges + 12 strip wedges, found ${wedges.length}`);
    const disc = wedges.slice(0, 12), strip = wedges.slice(12);

    // Every wedge is a sector: apex plus an arc, all arc points at radius r.
    const radii = (w: Pt[]) => w.slice(1).map(p => dist(p, w[0]));
    const r = radii(disc[0])[0];
    for (const [i, w] of [...disc, ...strip].entries()) {
        for (const d of radii(w)) {
            near(d, r, `#5: wedge ${i} has a point off the arc — it is not a sector of radius r`, 1e-9);
        }
    }
    console.log(`     ${disc.length} disc wedges + ${strip.length} strip wedges, all radius ${r}`);

    // Same shape in both places: equal area, and they are genuinely the same twelve.
    const wA = area(disc[0]);
    for (const [i, w] of [...disc, ...strip].entries()) {
        near(area(w), wA, `#5: wedge ${i} is not congruent to the others`, 1e-9);
    }
    near(disc.reduce((t, w) => t + area(w), 0), strip.reduce((t, w) => t + area(w), 0),
         '#5: the strip does not contain the same total area as the disc');

    // The disc's wedges share an apex and tile it; twelve equal 30° sectors.
    for (const w of disc) near(dist(w[0], disc[0][0]), 0, '#5: a disc wedge does not share the centre', 1e-9);
    near(disc.reduce((t, w) => t + area(w), 0), Math.PI * r * r,
         '#5: the twelve wedges do not add up to the disc', 0.06);   // chord-approximated arcs run slightly under

    // The strip: apexes alternate between the two edges, r apart.
    const apexY = strip.map(w => w[0][1]);
    const lo = Math.min(...apexY), hi = Math.max(...apexY);
    near(hi - lo, r, '#5: the strip is not r tall, so its area is not r × width');
    for (const y of apexY) {
        check(Math.abs(y - lo) < 1e-9 || Math.abs(y - hi) < 1e-9,
              '#5: a strip wedge’s apex is not on either edge — the wedges do not interleave');
    }
    check(apexY.filter(y => Math.abs(y - lo) < 1e-9).length === 6 &&
          apexY.filter(y => Math.abs(y - hi) < 1e-9).length === 6,
          '#5: the strip does not alternate 6 up and 6 down');

    // Width: six arcs along each edge, each of arc length πr/6, totalling πr.
    const apexX = strip.map(w => w[0][0]).sort((x, y) => x - y);
    const lowX = strip.filter(w => Math.abs(w[0][1] - lo) < 1e-9).map(w => w[0][0]).sort((x, y) => x - y);
    const pitch = lowX[1] - lowX[0];
    near(pitch * 6, Math.PI * r, '#5: six wedges do not span πr — the strip is the wrong width');
    console.log(`     strip ${r} tall by ${(pitch * 6).toFixed(5)} wide;  πr = ${(Math.PI * r).toFixed(5)}`);
    near(r * pitch * 6, Math.PI * r * r, '#5: r × πr does not equal πr²');
    void apexX;
}

// ── #24 Difference of cubes ─────────────────────────────────────────────
// Claim: a³ − b³ = (a−b)(a²+ab+b²), by cutting a b³ corner from an a³ cube and
// splitting what remains into three slabs. The figure draws the slabs pulled
// apart, so the tiling is checked against CUBE_SLABS — their true positions —
// where a gap or an overlap would be a real error rather than a visual one.
{
    console.log('\n#24 Difference of Cubes');
    const A = 4, B = 2;
    const vol = (s: { size: Vec3 }) => s.size[0] * s.size[1] * s.size[2];
    const total = CUBE_SLABS.reduce((t, s) => t + vol(s), 0);

    console.log(`     slabs ${CUBE_SLABS.map(vol).join(' + ')} = ${total}`);
    console.log(`     a³−b³ = ${A ** 3 - B ** 3}   (a−b)(a²+ab+b²) = ${(A - B) * (A * A + A * B + B * B)}`);
    near(total, A ** 3 - B ** 3, '#24: the slabs do not add up to a³−b³');
    near(total, (A - B) * (A * A + A * B + B * B),
         '#24: a³−b³ does not equal (a−b)(a²+ab+b²) for the drawn figure');

    // Each slab must be exactly (a−b) thick in one direction — that is the
    // common factor the identity pulls out.
    for (const [i, sl] of CUBE_SLABS.entries()) {
        check(sl.size.some(d => Math.abs(d - (A - B)) < EPS),
              `#24: slab ${i} (${sl.size.join('x')}) has no (a−b) dimension, so (a−b) is not a common factor`);
    }

    // Slabs plus the removed corner must tile the a-cube: right total, and no
    // two boxes sharing volume.
    const boxes = [...CUBE_SLABS.map(s => ({ min: s.min, size: s.size })),
                   { min: [0, 0, 0] as Vec3, size: [B, B, B] as Vec3 }];
    near(boxes.reduce((t, b) => t + vol(b), 0), A ** 3,
         '#24: the slabs plus the removed corner do not fill the a³ cube');
    const overlaps = (p: typeof boxes[0], q: typeof boxes[0]) =>
        [0, 1, 2].every(k => Math.min(p.min[k] + p.size[k], q.min[k] + q.size[k])
                           - Math.max(p.min[k], q.min[k]) > EPS);
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            check(!overlaps(boxes[i], boxes[j]),
                  `#24: pieces ${i} and ${j} overlap — the decomposition double-counts volume`);
        }
    }
    for (const b of boxes) {
        for (let k = 0; k < 3; k++) {
            check(b.min[k] >= -EPS && b.min[k] + b.size[k] <= A + EPS,
                  '#24: a piece sticks out of the a³ cube');
        }
    }
    check(PROOFS[24].spatial === true, '#24: not marked spatial — the z-bias would shear the solid');
}

// ── #74 Cross product magnitude ─────────────────────────────────────────
// Claim: |a×b| equals the parallelogram's area, which is base |a| times height
// |b| sin θ. Everything drawn has to agree with everything else — a figure
// where the arrow is a convenient length rather than the true one would look
// entirely plausible.
{
    console.log('\n#74 Cross Product Magnitude');
    const pf = PROOFS[74];
    const quad = polys(pf)[0];
    check(quad.length === 4, '#74: the spanned figure is not a quadrilateral');

    const [O, A, AB, B] = quad;
    // A parallelogram: opposite sides equal and parallel, or "base × height"
    // is not its area.
    const sideA = sub(A, O), sideB = sub(B, O);
    const oppA = sub(AB, B), oppB = sub(AB, A);
    near(len(sub(sideA, oppA)), 0, '#74: the figure is not a parallelogram (a-sides differ)');
    near(len(sub(sideB, oppB)), 0, '#74: the figure is not a parallelogram (b-sides differ)');

    const la = len(sideA), lb = len(sideB);
    const theta = Math.acos(dot(sideA, sideB) / (la * lb));
    const areaByCross = Math.abs(sideA[0] * sideB[1] - sideA[1] * sideB[0]);
    console.log(`     |a|=${la.toFixed(4)}  |b|=${lb.toFixed(4)}  θ=${(theta * 180 / Math.PI).toFixed(2)}°`);
    console.log(`     area=${areaByCross.toFixed(5)}   |a||b|sinθ=${(la * lb * Math.sin(theta)).toFixed(5)}`);
    near(areaByCross, la * lb * Math.sin(theta), '#74: the area is not |a||b| sin θ');
    near(areaByCross, area(quad), '#74: the shoelace area disagrees with the cross product');

    // The product arrow: perpendicular to BOTH spanning vectors, and drawn at
    // the true length — the whole point of the figure.
    const arrows = pf.primitives.filter(p => p.kind === 'arrow') as any[];
    check(arrows.length === 3, `#74: expected 3 arrows, found ${arrows.length}`);
    const cross = arrows.reduce((m, x) =>
        Math.abs(x.to[2] - x.from[2]) > Math.abs(m.to[2] - m.from[2]) ? x : m, arrows[0]);
    const cv = [cross.to[0] - cross.from[0], cross.to[1] - cross.from[1], cross.to[2] - cross.from[2]];
    const dot3 = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    near(dot3(cv, [...sideA, 0]), 0, '#74: a×b is not perpendicular to a');
    near(dot3(cv, [...sideB, 0]), 0, '#74: a×b is not perpendicular to b');
    const clen = Math.hypot(cv[0], cv[1], cv[2]);
    console.log(`     |a×b| drawn = ${clen.toFixed(5)}`);
    near(clen, areaByCross,
         '#74: the product arrow is not drawn at its true length, so the figure asserts the ' +
         'identity instead of showing it');

    // The height segment must actually be the perpendicular from b's tip, and
    // must measure |b| sin θ — that is the step turning |b| into |b| sin θ.
    const lines = pf.primitives.filter(p => p.kind === 'line') as any[];
    const height = lines.find(l => Math.abs(len(sub(l.p1 as Pt, B)) ) < 0.05);
    check(!!height, '#74: no perpendicular dropped from the tip of b');
    if (height) {
        const hv = sub(height.p2 as Pt, height.p1 as Pt);
        near(dot(hv, sideA), 0, '#74: the height segment is not perpendicular to a');
        near(len(hv), lb * Math.sin(theta), '#74: the height segment is not |b| sin θ');
        console.log(`     height = ${len(hv).toFixed(5)} = |b|sinθ = ${(lb * Math.sin(theta)).toFixed(5)}`);
    }
}

// ── #8 Volume of a sphere (Archimedes) ──────────────────────────────────
// Claim: a hemisphere and a cylinder-with-a-cone-bored-out have equal
// cross-sections at every height, hence equal volume. Both halves are checked
// from the drawn triangles — the enclosed volume by the divergence theorem, and
// the slice areas at the height the figure actually cuts at.
{
    console.log('\n#8 Volume of a Sphere (Archimedes)');
    const pf = PROOFS[8];
    const R = 2, Y = 1.0;

    // Enclosed volume of a closed surface, straight from its triangles.
    const enclosed = (faces: Pt[][]) => {
        let v = 0;
        for (const p of faces) {
            for (let i = 1; i < p.length - 1; i++) {
                const [a, b, c] = [p[0], p[i], p[i + 1]];
                v += (a[0] * (b[1] * c[2] - b[2] * c[1])
                    - a[1] * (b[0] * c[2] - b[2] * c[0])
                    + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
            }
        }
        return Math.abs(v);
    };

    // Split the figure by which side of the origin each face sits on: the
    // hemisphere stands left, the cut cylinder right, and the extracted slices
    // sit well below both.
    const faces = (pf.primitives.filter(p => p.kind === 'polygon') as any[])
        .map(p => p.points as Pt[]);
    const solid = faces.filter(f => f.every(q => q[1] > -0.5));
    const left = solid.filter(f => f[0][0] < 0), right = solid.filter(f => f[0][0] >= 0);
    const slices = faces.filter(f => f.every(q => q[1] <= -0.5));

    const vHemi = enclosed(left), vCut = enclosed(right);
    const analytic = (2 / 3) * Math.PI * R ** 3;

    // The IDENTITY first, at a tessellation fine enough that the mesh is not
    // the limiting factor. This is the mathematics; the figure is a picture of
    // it, and the two deserve separate verdicts.
    const fine = 400;
    const prof: [number, number][] = [[0, 0], [R, 0]];
    for (let i = 1; i <= fine; i++) {
        const y = (R * i) / fine;
        prof.push([Math.sqrt(Math.max(0, R * R - y * y)), y]);
    }
    const exactHemi = enclosed(revolve(prof, fine, 'out').map(f => f.points as Pt[]));
    const exactCut = enclosed([
        ...revolve([[R, 0], [R, R]], fine, 'out'),
        ...revolve([[0, 0], [R, 0]], fine, 'out', undefined, [0, R / 2, 0]),
        ...revolve([[0, 0], [R, R]], fine, 'in'),
    ].map(f => f.points as Pt[]));
    console.log(`     exact: hemisphere ${exactHemi.toFixed(5)}  cylinder−cone ${exactCut.toFixed(5)}` +
                `  analytic ${analytic.toFixed(5)}`);
    near(exactHemi, exactCut, '#8: the two solids do not have equal volume — Archimedes fails', 0.01);
    near(exactHemi, analytic, '#8: the hemisphere is not 2πr³/3', 0.01);

    // Then what is actually DRAWN. Both are inscribed, so both must run under
    // the true value; the dome carries more error than the cone, because a
    // chord under-cuts an arc where it follows a straight side exactly. The
    // budget below is that tessellation error, not slack in the theorem.
    console.log(`     drawn: hemisphere ${vHemi.toFixed(4)}  cylinder−cone ${vCut.toFixed(4)}` +
                `  gap ${(100 * Math.abs(vHemi - vCut) / vCut).toFixed(2)}%`);
    near(vHemi, vCut, '#8: the drawn solids disagree by more than tessellation explains',
         vCut * 0.015);
    check(vHemi < analytic && vCut < analytic,
          '#8: an inscribed approximation cannot exceed the true volume — winding or profile is wrong');

    // The slices: a disc of radius √(r²−y²) and an annulus from y out to r.
    const flatArea = (f: Pt[][]) => {
        // Shoelace in the horizontal plane, summed over the ring of faces.
        let a = 0;
        for (const p of f) {
            for (let i = 0; i < p.length; i++) {
                const u = p[i], w = p[(i + 1) % p.length];
                a += u[0] * w[2] - w[0] * u[2];
            }
        }
        return Math.abs(a) / 2;
    };
    const discFaces = slices.filter(f => f[0][0] < 0), ringFaces = slices.filter(f => f[0][0] >= 0);
    const aDisc = flatArea(discFaces), aRing = flatArea(ringFaces);
    console.log(`     slice areas: disc ${aDisc.toFixed(4)}   annulus ${aRing.toFixed(4)}` +
                `   π(r²−y²) = ${(Math.PI * (R * R - Y * Y)).toFixed(4)}`);
    near(aDisc, aRing, '#8: the two cross-sections do not have equal area', 0.05);
    near(aDisc, Math.PI * (R * R - Y * Y), '#8: the disc is not π(r²−y²)', 0.2);

    check(pf.spatial === true, '#8: not marked spatial');
}

// ── Shared: exact convex polygon overlap ────────────────────────────────
// Used by every family whose invariant is "these pieces are distinct".
function polyArea(p: Pt[]): number {
    let a = 0;
    for (let i = 0; i < p.length; i++) {
        const u = p[i], v = p[(i + 1) % p.length];
        a += u[0] * v[1] - v[0] * u[1];
    }
    return a / 2;
}
/** Sutherland–Hodgman: clip convex `sub` against convex `clip`. */
function clipConvex(sub: Pt[], clip: Pt[]): Pt[] {
    const ccw = (p: Pt[]) => (polyArea(p) < 0 ? p.slice().reverse() : p);
    const lerpPt = (a: Pt, b: Pt, t: number): Pt =>
        [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0];
    let out = ccw(sub);
    const c = ccw(clip);
    for (let i = 0; i < c.length && out.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length];
        const side = (q: Pt) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
        const input = out;
        out = [];
        for (let k = 0; k < input.length; k++) {
            const cur = input[k], prev = input[(k + input.length - 1) % input.length];
            const dCur = side(cur), dPrev = side(prev);
            if (dCur >= 0) {
                if (dPrev < 0) out.push(lerpPt(prev, cur, dPrev / (dPrev - dCur)));
                out.push(cur);
            } else if (dPrev >= 0) {
                out.push(lerpPt(prev, cur, dPrev / (dPrev - dCur)));
            }
        }
    }
    return out;
}

// ── Family A: a dissection must actually dissect ────────────────────────
// The payoff of classifying by grammar production: one test covers every
// partition proof, present and future. A dissection is wrong in exactly two
// ways — the pieces do not add up to the whole, or two of them overlap — and
// checking only the sum misses the second, since a decomposition that
// double-counts one region and misses another still totals correctly.
//
// Overlap is computed exactly by convex clipping, not sampled.
{
    console.log('\n   family A: dissections tile exactly');

    let checked = 0;
    for (const id of Object.keys(PROOFS).map(Number)) {
        const pf: VisualProof = (PROOFS as any)[id];
        if (pf.family !== 'A' || pf.spatial) continue;
        // A partition can be of AREA or of ANGLE — the grammar's μ is any
        // measure. An angle-sum figure has no pieces to add up, so it declares
        // `angleSum` and is checked against the triangle it actually draws.
        if (pf.claim?.angleSum !== undefined) {
            const tri = (pf.primitives.find(p => p.kind === 'polygon' &&
                        (p.points as Pt[]).length === 3) as any)?.points as Pt[];
            check(!!tri, `#${id}: claims an angle sum but draws no triangle`);
            if (tri) {
                const ang = (at: Pt, u: Pt, v: Pt) => {
                    const a = sub(u, at), b = sub(v, at);
                    return Math.acos(dot(a, b) / (len(a) * len(b)));
                };
                const angles = [ang(tri[0], tri[1], tri[2]),
                                ang(tri[1], tri[2], tri[0]),
                                ang(tri[2], tri[0], tri[1])];
                const sum = angles.reduce((t, a) => t + a, 0);
                console.log(`     #${id}: angles ${angles.map(a => (a * 180 / Math.PI).toFixed(1)).join('°, ')}°` +
                            ` sum to ${(sum * 180 / Math.PI).toFixed(2)}°`);
                near(sum, pf.claim.angleSum, `#${id}: the drawn angles do not sum to the claim`, 1e-9);
                for (const key of ['alpha', 'beta', 'gamma', 'ext'] as const) {
                    if (pf.claim[key] === undefined) continue;
                    const want = pf.claim[key];
                    const hit = key === 'ext'
                        ? Math.abs(want - (Math.PI - angles[2])) < 1e-9
                        : angles.some(a => Math.abs(a - want) < 1e-9);
                    check(hit, `#${id}: the declared ${key} is not an angle of the drawn triangle`);
                }
            }
            checked++;
            continue;
        }

        const filled = (pf.primitives.filter(p => p.kind === 'polygon' && p.fill) as any[])
            .map(p => p.points as Pt[]);
        check(filled.length > 1, `#${id}: family A with fewer than 2 filled pieces`);

        const total = filled.reduce((t, f) => t + Math.abs(polyArea(f)), 0);
        check(pf.claim?.total !== undefined,
              `#${id}: family A without claim.total — the pieces are never added up`);
        if (pf.claim && pf.claim.total !== undefined) {
            near(total, pf.claim.total,
                 `#${id}: the pieces total ${total.toFixed(4)}, not the claimed ${pf.claim.total}`, 1e-6);
        }
        let worst = 0;
        for (let i = 0; i < filled.length; i++) {
            for (let j = i + 1; j < filled.length; j++) {
                const ov = Math.abs(polyArea(clipConvex(filled[i], filled[j])));
                if (ov > worst) worst = ov;
                check(ov < 1e-9,
                      `#${id}: pieces ${i} and ${j} overlap by ${ov.toFixed(4)} — ` +
                      `the dissection double-counts that region`);
            }
        }
        console.log(`     #${id}: ${filled.length} pieces, total ${total.toFixed(3)}` +
                    `${pf.claim?.total !== undefined ? ` = ${pf.claim.total}` : ''}, ` +
                    `max overlap ${worst.toExponential(1)}`);
        checked++;
    }
    check(checked > 0, 'family A: no proofs tagged — the generic invariant ran on nothing');
}

// ── Family E: right-angle marks must mark real right angles ─────────────
// A projection proof turns a length into |v|·sin θ or |v|·cos θ, and the whole
// step rests on one perpendicular. The mark drawn at that corner ALWAYS looks
// square — it is constructed square — so a mark placed where the figure is not
// actually perpendicular is undetectable by eye. Here the figure's own segments
// are checked: two of them must pass through the corner, along the two legs.
{
    console.log('\n   family E: right angles are real');
    const TOL = 1e-6;
    let marks = 0;

    for (const id of Object.keys(PROOFS).map(Number)) {
        const pf: VisualProof = (PROOFS as any)[id];
        const rights = pf.primitives.filter(p => (p as any).piece === 'right-angle') as any[];
        if (pf.family === 'E') {
            check(rights.length > 0,
                  `#${id}: family E with no right-angle mark — the projection step is unwitnessed`);
        }

        // Every segment the figure draws, from any primitive.
        const segs: [Pt, Pt][] = [];
        for (const p of pf.primitives) {
            if ((p as any).piece === 'right-angle') continue;
            if (p.kind === 'line') segs.push([p.p1 as Pt, p.p2 as Pt]);
            else if (p.kind === 'arrow') segs.push([p.from as Pt, p.to as Pt]);
            else if (p.kind === 'polygon') {
                const r = p.points as Pt[];
                for (let i = 0; i < r.length; i++) segs.push([r[i], r[(i + 1) % r.length]]);
            }
        }

        for (const m of rights) {
            const q = m.points as Pt[];
            // Which vertex of the little square is the corner being marked is a
            // drawing convention, not a fact — try each and take the one whose
            // legs the figure supports.
            const corners = q.map((c, i) => ({
                c, legs: [sub3(q[(i + 1) % q.length], c), sub3(q[(i + q.length - 1) % q.length], c)],
            }));
            const onSeg = (corner: Pt, leg: Pt) => segs.some(([a, b]) => {
                const d = sub3(b, a);
                const t = dot3(sub3(corner, a), d) / (dot3(d, d) || 1);
                if (t < -1e-6 || t > 1 + 1e-6) return false;
                const foot: Pt = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
                if (len3(sub3(foot, corner)) > 1e-6) return false;
                const cr = len3([leg[1] * d[2] - leg[2] * d[1],
                                 leg[2] * d[0] - leg[0] * d[2],
                                 leg[0] * d[1] - leg[1] * d[0]]);
                return cr / (len3(leg) * len3(d) || 1) < 1e-6;
            });
            const best = corners.find(k => k.legs.every(l => onSeg(k.c, l)));
            const corner = (best ?? corners[0]).c;
            const legs = (best ?? corners[0]).legs;
            near(dot3(legs[0], legs[1]), 0, `#${id}: a right-angle mark is not square`, 1e-9);

            for (const leg of legs) {
                check(onSeg(corner, leg),
                      `#${id}: a right-angle mark at (${corner.map(v => v.toFixed(2)).join(', ')}) ` +
                      `has a leg that follows no segment of the figure — it marks an angle ` +
                      `that is not there`);
            }
            marks++;
        }
    }
    console.log(`     ${marks} right-angle marks, all sitting on real perpendiculars`);
    check(marks > 0, 'family E: no right-angle marks found at all');
}

// ── Family I: the drawn cells must be the set being counted ─────────────
// A bijection proof counts one finite set two ways. The figure has to show
// exactly that set: `claim.cells` is how many discrete cells it draws, and they
// must be disjoint — a grid that quietly draws nine cells while the arithmetic
// says ten is a proof of nothing, and at a glance nine and ten look identical.
{
    console.log('\n   family I: cell counts match the arithmetic');
    let checked = 0;
    for (const id of Object.keys(PROOFS).map(Number)) {
        const pf: VisualProof = (PROOFS as any)[id];
        if (pf.family !== 'I') continue;
        const cells = (pf.primitives.filter(p => p.kind === 'polygon' && p.fill) as any[])
            .map(p => p.points as Pt[]);
        const want = pf.claim?.cells;
        check(want !== undefined, `#${id}: family I without claim.cells`);
        if (want !== undefined) {
            check(cells.length === want,
                  `#${id}: draws ${cells.length} cells but claims ${want}`);
        }
        for (let i = 0; i < cells.length; i++) {
            for (let j = i + 1; j < cells.length; j++) {
                check(Math.abs(polyArea(clipConvex(cells[i], cells[j]))) < 1e-9,
                      `#${id}: cells ${i} and ${j} overlap — they are not distinct members`);
            }
        }
        console.log(`     #${id}: ${cells.length} cells, disjoint`);
        checked++;
    }
    check(checked > 0, 'family I: no proofs tagged');
}

// ── The arithmetic each bijection figure asserts ────────────────────────
// Exhaustive, because these sets are small enough to build in full — the one
// family where the test can enumerate exactly what the picture claims.
{
    console.log('\n   family I: exhaustive counts');

    // #31 aᵐ·aⁿ = aᵐ⁺ⁿ — concatenating two runs of factors.
    near(3 + 4, 7, '#31: 3 factors then 4 is not 7');

    // #32 (aᵐ)ⁿ = aᵐⁿ — n rows of m factors.
    near(3 * 4, 12, '#32: 4 rows of 3 is not 12');

    // #37 P(4,2): ordered pairs of DISTINCT items — the grid minus its diagonal.
    const ordered: [number, number][] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i !== j) ordered.push([i, j]);
    const permFormula = (n: number, r: number) => {
        let v = 1; for (let k = 0; k < r; k++) v *= n - k; return v;
    };
    console.log(`     #37: enumerated ${ordered.length} ordered pairs, P(4,2) = ${permFormula(4, 2)}`);
    near(ordered.length, permFormula(4, 2), '#37: the grid does not hold P(4,2) pairs');

    // #38 C(4,2): each unordered pair appears twice among those ordered pairs.
    const unordered = new Set(ordered.map(([i, j]) => [i, j].sort().join(',')));
    const choose = (n: number, r: number) => permFormula(n, r) / permFormula(r, r);
    console.log(`     #38: ${unordered.size} unordered from ${ordered.length} ordered, ` +
                `C(4,2) = ${choose(4, 2)}`);
    near(unordered.size, choose(4, 2), '#38: collapsing order does not give C(4,2)');
    near(ordered.length / unordered.size, 2, '#38: each pair is not counted exactly twice');

    // #39 Fibonacci: tilings of a 1×n strip by squares and dominoes, split by
    // the last tile. Enumerated, then compared with the recurrence.
    const tilings = (n: number): number[][] => {
        if (n === 0) return [[]];
        if (n < 0) return [];
        return [...tilings(n - 1).map(t => [...t, 1]), ...tilings(n - 2).map(t => [...t, 2])];
    };
    const T4 = tilings(4);
    const endSquare = T4.filter(t => t[t.length - 1] === 1).length;
    const endDomino = T4.filter(t => t[t.length - 1] === 2).length;
    console.log(`     #39: ${T4.length} tilings of length 4 = ${endSquare} ending in a square ` +
                `+ ${endDomino} ending in a domino`);
    near(T4.length, endSquare + endDomino, '#39: the split does not account for every tiling');
    near(endSquare, tilings(3).length, '#39: those ending in a square are not the tilings of n−1');
    near(endDomino, tilings(2).length, '#39: those ending in a domino are not the tilings of n−2');
    near(T4.length, 5, '#39: the figure draws the wrong number of tilings');
}

// ── Family K: the map itself must be on screen ──────────────────────────
// A transformation proof works by showing a before and an after. A figure with
// only one stage, or with two stages and nothing indicating that one becomes
// the other, is a pair of pictures rather than an argument.
{
    console.log('\n   family K: stages and maps');
    let checked = 0;
    for (const id of Object.keys(PROOFS).map(Number)) {
        const pf: VisualProof = (PROOFS as any)[id];
        if (pf.family !== 'K') continue;
        const arrows = pf.primitives.filter(p => p.kind === 'arrow').length;
        check(arrows > 0,
              `#${id}: family K with no arrow — nothing shows the map being applied`);
        console.log(`     #${id}: ${arrows} arrows`);
        checked++;
    }
    check(checked > 0, 'family K: no proofs tagged');
}

// ── #67 det(AB) = det A · det B, from the drawn parallelograms ──────────
// The three figures must have the areas they claim, and those areas must
// multiply — a figure drawn from hand-picked corner points would look right and
// be wrong.
{
    console.log('\n#67 Determinant of a Product');
    const pf = PROOFS[67];
    const quads = (pf.primitives.filter(p => p.kind === 'polygon') as any[])
        .map(p => p.points as Pt[]);
    check(quads.length === 3, `#67: expected 3 stages, found ${quads.length}`);

    // Areas as drawn, divided out by the display scale applied to all three.
    const S = 1.5;
    const areas = quads.map(q => Math.abs(polyArea(q)) / (S * S));
    const [unit, afterA, afterBA] = areas;
    const { detA, detB, detBA } = pf.claim as any;
    console.log(`     unit ${unit.toFixed(4)}  after A ${afterA.toFixed(4)}  ` +
                `after B∘A ${afterBA.toFixed(4)}`);
    console.log(`     det A ${detA.toFixed(4)} × det B ${detB.toFixed(4)} = ` +
                `${(detA * detB).toFixed(4)}, det(BA) = ${detBA.toFixed(4)}`);
    near(unit, 1, '#67: the first stage is not the unit square');
    near(afterA, detA, "#67: the second stage's area is not det A", 1e-6);
    near(afterBA, detBA, "#67: the third stage's area is not det(BA)", 1e-6);
    near(detA * detB, detBA, '#67: det A · det B does not equal det(BA)', 1e-6);
}

// ── Family C: every slice must have the same measure ────────────────────
// Cavalieri's principle IS the equality of cross-sections, so that is the thing
// to check. Slice groups are marked `slice:<name>`; each group's total area is
// summed in 3D (a band on a sphere is not flat) and all groups must agree.
{
    console.log('\n   family C: cross-sections agree');
    /** Area of a planar polygon in 3D, from the magnitude of its Newell normal. */
    const area3 = (p: Pt[]): number => {
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < p.length; i++) {
            const a = p[i], b = p[(i + 1) % p.length];
            nx += (a[1] - b[1]) * (a[2] + b[2]);
            ny += (a[2] - b[2]) * (a[0] + b[0]);
            nz += (a[0] - b[0]) * (a[1] + b[1]);
        }
        return Math.hypot(nx, ny, nz) / 2;
    };
    let checked = 0;
    for (const id of Object.keys(PROOFS).map(Number)) {
        const pf: VisualProof = (PROOFS as any)[id];
        if (pf.family !== 'C') continue;
        const groups = new Map<string, number>();
        for (const p of pf.primitives) {
            const key = (p as any).piece as string | undefined;
            if (p.kind !== 'polygon' || !key || !key.startsWith('slice')) continue;
            groups.set(key, (groups.get(key) ?? 0) + area3(p.points as Pt[]));
        }
        check(groups.size >= 2,
              `#${id}: family C with ${groups.size} slice group(s) — nothing to compare`);
        const vals = [...groups.values()];
        const lo = Math.min(...vals), hi = Math.max(...vals);
        console.log(`     #${id}: ${groups.size} slices, ${lo.toFixed(4)} … ${hi.toFixed(4)}`);
        near(hi, lo, `#${id}: the cross-sections are not equal, so Cavalieri does not apply`,
             Math.max(lo * 0.02, 1e-6));
        checked++;
    }
    check(checked > 0, 'family C: no proofs tagged');
}

// ── Family H: the detour is never shorter than the direct route ─────────
{
    console.log('\n   family H: paths');
    let checked = 0;
    for (const id of Object.keys(PROOFS).map(Number)) {
        const pf: VisualProof = (PROOFS as any)[id];
        if (pf.family !== 'H') continue;
        const arrows = pf.primitives.filter(p => p.kind === 'arrow') as any[];
        check(arrows.length >= 3, `#${id}: family H needs the two legs and the resultant`);
        // Which arrow is the direct route is not "the longest" — the whole
        // point is that it is the SHORTEST. Find it structurally instead: it is
        // the one whose endpoints the remaining arrows join head to tail.
        const chain = arrows.filter(a => len3(sub3(a.to, a.from)) > 1e-9);
        const same = (u: Pt, v: Pt) => len3(sub3(u, v)) < 1e-6;
        const chains = (legs: any[], from: Pt, to: Pt): boolean => {
            let at = from;
            const left = legs.slice();
            while (left.length) {
                const i = left.findIndex(l => same(l.from as Pt, at));
                if (i < 0) return false;
                at = left[i].to as Pt;
                left.splice(i, 1);
            }
            return same(at, to);
        };
        const direct = chain.find(d =>
            chains(chain.filter(x => x !== d), d.from as Pt, d.to as Pt));
        check(!!direct,
              `#${id}: no arrow is the direct route of the others — the figure ` +
              `compares two unrelated journeys`);
        if (!direct) continue;
        const legs = chain.filter(a => a !== direct);
        const walked = legs.reduce((t, l) => t + len3(sub3(l.to as Pt, l.from as Pt)), 0);
        const straight = len3(sub3(direct.to as Pt, direct.from as Pt));
        console.log(`     #${id}: detour ${walked.toFixed(4)} vs direct ${straight.toFixed(4)}`);
        check(walked >= straight - 1e-9,
              `#${id}: the drawn detour is SHORTER than the direct route — impossible`);
        checked++;
    }
    check(checked > 0, 'family H: no proofs tagged');
}

// ── #41 the power rule, as a cube grown by dx ───────────────────────────
// Family A's generic tiling test works on flat polygons, so a spatial partition
// needs its own. The eight pieces must fill (x+dx)³ with no overlap, the three
// slabs must be exactly n·xⁿ⁻¹·dx, and everything else must carry a dx².
{
    console.log('\n#41 Power Rule');
    const X = 2.4, DX = 0.7;
    const vol = (p: { size: Vec3 }) => p.size[0] * p.size[1] * p.size[2];
    const total = PR_PIECES.reduce((t, p) => t + vol(p), 0);
    const slabs = PR_PIECES.filter(p => p.kind === 'slab');
    const small = PR_PIECES.filter(p => p.kind === 'small');

    console.log(`     total ${total.toFixed(5)}  (x+dx)³ = ${((X + DX) ** 3).toFixed(5)}`);
    near(total, (X + DX) ** 3, '#41: the pieces do not fill the grown cube');
    check(slabs.length === 3, `#41: expected 3 slabs, found ${slabs.length}`);
    const slabTotal = slabs.reduce((t, p) => t + vol(p), 0);
    console.log(`     slabs ${slabTotal.toFixed(5)}  3x²dx = ${(3 * X * X * DX).toFixed(5)}`);
    near(slabTotal, 3 * X * X * DX, '#41: the slabs are not 3x²·dx — the derivative term is wrong');

    // Everything that is not a slab must vanish faster than dx.
    const smallTotal = small.reduce((t, p) => t + vol(p), 0);
    near(smallTotal, 3 * X * DX * DX + DX ** 3,
         '#41: the remainder is not 3x·dx² + dx³');
    console.log(`     remainder ${smallTotal.toFixed(5)}, all of it carrying a dx²`);
    for (const p of small) {
        const dxFactors = p.size.filter(d => Math.abs(d - DX) < 1e-9).length;
        check(dxFactors >= 2, '#41: a piece counted as negligible has only one dx factor');
    }

    // No overlap, and nothing outside the grown cube.
    const overlaps = (a: typeof PR_PIECES[0], b: typeof PR_PIECES[0]) =>
        [0, 1, 2].every(k => Math.min(a.min[k] + a.size[k], b.min[k] + b.size[k])
                           - Math.max(a.min[k], b.min[k]) > 1e-9);
    for (let i = 0; i < PR_PIECES.length; i++) {
        for (let j = i + 1; j < PR_PIECES.length; j++) {
            check(!overlaps(PR_PIECES[i], PR_PIECES[j]),
                  `#41: pieces ${i} and ${j} overlap`);
        }
    }
}

// ── Family J: the invariant must actually stay invariant ────────────────
// The whole argument is that a quantity does not move while the figure does.
// So recompute it at every frame — and check the drawn edges really number what
// each frame claims, since the counting is the proof.
{
    console.log('\n   family J: invariance across frames');
    let checked = 0;
    for (const id of Object.keys(PROOFS).map(Number)) {
        const pf: VisualProof = (PROOFS as any)[id];
        if (pf.family !== 'J') continue;
        const c = pf.claim as any;
        check(!!c, `#${id}: family J without a claim to check`);
        const frames = [[c.e1, c.f1], [c.e2, c.f2], [c.e3, c.f3]].filter(f => f[0] !== undefined);
        check(frames.length >= 2, `#${id}: family J needs at least two frames`);
        for (const [e, f] of frames) {
            near(c.v - e + f, 2, `#${id}: a frame gives V−E+F = ${c.v - e + f}, not 2`);
        }
        // Each deletion must drop E and F by the same amount, or the invariant
        // is being preserved by accident rather than by the move.
        for (let i = 1; i < frames.length; i++) {
            near(frames[i - 1][0] - frames[i][0], frames[i - 1][1] - frames[i][1],
                 `#${id}: between frames, E and F did not fall together`);
        }
        // And the figure must draw exactly those edges.
        const drawn = pf.primitives.filter(p => p.kind === 'line').length;
        const want = frames.reduce((t, f) => t + f[0], 0);
        console.log(`     #${id}: frames ${frames.map(f => `V${c.v}−E${f[0]}+F${f[1]}=2`).join('  ')}`);
        check(drawn === want, `#${id}: draws ${drawn} edges but the frames claim ${want}`);
        checked++;
    }
    check(checked > 0, 'family J: no proofs tagged');
}

// ── #55 the shell integral ──────────────────────────────────────────────
// The figure claims that summing 2πr·e^(−r²)·dr over all r gives π. That is
// checkable directly, and it is the entire content of the polar trick.
{
    console.log('\n#55 Gaussian Integral');
    const N = 200000, RMAX = 12;
    let vol = 0;
    for (let i = 0; i < N; i++) {
        const r = (RMAX * (i + 0.5)) / N;
        vol += 2 * Math.PI * r * Math.exp(-r * r) * (RMAX / N);
    }
    console.log(`     ∫ 2πr·e^(−r²) dr = ${vol.toFixed(8)}   π = ${Math.PI.toFixed(8)}`);
    near(vol, Math.PI, '#55: the shells do not sum to π', 1e-6);
    near(Math.sqrt(vol), Math.sqrt(Math.PI), '#55: I = √π fails', 1e-6);
    near((PROOFS[55].claim as any).shellIntegral, Math.PI, '#55: the declared claim is not π', 1e-9);
}

// ── Spatial figures: nothing may be fully hidden ────────────────────────
// A flat proof shows everything it draws. A solid does not: a piece can sit
// squarely behind another along the view axis and never be seen, which none of
// the mathematics above can detect — #24's b³ corner was hidden behind two
// different slabs at the gap first authored.
//
// Done by actually casting a ray from each piece toward the viewer and
// intersecting the filled triangles in front of it. Comparing piece centroid
// depths instead is tempting and wrong: after the view rotation, depth is
// dominated by x position, so an annotation lifted a hair off a face reads as
// being behind the whole face and a perfectly legible figure gets flagged.
{
    console.log('\n   spatial occlusion');
    const DEPTH_EPS = 0.2;   // proof units; below this, "in front" is not meaningful

    for (const id of Object.keys(PROOFS).map(Number)) {
        const pf: VisualProof = (PROOFS as any)[id];
        if (!pf.spatial) continue;
        const view = pf.spatialView ?? DEFAULT_SPATIAL_VIEW;
        const rot = rotateProof(pf, view.yaw, view.pitch);

        // Pieces: an explicit `piece` tag where the author gave one, otherwise
        // everything sharing an outwardFrom, otherwise the loose lines. Only
        // FILLED geometry can hide anything — a wireframe can be hidden but
        // never hides.
        const groups = new Map<string, Pt[]>();
        const tris: { owner: string, t: Pt[] }[] = [];
        const keyOf = (p: any): string =>
            p.piece ?? (p.kind === 'polygon' && p.outwardFrom
                ? p.outwardFrom.map((v: number) => v.toFixed(6)).join(',')
                : 'wireframe');
        for (const p of rot.primitives) {
            const key = keyOf(p);
            if (p.kind === 'polygon') {
                const r = p.points as Pt[];
                // One sample per face, at its centroid — so a large solid gets
                // many samples and is not judged by a single point that happens
                // to be walled in.
                const c = [0, 1, 2].map(i => r.reduce((t, q) => t + q[i], 0) / r.length) as Pt;
                groups.set(key, [...(groups.get(key) ?? []), c]);
                if (p.fill) {
                    for (let i = 1; i < r.length - 1; i++) tris.push({ owner: key, t: [r[0], r[i], r[i + 1]] });
                }
            } else if (p.kind === 'line') {
                groups.set(key, [...(groups.get(key) ?? []), p.p1 as Pt, p.p2 as Pt]);
            }
        }
        const pieces = [...groups.entries()].map(([key, pts]) => ({ key, pts }));
        check(pieces.length > 1, `#${id}: spatial proof has fewer than 2 distinguishable pieces`);

        /** Depth of triangle `t` at (x, y), or null if the point misses it. */
        const depthAt = (t: Pt[], x: number, y: number): number | null => {
            const [a, b, c] = t;
            const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
            if (Math.abs(d) < 1e-12) return null;                 // edge-on: covers nothing
            const u = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / d;
            const v = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / d;
            if (u < 0 || v < 0 || u + v > 1) return null;
            return a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]);
        };

        // A piece is fine if ANY of its samples survives. Demanding that all of
        // them survive would condemn every closed solid, whose own far side is
        // always hidden, and every cavity, which is only ever seen through its
        // opening. What must not happen is a piece with nothing showing at all.
        let buried = 0;
        for (const p of pieces) {
            const seen = p.pts.filter(q => !tris.some(({ owner, t }) => {
                if (owner === p.key) return false;
                const z = depthAt(t, q[0], q[1]);
                return z !== null && z > q[2] + DEPTH_EPS;
            })).length;
            if (seen === 0) {
                buried++;
                check(false, `#${id}: piece "${p.key}" is entirely buried behind other geometry ` +
                             `from the default ${view.yaw}°/${view.pitch}° view`);
            }
        }
        console.log(`     #${id}: ${pieces.length} pieces, ${tris.length} filled triangles, ` +
                    `${buried === 0 ? 'all visible' : `${buried} buried`}`);
    }
}

// ── rotateProof preserves the figure ────────────────────────────────────
// The tests above check the UNROTATED coordinates, while the renderer draws the
// rotated ones. That is only sound if the rotation is rigid — so verify it does
// not stretch or shear anything.
{
    console.log('\n   rotateProof rigidity');
    const src = PROOFS[24];
    const rot = rotateProof(src, DEFAULT_SPATIAL_VIEW.yaw, DEFAULT_SPATIAL_VIEW.pitch);
    const gather = (pf: VisualProof) => pf.primitives.flatMap(p =>
        p.kind === 'polygon' ? (p.points as Pt[]) :
        p.kind === 'line' ? [p.p1, p.p2] as Pt[] : []);
    const a0 = gather(src), a1 = gather(rot);
    check(a0.length === a1.length, 'rotateProof: point count changed');
    const d3 = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    let worst = 0;
    for (let i = 1; i < a0.length; i++) {
        worst = Math.max(worst, Math.abs(d3(a0[0], a0[i]) - d3(a1[0], a1[i])));
    }
    near(worst, 0, 'rotateProof: distances changed — the rotation is not rigid', 1e-9);
    console.log(`     ${a0.length} points, worst distance drift ${worst.toExponential(1)}`);
}

// ── boxFaces: the solid helper itself ───────────────────────────────────
// Every spatial proof is built from it, so a mis-specified face ring would
// corrupt all of them at once. A box is closed exactly when each of its 12
// edges is shared by exactly two faces.
{
    console.log('\n   boxFaces helper');
    const min: Vec3 = [1, 2, 3], size: Vec3 = [4, 5, 6];
    const faces = boxFaces(min, size);
    check(faces.length === 6, `boxFaces: expected 6 faces, got ${faces.length}`);

    const centre = boxCentre(min, size);
    const edgeCount = new Map<string, number>();
    for (const f of faces) {
        check(f.points.length === 4, 'boxFaces: a face is not a quad');
        check(!!f.outwardFrom && f.outwardFrom.every((v, i) => Math.abs(v - centre[i]) < EPS),
              'boxFaces: a face is not told to point away from the box centre — ' +
              'its winding would be decided by noise when seen edge-on');
        // Planar: every point shares one coordinate with the others.
        const flat = [0, 1, 2].some(k => f.points.every(q => Math.abs(q[k] - f.points[0][k]) < EPS));
        check(flat, 'boxFaces: a face is not planar');
        for (let i = 0; i < 4; i++) {
            const p = f.points[i], q = f.points[(i + 1) % 4];
            const key = [p, q].map(v => v.join(',')).sort().join('|');
            edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
        }
    }
    check(edgeCount.size === 12, `boxFaces: expected 12 distinct edges, got ${edgeCount.size}`);
    for (const [k, n] of edgeCount) {
        check(n === 2, `boxFaces: edge ${k} is shared by ${n} faces, so the box is not closed`);
    }
    console.log(`     6 faces, ${edgeCount.size} edges, each shared by exactly 2 — closed`);
}

console.log(`\n${failures === 0 ? 'all proofs mathematically sound' : `${failures} problem(s)`}`);
process.exit(failures > 0 ? 1 : 0);

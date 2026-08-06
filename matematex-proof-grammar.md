# A grammar for visual proofs

How to go from a formula to a figure that *argues* for it, mechanically enough
that most of the eighty are template instantiations rather than inventions.

Written after building eight of them by hand (#1, #5, #8, #10, #13, #22, #24,
#74). Everything here is a generalisation of something that was learned the
expensive way, and the failure notes are as important as the recipes.

---

## 1. What a visual proof actually is

A visual proof is a **witnessed equality**. Three parts:

- a **measure** μ — count, length, angle, area, or volume;
- the **two sides** of the identity, E₁ and E₂;
- a **witness**: one construction in which μ of the *same thing* can be read as
  E₁ one way and E₂ another way.

The reader's work is to see that both readings describe the same object. That
is the whole mechanism. Everything below is a catalogue of ways to build such a
witness.

Two consequences worth stating plainly, because both were violated in the first
pass of this catalogue:

**A figure that displays the quantities is not a witness.** Drawing squares of
area a², b², c² on the sides of a right triangle and labelling them states the
Pythagorean theorem; it gives no reason to believe it. The rearrangement — two
(a+b)² squares holding the same four triangles — is a witness, because the
equality is forced by subtracting equals from equals.

**Every family carries its own falsifiable invariant.** That is the payoff of
classifying: the family tells you what the test must check. A dissection proof
is wrong if the pieces do not tile; a Cavalieri proof is wrong if the slices do
not match; a bijection proof is wrong if the correspondence is not one-to-one.
Never write a proof without writing its family's invariant as a test.

---

## 2. The families

Each production below gives: the **form** of the argument, its **parameters**,
the **primitive recipe**, and — most importantly — the **invariant** that must
be checked in `test/proof-math.test.ts`.

### A. Partition — one object, two ways to add it up

> μ(whole) = Σ μ(pieces), counted two ways.

- **Parameters**: a region R, a partition P, and a labelling of each piece by
  its measure.
- **Recipe**: draw R's outline; draw each piece filled and stroked in its own
  colour; label each piece with its measure; the caption states the sum.
- **Invariant**: the pieces tile R *exactly* — Σ area = area(R), and no two
  pieces overlap. Checking only the sum is not enough: a decomposition that
  double-counts one region and misses another still sums correctly.
- **Used by**: #22, #23, #24, #4, #17.

### B. Congruence — same pieces, two arrangements

> Two containers of equal measure hold congruent copies of the same pieces, so
> what is left over in each is equal.

- **Parameters**: a container C, a piece set S, two packings of S into C.
- **Recipe**: draw both containers side by side; give every copy of the repeated
  piece **one colour**, so it reads as the same shape appearing twice; label only
  the leftovers, which are the point.
- **Invariant**: both containers have equal measure; all copies of the repeated
  piece are mutually congruent; each packing tiles its container exactly.
- **Used by**: #1.

### C. Slice match (Cavalieri) — two solids, equal cross-sections

> If two solids have equal cross-sectional area at every height, they have equal
> volume.

- **Parameters**: two profiles, a slicing axis, the height sampled for display.
- **Recipe**: `revolve()` both solids, stand them side by side, and draw the two
  cross-sections **lifted out and set down below** — a slice left in place is
  sealed inside an opaque solid and cannot be seen.
- **Invariant**: sample the cross-section area of both at many heights and
  require equality; separately, require the enclosed volumes to match.
- **Used by**: #8. Applies to #7, #9.

### D. Limit of dissection — exact in the limit, honest at finite N

> Cut into N pieces, rearrange, and the result approaches something measurable.

- **Parameters**: N, the piece generator, the target shape.
- **Recipe**: draw the original and the rearrangement **both**, side by side,
  with an arrow between. Draw the pieces with their true curvature so the
  approximation is visible rather than smoothed away.
- **Invariant**: the rearranged assembly's dimensions equal the target's, and
  total measure is preserved. State the convergence in the caption; do not draw
  a shape that pretends to be exact.
- **Used by**: #5. Applies to #6, #26, #41, #45.

### E. Projection — a dropped perpendicular turns a length into a trig ratio

> Drop a perpendicular; the right triangle it makes converts |v| into |v|·sin θ
> or |v|·cos θ.

- **Parameters**: base direction, the vector projected, the angle.
- **Recipe**: base line, the vector, the perpendicular foot, a right-angle mark,
  an angle arc, and a label for the projected length.
- **Invariant**: the foot lies on the base line; the perpendicular is actually
  perpendicular; its length equals the claimed trig expression.
- **Used by**: #74. Applies to #2, #73, #75, #12.

### F. Similarity — parallel lines force proportional sides

> Corresponding sides of similar triangles are in constant ratio.

- **Parameters**: the two triangles, the parallel pair that creates them.
- **Recipe**: draw both triangles sharing a vertex or inscribed in a circle;
  mark the equal angles; label corresponding sides.
- **Invariant**: the triangles really are similar (angle triples equal) and the
  claimed side ratios are equal to the measured ones.
- **Applies to**: #3, #11, #12, #52.

### G. Tangency — equal tangent lengths from a point

> The two tangent segments from a point to a circle are equal.

- **Parameters**: the polygon, its incircle or excircle.
- **Recipe**: figure, inscribed circle, radii to each tangency, dots at the
  tangency points, labels on the tangent segments.
- **Invariant**: the centre is equidistant (= r) from every side, every tangency
  lies strictly inside its side, and each pair of tangent lengths is equal.
- **Used by**: #13. Applies to #33.

### H. Path — head-to-tail vectors, and the straight way is shortest

> A detour is never shorter than the direct route.

- **Parameters**: the vectors, their sum.
- **Recipe**: vectors drawn head to tail, the resultant drawn from origin to
  end, both routes labelled.
- **Invariant**: the head-to-tail chain ends where the resultant does, and the
  chain's total length is ≥ the resultant's.
- **Applies to**: #34, #75.

### I. Bijection — count one set two ways

> Two counting procedures over the same finite set must agree.

- **Parameters**: the set, the two counting schemes.
- **Recipe**: draw the set as a grid or tree of discrete cells; colour the two
  groupings; label each with its count.
- **Invariant**: enumerate the set in code and check both formulas give its
  size. This family is unusual in that the test can be *exhaustive*.
- **Applies to**: #31, #32, #37, #38, #39, #61, #68, #72, #78.

### J. Invariant — a quantity unchanged under a move

> Repeatedly simplify while a quantity does not change.

- **Parameters**: the object, the move, the invariant.
- **Recipe**: a sequence of frames, before and after each move, with the
  invariant recomputed and shown constant.
- **Invariant**: compute the quantity at every frame and require it constant.
- **Applies to**: #18.

### K. Transformation — what a map does to a unit object

> Apply the map to something simple and watch what happens.

- **Parameters**: the map, the unit object, the stages.
- **Recipe**: draw the stages left to right with arrows; keep a marked point
  visible through all of them so the reader can follow the motion.
- **Invariant**: apply the map numerically to sample points and check each stage
  matches its drawn shape.
- **Applies to**: #15, #28, #40, #48, #63, #65, #67, #69, #70, #79, #80.

---

## 3. Renderer rules earned the hard way

These are not style preferences. Each is a bug that shipped.

**Flat figures**

1. Label anchors are points; the **text has width**. Reserve for it, or centre
   the figure and accept clipping at the edges.
2. Title and caption draw at a **fixed world size** and do not scale with the
   figure, so length alone decides whether they fit: **≤ 40 characters for a
   title, ≤ 69 for a caption**.
3. A label tinted to match the piece it names is invisible against that piece.
   Every label gets a dark drop shadow; on a shaded solid, also lighten it.
3a. **Label text is plain text, not maths.** The template Text3D has a null
   font, so labels render in Lens Studio's built-in default and there is no font
   file to check coverage against. `e^{ix}` renders LITERALLY, braces and all;
   modifier letters (ᵐ ᵀ ˣ), subscript letters (ₑ ₓ ₜ ₙ), letterlike symbols (ℝ)
   and pictograms (▫ ▭) may simply not exist in that font. Write `exp(ix)`,
   `x1`, `B^T`, `R^p`. `proof-data` enforces a safe character set — one report
   of a bad label turned up 22 distinct unproven characters across the
   catalogue, which is the usual ratio between what gets noticed and what is
   there.

**Spatial figures** — set `spatial: true`, which switches off the painter's
z-bias (it would shear a solid) and enables depth-aware fitting.

4. **An axis-aligned box viewed down the view axis is a rectangle.** Spatial
   figures are pre-rotated to a three-quarter view; without it a cube renders
   as a flat square.
5. **An unlit material makes a solid a silhouette.** Face shading is baked from
   the true Newell normal — not from the centre-to-face direction, which
   coincides with the normal only on a box and skews badly on curved surfaces.
   A weak back-light keeps rear faces distinct too.
6. **Transparent fills flatten a solid.** Use `opaque()`; the 0.35-alpha fills
   are for flat art only.
7. **A tilted face eats its own labels.** Spatial labels are floated to a plane
   in front of the whole figure, keeping x and y so they still point at their
   piece. Text cut mid-word looks exactly like font clipping and is not.
8. **Pieces hide each other.** Explode until nothing is entirely buried; the
   occlusion test is the arbiter, not the eye.
9. Every primitive needs a genuinely 3D implementation. Four separate XY-only
   assumptions were found this way — line ribbons, arrow heads and lengths,
   face winding, and flat-cap reference points — each surfacing only when a
   figure first needed it. Assume the next new shape will find another.

**Cost**: every polygon is one SceneObject. #24 is 30, #8 is 362. Batching is
not implemented; it is the fix when a figure gets heavy.

---

## 4. The decision procedure

Given a formula:

1. **What is being measured?** Count → I. Length or angle → E/F/H. Area → A/B/D.
   Volume → C. A transformation's effect → K. Nothing measurable → step 4.
2. **Is the identity a re-grouping of one object, or a comparison of two?**
   One object → A. Two → B or C.
3. **Is it exact at finite size?** No → D, and say so in the caption.
4. **If nothing fits**: the formula is a *definition*, a *notational
   convention*, or a theorem whose content is genuinely symbolic. Record that
   verdict and draw nothing. A decorative figure attached to a definition
   teaches the reader that figures are decoration.
5. **Before recording *none*, say the theorem out loud without the notation.**
   If what comes out is a sentence that could be false, there is something to
   draw and step 4 was reached too early. This step exists because the first
   pass filed 21 formulas under step 4 and eight of them were wrong — see
   *The eight that were wrongly filed as none* below. Nine of the 21 were
   linear algebra, which was the tell: a chapter does not hold a
   disproportionate share of the unprovable statements in mathematics.

Step 4 is not a failure mode. Roughly a sixth of the eighty land there.

---

## 5. Classification of all eighty

`family` is the production above. **none** means no witness exists — the entry
is a definition, a convention, or symbolic in content.

| # | Formula | Family | Witness |
|---|---|---|---|
| 1 | Pythagorean Theorem | B | ✅ built |
| 2 | Law of Cosines | A+E | dissection with the projection term |
| 3 | Law of Sines | F | inscribed in the circumcircle, a/sin A = 2R |
| 4 | Area of Triangle | A | half a parallelogram |
| 5 | Area of Circle | D | ✅ built |
| 6 | Circumference | D | rectify the circle onto a line |
| 7 | Surface Area of Sphere | C | Archimedes' hat-box, against a cylinder |
| 8 | Volume of Sphere | C | ✅ built |
| 9 | Volume of Cylinder | C | stack of discs |
| 10 | Distance Formula | E | ✅ built |
| 11 | Midpoint Formula | F | similar triangles halving each leg |
| 12 | Slope Formula | E | rise over run |
| 13 | Heron's Formula | G | ✅ built |
| 14 | Circle Equation | E | Pythagoras on the radius |
| 15 | Ellipse Equation | K | the unit circle scaled by a and b |
| 16 | Arc Length | D | radian as arc-over-radius |
| 17 | Sector Area | A | the sector as a fraction of the disc |
| 18 | Euler's Polyhedron | J | remove faces from a Schlegel diagram |
| 19 | Angle Sum of Triangle | A | parallel through the apex, alternate angles |
| 20 | Exterior Angle Theorem | A | the same figure, one step further |
| 21 | Quadratic Formula | A | completing the square, geometrically |
| 22 | Difference of Squares | A | ✅ built |
| 23 | Perfect Square Trinomial | A | the (a+b)² square in four pieces |
| 24 | Difference of Cubes | A | ✅ built |
| 25 | Geometric Series Sum | A | the telescoping strip |
| 26 | Infinite Geometric Series | D | nested squares converging |
| 27 | Arithmetic Series | B | two staircases forming a rectangle |
| 28 | Euler's Identity | K | rotation by π on the unit circle |
| 29 | Logarithm Product Rule | A | area under 1/x is translation-invariant |
| 30 | Change of Base | **none** | algebraic restatement |
| 31 | Exponent Product Rule | I | concatenating two runs of factors |
| 32 | Power of a Power | I | an m×n grid of factors |
| 33 | AM-GM Inequality | G | the semicircle: radius ≥ half-chord |
| 34 | Triangle Inequality | H | detour versus direct path |
| 35 | Absolute Value | **none** | definition |
| 36 | Compound Interest | **none** | repeated multiplication |
| 37 | Permutations | I | the choice tree |
| 38 | Combinations | I | orderings collapsed into groups |
| 39 | Fibonacci Recurrence | I | domino tilings split by last tile |
| 40 | De Moivre's Theorem | K | angles add under rotation |
| 41 | Power Rule | D | the shell of an n-cube |
| 42 | Chain Rule | F | three rulers geared together: du = g'dx drives dy = f'du |
| 43 | Product Rule | A | the growing rectangle: u·dv + v·du |
| 44 | Quotient Rule | **none** | follows algebraically from #43 |
| 45 | Fundamental Theorem | D | accumulated area, one strip at a time |
| 46 | Integration by Parts | A | the same rectangle as #43, read as areas |
| 47 | Taylor Series | **none** | symbolic |
| 48 | Euler's Formula | K | the unit circle traced by e^{ix} |
| 49 | Derivative of sin | E | the unit circle's tangent decomposed |
| 50 | Derivative of cos | E | the same figure, other component |
| 51 | Derivative of e^x | **none** | definitional |
| 52 | Derivative of ln | F | reflection of e^x in y = x |
| 53 | L'Hôpital's Rule | D | both heights vanish; their ratio tends to f'/g' |
| 54 | Mean Value Theorem | F | a tangent parallel to the secant |
| 55 | Gaussian Integral | C | the surface of revolution and its shells |
| 56 | Lorentz Factor | E | the light clock, Pythagoras on c·t |
| 57 | Wave Equation | **none** | a differential equation, not an identity |
| 58 | Heat Equation | **none** | as above |
| 59 | Laplacian | **none** | definition |
| 60 | Schrödinger Equation | **none** | a postulate |
| 61 | Matrix Multiplication | I | routes i→k→j, partitioned by the middle node |
| 62 | Identity Matrix | **none** | definition |
| 63 | Matrix Inverse | K | the square returns, from either order |
| 64 | Transpose | **none** | definition |
| 65 | Transpose of Product | K | reversing a composition of maps |
| 66 | Determinant of 2×2 | A | the signed area of the spanned parallelogram |
| 67 | Determinant of Product | K | area scale factors multiply |
| 68 | Cofactor Expansion | I | the 3! permutation terms split by where row 1 lands |
| 69 | Eigenvalue Equation | K | the direction a map does not turn |
| 70 | Characteristic Polynomial | K | the square flattens exactly at the roots |
| 71 | Trace | **none** | definition |
| 72 | Trace of Product | I | nine products, added by rows and by columns |
| 73 | Dot Product | E | projection onto the other vector |
| 74 | Cross Product Magnitude | E | ✅ built |
| 75 | Cauchy-Schwarz | E+H | the projection is never longer than the vector |
| 76 | Vector Norm (L2) | E | Pythagoras in three dimensions |
| 77 | Orthogonality | E | the projection vanishes at a right angle |
| 78 | Rank-Nullity Theorem | I | ✅ built — the domain split into kernel and the rest |
| 79 | Spectral Decomposition | K | one frame does both turns — the eigenframe |
| 80 | Singular Value Decomposition | K | circle → ellipse: rotate, scale, rotate |

**Totals**: **67 built**, **0 to build**, **13 with no witness**.

### Progress

**All 67 built.** Every formula in the book now has either a proof or a
recorded verdict of *no witness*.

| family | count | ids |
|---|---|---|
| A partition | 17 | 4, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 41, 43, 45, 46, 66 |
| B congruence | 1 | 1 |
| C slice match | 3 | 7, 8, 9 |
| D limit | 4 | 5, 6, 53, 55 |
| E projection | 12 | 2, 10, 12, 14, 49, 50, 56, 73, 74, 75, 76, 77 |
| F similarity | 7 | 3, 11, 16, 33, 42, 52, 54 |
| G tangency | 1 | 13 |
| H path | 1 | 34 |
| I bijection | 9 | 31, 32, 37, 38, 39, 61, 68, 72, 78 |
| J invariant | 1 | 18 |
| K transformation | 11 | 15, 28, 40, 48, 63, 65, 67, 69, 70, 79, 80 |

The 13 with no witness: 30, 35, 36, 44, 47, 51, 57, 58, 59, 60, 62, 64, 71.
Definitions (#35 #51 #59 #62 #64 #71), notational restatements (#30 #36 #44
#47), and physical postulates (#57 #58 #60).

### The eight that were wrongly filed as *none*

The first pass through the catalogue put 21 formulas in step 4. Nine of those
were linear algebra, which was itself the signal: a chapter does not contain a
disproportionate share of the unprovable statements in mathematics. Re-reading
them turned up eight with genuine, falsifiable content, and one internal
contradiction — family I already *listed* #61 as a member while the table filed
it as **none**.

What went wrong each time was the same mistake, made in two directions:

- **Reading the notation instead of the claim.** #72 `tr(AB) = tr(BA)` was
  dismissed as a "symbolic index shuffle". It is a statement that two sums over
  the same nine products are equal — the purest family I there is. #68 was
  dismissed as "symbolic recursion"; it is a partition of the 3! Leibniz terms
  by which column row 1 uses. #61 is the definition of the product *as written*,
  but read A and B as edge tables and the identity counts routes.
- **Assuming a shape for the figure and concluding none existed.** #42 was
  refused for want of a "faithful planar witness", which presumed the figure had
  to be a graph. Three parallel rulers do it in one picture. #53 was called
  symbolic; it is two straight lines through one point.

And one plain inconsistency: #80 (SVD) had a figure while #79 (spectral
decomposition) did not, though the spectral theorem is the easier statement and
its figure is the SVD's with one rotation replaced by the other's transpose.
That difference *is* the content, so it is now the caption.

The check that would have caught all eight up front, and is now step 5 of the
decision procedure: **before recording *none*, state the theorem in words
without using the notation.** If a sentence comes out that could be false, there
is something to draw. "The entries of a matrix are its entries transposed" is
not such a sentence, and #64 stays empty. "Summing a grid by rows gives the same
answer as summing it by columns" is, and #72 got a figure.

---

## 6. Working rule

Author by family, not by formula number. Everything in one family shares a
helper, a label convention, and an invariant test, so the tenth proof in a
family costs a fraction of the first. Build the family's helper and its test
once, prove it on the hardest member, then the rest are parameters.


---

## 7. Log: what the generic invariant caught

The first family-A batch was written against the templates and the grammar, then
run through the generic tiling test. Two of the six were not dissections at all:

- **#4** drew the triangle on top of a filled rectangle. That is a picture of
  the claim, not a partition — pieces 0 and 2 overlapped by 4.5 square units.
  Rewritten as the four triangles the apex line produces, in congruent pairs.
- **#66** drew the parallelogram on top of a filled bounding box, overlapping it
  by 6.0. Rewritten as the standard seven-piece trim: the parallelogram plus two
  ab/2 triangles, two cd/2 triangles, and two bc rectangles.

Both are the same mistake — *illustrating* a claim by layering shapes rather
than partitioning a region — and it is the exact mistake the first pass of the
whole catalogue made with Pythagoras. It survives good intentions; it does not
survive the invariant. This is the argument for tagging every proof with its
family before drawing it.

The family-E invariant then caught its own class of error on its first batch.
A right-angle mark is *constructed* square, so it always looks square wherever
it is put; the only way to know it marks a real perpendicular is to check the
figure's own segments run along both its legs. In #76 the floor-diagonal leg had
been written as a guessed 45° direction rather than the actual diagonal, which
no amount of looking would have revealed.

A third, softer failure came from the occlusion invariant: #76's two filled
triangles hid both right-angle marks. The fix was not to move them but to
recognise that the areas were never carrying weight in that proof — the claim is
about two hypotenuses — so the triangles are outlined instead of filled. Worth
noting as a pattern: when a spatial figure has an occlusion problem, ask first
whether the occluding element is doing any work.


---

## 8. What each family's invariant has caught

Every generic invariant has found at least one real error on the batch it was
written for. That is the case for classifying before drawing.

| family | invariant | caught |
|---|---|---|
| A | pieces tile exactly, pairwise disjoint | #4 and #66 were shapes layered on a filled background, not partitions — overlapping by 4.5 and 6.0 square units |
| E | every right-angle mark sits on two real segments | #76 had a leg written as a guessed 45° instead of the actual floor diagonal |
| I | `claim.cells` matches the figure; cells disjoint; the count enumerated exhaustively | clean on the figures, but the exhaustive half is what let #61, #68 and #72 be *classified* at all — each was filed as **none** until the set it counts was written down |
| K | the map must appear as an arrow | — |
| — | nothing entirely buried from the default view | #24's b³ corner, hidden behind two slabs |
| — | no two labels overlap under the narrow font model | #10's corner label and dimension label, effectively on one line |

The A and E findings share a shape: both figures *looked* correct and stated a
true fact. What they lacked was the property that makes the figure an argument
rather than an illustration. No amount of looking finds that; only the invariant
does.


---

## 9. Closing the catalogue

Every family's generic invariant found at least one real error, and three found
errors in the TEST rather than the figure — worth recording, because a test that
reports confident wrong numbers is more dangerous than no test:

- The **occlusion** check first compared piece centroid depths. After the view
  rotation, depth is dominated by x position, so an annotation a hair off a face
  reads as behind the whole face. It passed a broken #24 and failed a correct
  #74. Replaced with a ray cast against filled triangles.
- The same check then condemned #8 outright, because a closed solid always hides
  its own far side and a cavity is only seen through its opening. Now every face
  centroid is sampled and a piece passes if ANY survives.
- The **family H** check picked the direct route as "the longest arrow". It is
  the SHORTEST — that is the theorem. Found structurally instead: the direct
  arrow is the one whose endpoints the others join head to tail.

The figures each family's invariant caught: #4 and #66 (shapes layered on a
filled background rather than partitions), #76 (a right-angle leg written as a
guessed 45°), #24 (a buried piece), #7 and #41 (pieces sealed inside their own
solids), #55 (a shell sealed under its surface).

**A note on the last few.** #18 needed the edge-deletion argument rather than
counting a single polyhedron — showing V−E+F = 2 for one solid verifies nothing.
#55's figure shows the shells; the claim that they sum to π is checked by
quadrature, since no picture can carry a limit. #65 was called the weakest of
the 59 on the grounds that it sits close to the definitional line "that #61 fell
on the wrong side of" — and #61 turned out to be on the right side after all.
The lesson generalises: the line is not where a formula sits in the notation but
whether a false-able sentence can be said about it, which is now step 5.

**Plain text is plain text.** A label is drawn by the template Text3D as
literal characters — there is no markup layer, so `^` and `_` render as `^` and
`_`. This was reported once as `e^(−r²)` in #55 and fixed by banning `^{` and
`^(`, which let `A^T` straight through; it shipped in #65, #79 and #80 and was
reported again. The rule is now the whole class: no caret, no underscore, in any
title, caption or label. Superscript 1, 2 and 3 are in the safe set, so `ar²` is
fine. A transpose is a prime, an inverse is `inv(A)`, and a general exponent is
spelled out or moved to the caption where there is room for words. The general
lesson is the one the font-metric bug taught too: fix at the mechanism, and make
the test the class rather than the reported string.

**The label-overlap gate.** Added with this batch, and it caught #10 — a
pre-existing figure whose corner label and dimension label sat 0.2 units apart
vertically with several units of text each. It is the one defect every other
check passes cleanly: correct maths, correct figure, correct text, unreadable
result. It uses the NARROW font-width estimate (0.55 units per character rather
than the 1.25 worst case used for the title budget), so it fails only on pairs
that collide under any plausible metric. Spatial figures are exempt: their
labels are anchored in 3D and turned before drawing, so an overlap in the
authored XY says nothing about the screen.

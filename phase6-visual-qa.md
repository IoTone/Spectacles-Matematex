# Phase 6.5 — Visual QA Pass

Walk all 60 formulas in the Book of Math on device. For each formula, mark a severity and write a one-line note describing any defect. Leave the row blank (or ✅) if it renders correctly.

## Legend

- ✅ — renders correctly
- ⚠️ — minor defect (spacing, alignment, not blocking readability)
- ❌ — broken (missing glyph, wrong structure, unreadable)
- 🔍 — needs math professional review (correctness or convention question, not a rendering bug)

## Categories (for the Category column)

- **Spacing** — inter-atom gaps too tight/loose (mbin, mrel, mord margins)
- **V-Align** — subscript/superscript height, fraction centering, baseline drift
- **Symbol** — missing or wrong glyph (e.g. ∇, ∂, ℏ, ∮, partials)
- **Delim** — parens/brackets not scaling with content
- **BigOp** — sum, integral, product sizing or limits placement
- **NamedOp** — `\sin`, `\lim`, `\det` upright/width
- **Accent** — hat, bar, vec, dot
- **Sqrt** — radical length/height (we just fixed the overbar, look for remaining issues)
- **Matrix** — arrays / matrices (likely unhandled)
- **Other** — anything else

---

## Chapter 1: Geometry (1–20)

| ID | Formula | Sev | Category | Notes |
|----|---------|-----|----------|-------|
| 1  | Pythagorean Theorem          |   |   |   |
| 2  | Law of Cosines               |   |   |   |
| 3  | Law of Sines                 |   |   |   |
| 4  | Area of Triangle             |   |   |   |
| 5  | Area of Circle               |   |   |   |
| 6  | Circumference                |   |   |   |
| 7  | Surface Area of Sphere       |   |   |   |
| 8  | Volume of Sphere             |   |   |   |
| 9  | Volume of Cylinder           |   |   |   |
| 10 | Distance Formula             |   |   |   |
| 11 | Midpoint Formula             |   |   |   |
| 12 | Slope Formula                |   |   |   |
| 13 | Heron's Formula              |   |   |   |
| 14 | Circle Equation              |   |   |   |
| 15 | Ellipse Equation             |   |   |   |
| 16 | Arc Length                   |   |   |   |
| 17 | Sector Area                  |   |   |   |
| 18 | Euler's Polyhedron Formula   |   |   |   |
| 19 | Angle Sum of Triangle        |   |   |   |
| 20 | Exterior Angle Theorem       |   |   |   |

## Chapter 2: Algebra (21–40)

| ID | Formula | Sev | Category | Notes |
|----|---------|-----|----------|-------|
| 21 | Quadratic Formula            |   |   |   |
| 22 | Difference of Squares        |   |   |   |
| 23 | Perfect Square Trinomial     |   |   |   |
| 24 | Difference of Cubes          |   |   |   |
| 25 | Geometric Series Sum         |   |   |   |
| 26 | Infinite Geometric Series    |   |   |   |
| 27 | Arithmetic Series            |   |   |   |
| 28 | Euler's Identity             |   |   |   |
| 29 | Logarithm Product Rule       |   |   |   |
| 30 | Change of Base               |   |   |   |
| 31 | Exponent Product Rule        |   |   |   |
| 32 | Power of a Power             |   |   |   |
| 33 | AM-GM Inequality             |   |   |   |
| 34 | Triangle Inequality          |   |   |   |
| 35 | Absolute Value               |   |   |   |
| 36 | Compound Interest            |   |   |   |
| 37 | Permutations                 |   |   |   |
| 38 | Combinations                 |   |   |   |
| 39 | Fibonacci Recurrence         |   |   |   |
| 40 | De Moivre's Theorem          |   |   |   |

## Chapter 3: Calculus (41–60)

| ID | Formula | Sev | Category | Notes |
|----|---------|-----|----------|-------|
| 41 | Power Rule                   |   |   |   |
| 42 | Chain Rule                   |   |   |   |
| 43 | Product Rule                 |   |   |   |
| 44 | Quotient Rule                |   |   |   |
| 45 | Fundamental Theorem of Calc  |   |   |   |
| 46 | Integration by Parts         |   |   |   |
| 47 | Taylor Series                |   |   |   |
| 48 | Euler's Formula              |   |   |   |
| 49 | Derivative of sin            |   |   |   |
| 50 | Derivative of cos            |   |   |   |
| 51 | Derivative of e^x            |   |   |   |
| 52 | Derivative of ln             |   |   |   |
| 53 | L'Hopital's Rule             |   |   |   |
| 54 | Mean Value Theorem           |   |   |   |
| 55 | Gaussian Integral            |   |   |   |
| 56 | Lorentz Factor               |   |   |   |
| 57 | Wave Equation                |   |   |   |
| 58 | Heat Equation                |   |   |   |
| 59 | Laplacian                    |   |   |   |
| 60 | Schrodinger Equation         |   |   |   |

---

## Summary (fill in after traversal)

- Total ✅: __ / 60
- Total ⚠️: __
- Total ❌: __
- Total 🔍: __

### Top issues by frequency

1. _Category: count — short description_
2. _..._
3. _..._

### Highest-priority fixes for next session

1.
2.
3.

### Questions for the math professional

-

### Out-of-scope / deferred

-

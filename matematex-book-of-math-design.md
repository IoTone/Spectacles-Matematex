# Matematex Book of Math — Design Document

## Purpose

An interactive "Book of Math" that renders mathematical theorems on Snap Spectacles using the Matematex LaTeX bridge. The user navigates chapters of formulas using next/prev gestures (same pattern as SpaceSVGDemo). Each formula is validated via console output on render. This serves as both a demo application and the primary on-device regression test for the Matematex rendering pipeline.

## Content Sources & Licensing

| Source | License | Coverage | Format |
|--------|---------|----------|--------|
| **ProofWiki** (proofwiki.org) | CC BY-SA 3.0 | Theorems with proofs | LaTeX |
| **DLMF** (dlmf.nist.gov) | Public domain (NIST) | Special functions, identities | LaTeX |
| **OpenStax** (openstax.org) | CC BY 4.0 | Algebra, Trig, Calculus textbooks | LaTeX source |
| **Wikibooks LaTeX/Mathematics** | CC BY-SA 3.0 | Formula examples | LaTeX |
| **Mathematics LibreTexts** | CC BY / CC BY-SA | Structured course content | LaTeX |

All formulas in this book are sourced from CC-licensed or public domain materials. Attribution is provided per formula where applicable.

## Navigation Pattern

Reuse the **SpaceSVGDemo circular array pattern** from the Spectacles-polynode project:

```typescript
// Core navigation: wrapping modulo arithmetic
private navigateChapter(direction: number): void {
    this.currentIndex = (this.currentIndex + direction + FORMULAS.length) % FORMULAS.length;
    this.renderFormula(this.currentIndex);
    this.updateLabel(); // "3/60 Pythagorean Theorem"
}

// Buttons:
// - Prev button (left): navigateChapter(-1)
// - Next button (right): navigateChapter(+1)
// - Label: "${index+1}/${total} ${name}"
```

No scroll views, no tabs, no complex UI. Just next/prev through a flat array of formulas organized by chapter.

## Chapter Organization

### Chapter 1: Geometry (20 formulas)

| # | Name | LaTeX |
|---|------|-------|
| 1 | Pythagorean Theorem | `a^2 + b^2 = c^2` |
| 2 | Law of Cosines | `c^2 = a^2 + b^2 - 2ab\\cos C` |
| 3 | Law of Sines | `\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}` |
| 4 | Area of Triangle | `A = \\frac{1}{2}bh` |
| 5 | Area of Circle | `A = \\pi r^2` |
| 6 | Circumference | `C = 2\\pi r` |
| 7 | Surface Area of Sphere | `S = 4\\pi r^2` |
| 8 | Volume of Sphere | `V = \\frac{4}{3}\\pi r^3` |
| 9 | Volume of Cylinder | `V = \\pi r^2 h` |
| 10 | Distance Formula | `d = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}` |
| 11 | Midpoint Formula | `M = \\left(\\frac{x_1+x_2}{2}, \\frac{y_1+y_2}{2}\\right)` |
| 12 | Slope Formula | `m = \\frac{y_2 - y_1}{x_2 - x_1}` |
| 13 | Heron's Formula | `A = \\sqrt{s(s-a)(s-b)(s-c)}` |
| 14 | Circle Equation | `(x-h)^2 + (y-k)^2 = r^2` |
| 15 | Ellipse Equation | `\\frac{x^2}{a^2} + \\frac{y^2}{b^2} = 1` |
| 16 | Arc Length | `s = r\\theta` |
| 17 | Sector Area | `A = \\frac{1}{2}r^2\\theta` |
| 18 | Euler's Polyhedron | `V - E + F = 2` |
| 19 | Angle Sum (Triangle) | `\\alpha + \\beta + \\gamma = 180^\\circ` |
| 20 | Exterior Angle | `\\theta_{ext} = \\alpha + \\beta` |

### Chapter 2: Algebra (20 formulas)

| # | Name | LaTeX |
|---|------|-------|
| 21 | Quadratic Formula | `x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}` |
| 22 | Difference of Squares | `a^2 - b^2 = (a+b)(a-b)` |
| 23 | Perfect Square | `(a+b)^2 = a^2 + 2ab + b^2` |
| 24 | Cube Difference | `a^3 - b^3 = (a-b)(a^2+ab+b^2)` |
| 25 | Geometric Series Sum | `S = \\frac{a(1-r^n)}{1-r}` |
| 26 | Infinite Geometric Series | `S = \\frac{a}{1-r}, \\quad |r| < 1` |
| 27 | Arithmetic Series | `S_n = \\frac{n(a_1 + a_n)}{2}` |
| 28 | Euler's Identity | `e^{i\\pi} + 1 = 0` |
| 29 | Logarithm Product | `\\log(ab) = \\log a + \\log b` |
| 30 | Change of Base | `\\log_b x = \\frac{\\ln x}{\\ln b}` |
| 31 | Exponent Rule | `a^m \\cdot a^n = a^{m+n}` |
| 32 | Power of Power | `(a^m)^n = a^{mn}` |
| 33 | AM-GM Inequality | `\\frac{a+b}{2} \\geq \\sqrt{ab}` |
| 34 | Triangle Inequality | `|a+b| \\leq |a| + |b|` |
| 35 | Absolute Value | `|x| = \\sqrt{x^2}` |
| 36 | Compound Interest | `A = P\\left(1 + \\frac{r}{n}\\right)^{nt}` |
| 37 | Permutations | `P(n,r) = \\frac{n!}{(n-r)!}` |
| 38 | Combinations | `\\binom{n}{r} = \\frac{n!}{r!(n-r)!}` |
| 39 | Fibonacci Relation | `F_n = F_{n-1} + F_{n-2}` |
| 40 | De Moivre's Theorem | `(\\cos\\theta + i\\sin\\theta)^n = \\cos n\\theta + i\\sin n\\theta` |

### Chapter 3: Calculus (20 formulas)

| # | Name | LaTeX |
|---|------|-------|
| 41 | Power Rule | `\\frac{d}{dx}x^n = nx^{n-1}` |
| 42 | Chain Rule | `\\frac{d}{dx}f(g(x)) = f'(g(x)) \\cdot g'(x)` |
| 43 | Product Rule | `(fg)' = f'g + fg'` |
| 44 | Quotient Rule | `\\left(\\frac{f}{g}\\right)' = \\frac{f'g - fg'}{g^2}` |
| 45 | Fundamental Theorem | `\\int_a^b f(x)\\,dx = F(b) - F(a)` |
| 46 | Integration by Parts | `\\int u\\,dv = uv - \\int v\\,du` |
| 47 | Taylor Series | `f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n` |
| 48 | Euler's Formula | `e^{ix} = \\cos x + i\\sin x` |
| 49 | Derivative of sin | `\\frac{d}{dx}\\sin x = \\cos x` |
| 50 | Derivative of cos | `\\frac{d}{dx}\\cos x = -\\sin x` |
| 51 | Derivative of e^x | `\\frac{d}{dx}e^x = e^x` |
| 52 | Derivative of ln | `\\frac{d}{dx}\\ln x = \\frac{1}{x}` |
| 53 | L'Hopital's Rule | `\\lim_{x \\to a}\\frac{f(x)}{g(x)} = \\lim_{x \\to a}\\frac{f'(x)}{g'(x)}` |
| 54 | Mean Value Theorem | `f'(c) = \\frac{f(b)-f(a)}{b-a}` |
| 55 | Gaussian Integral | `\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}` |
| 56 | Lorentz Factor | `\\gamma = \\frac{1}{\\sqrt{1-\\frac{v^2}{c^2}}}` |
| 57 | Wave Equation | `\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\frac{\\partial^2 u}{\\partial x^2}` |
| 58 | Heat Equation | `\\frac{\\partial u}{\\partial t} = k \\frac{\\partial^2 u}{\\partial x^2}` |
| 59 | Laplacian | `\\nabla^2 f = \\frac{\\partial^2 f}{\\partial x^2} + \\frac{\\partial^2 f}{\\partial y^2}` |
| 60 | Schrodinger Equation | `i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi` |

## Architecture

### Data Structure

```typescript
interface MathFormula {
    id: number;
    chapter: string;      // "Geometry" | "Algebra" | "Calculus"
    name: string;         // "Pythagorean Theorem"
    latex: string;        // "a^2 + b^2 = c^2"
    source?: string;      // "ProofWiki CC BY-SA 3.0"
}
```

### Implementation

Two files:
- **`MathBookData.ts`** — The 60 formulas as a typed array
- **`MatematexBookOfMath.ts`** — The `@component` that navigates and renders

### Navigation (from SpaceSVGDemo pattern)

```
@input prevButton: SceneObject   // left-side Interactable
@input nextButton: SceneObject   // right-side Interactable

// On pinch:
prevButton → navigateChapter(-1)
nextButton → navigateChapter(+1)

// Label: "3/60 Pythagorean Theorem [Geometry]"
```

Each navigate call:
1. Destroys current rendered formula
2. Renders the new formula via MatematexBridge walker+renderer
3. Updates the label
4. Logs validation result to console

### Validation

On startup, run all 60 formulas through the KaTeX parse + walk pipeline:
```
[MatematexBook] Validating 60 formulas...
[MatematexBook] [1/60] Pythagorean Theorem: PASS (3 items, 1ms)
[MatematexBook] [2/60] Law of Cosines: PASS (7 items, 3ms)
...
[MatematexBook] 58/60 passed, 2 with warnings
```

Then render formula #1 and wait for user navigation.

## Effort Estimate (Simplified)

| Task | Effort |
|------|--------|
| `MathBookData.ts` — 60 formulas + metadata | 1-2 hours |
| `MatematexBookOfMath.ts` — nav + render + validation | 2-3 hours |
| Prev/Next button setup in Lens Studio scene | 30 min |
| Testing + formula fixes | 1-2 hours |
| **Total** | **4-7 hours** |

This is ~3x less effort than the full interactive catalog (13-19 hours) while delivering the same validation coverage and a usable demo.

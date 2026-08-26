# Overview

Spectacles-Matematex brings LaTeX to Snap Spectacles as a spatially rendered experience.

- provides a library that can be re-used
- provides compatibility with LaTex
- provides "extensions" to LaTeX for the following:
  - true 3D rendering of "3D view planes" in LaTeX

## Requirements

- R1: Provides a typescript library compatible with LensStudio apis
- R2: The library supports a full LaTeX compliant parser
- R3: The library supports a full LaTeX compliant renderer into SVG
- R4: The library supports a full LaTeX compliant renderer into png
- R5: The library suppoirts a conversion of 3D style plotting into spatial rendering: ( TikZ style: https://en.wikibooks.org/wiki/LaTeX/PGF/TikZ )
- R6: The design should be efficient in memory and cpu use with regards to Snap Spectacles and known limitations
- R7: No external online services should be used, this should be 100% local.

## Existing Libraries

- We should utilize SpaceSVG for SVG Rendering : https://github.com/IoTone/Spectacles-polynode/blob/main/PolynodeSpecsDemo/Assets/ProjectScripts/SpaceSVG.ts 
- If we need off screen DOM library support, for portiing, we should use our own library called SpaceDOM: https://github.com/IoTone/Spectacles-polynode/blob/main/PolynodeSpecsDemo/Assets/ProjectScripts/SpaceDOM.ts
- Katex or MathJAX are the best libraries, but porting may be complicated.  

## Prototypes

- Some propotype work has been attempted on the existing branch, and we have katex and mathjax located in this project under Assets/ProjectScripts/libmatematex
- The previous effort went on before we had a fully functional SVG renderer, so any prototype work should be considered just experimental.

## Design Proposal

Approach A was selected: run KaTeX unmodified on top of SpaceDOM, then walk the
resulting DOM tree into Lens Studio scene objects. Full rationale, the two
rejected alternatives, and the comparison matrix are in
**[matematex-design-spec.md](./matematex-design-spec.md)**.

## Implementation

| Doc | Covers |
|---|---|
| [matematex-design-spec.md](./matematex-design-spec.md) | Architecture, module breakdown, test plan, phase-by-phase status |
| [matematex-porting-review.md](./matematex-porting-review.md) | What of KaTeX's HTML output the bridge handles today, what's missing, prioritized roadmap |
| [book-of-math-v2-plan.md](./book-of-math-v2-plan.md) | Search index, Spectacles UIKit migration, voice/keyboard input, Linear Algebra chapter |
| [phase6-visual-qa.md](./phase6-visual-qa.md) | Per-formula visual defect catalog (80 formulas) |

The sample lens is `Matematex/` — open it in Lens Studio and enable the
`MatematixBookOfMathPhase6` scene object. It validates all 80 formulas on
startup and logs the result.

## Future

In the future, we plan to implement:
- Shared viewing of diagrams
- Web Publishing of content
- Spatial Content libraries

## Using the library elsewhere

**[MATEMATEX.md](MATEMATEX.md)** is the integration guide: which files to copy,
the minimum viable render, the scene setup, and the six Lens Studio traps that
each cost a day and none of which produce an error message.

## Third-party assets

Bundled in the lens and credited on its About page.

| Asset | Source | Credit |
|---|---|---|
| `Matematex/Assets/591291__21100267__textbook-page-turn.mp3` — the page-turn sound | [freesound.org/people/21100267/sounds/591291](https://freesound.org/people/21100267/sounds/591291/) | "Textbook page turn" by freesound user **21100267** |
| `KaTeX_Main-Regular.ttf`, `KaTeX_Math-Italic.ttf` and the metrics in `KaTeXFontMetrics.ts` | [KaTeX 0.16.22](https://github.com/KaTeX/KaTeX) | MIT, © Khan Academy and contributors |

The 11.3 s recording is a page being turned over and over. `MatematexPageTurn`
plays a random one-second window of it per turn, so no two consecutive pages
sound identical — the same transient replayed twenty times while paging through
a chapter is what makes a UI sound feel synthetic.

Formula content sources (ProofWiki, DLMF/NIST, OpenStax, Wikibooks, LibreTexts,
Wikipedia) are listed on the About page.

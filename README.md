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

## Existing Libraries

- We should utilize SpaceSVG for SVG Rendering : https://github.com/IoTone/Spectacles-polynode/blob/main/PolynodeSpecsDemo/Assets/ProjectScripts/SpaceSVG.ts 
- Katex or MathJAX are the best libraries, but porting may be complicated.  

## Prototypes

- Some propotype work has been attempted on the existing branch, and we have katex and mathjax located in this project under Assets/ProjectScripts/libmatematex
- The previous effort went on before we had a fully functional SVG renderer, so any prototype work should be considered just experimental.

## Design Proposal

TODO

## Implementation

TODO

## Future

In the future, we plan to implement:
- Shared viewing of diagrams
- Web Publishing of content
- Spatial Content libraries

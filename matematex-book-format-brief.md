# Book Format — Design Brief

Target: Book of Math, 1st Edition. This brief covers the shell the maths lives
in — cover, page, folio, navigation — not the maths itself. The formula
renderer, the proof renderer and the search screen are unchanged by everything
below except where explicitly noted.

---

## 0. Decisions taken

| | Decision | Status |
|---|---|---|
| School Pack | **Out.** Untracked, unreferenced, not in the scene. | Deleted |
| Book position | **World-locked.** Already is — see §0.1. | No work needed |
| Page shape | **Portrait**, taller than the field of view. | §4.0 |
| Paper | **Filled**, colour TBD on device. | Experiment live — §4.0 |

### 0.1 The book is already world-locked

The brief's first draft claimed the container was head-locked. It is not.
`MatematexBookOfMath` sits under `/Scene/MatematixBookOfMathPhase6`, a root
group at world z −100, with nothing parented to `Camera Object`; the camera
carries `Device Tracking`, so the wearer moves and the book does not.
`useWorldSpace` is `false`, but that only chooses local vs world *positioning
of the container within its parent* — the parent is already fixed in the world.

So the wearer can already walk around the book. That is worth confirming on
device (tracking drift is the thing that would spoil it), but no phase of work
is needed, and it removes the main objection to a page larger than the field of
view.

---

## 1. What is actually wrong today

The current lens is a **slide deck**, and it reads as one for four specific
reasons. Naming them matters, because three of the four are cheap to fix and
the fourth is the one that decides the visual language.

1. **Nothing bounds the page.** Content floats at z −100 against the room.
   There is no edge, so there is no artefact — the wearer is looking at
   *labels in space*, not at *a page*.
2. **The controls are the furniture.** Nine capsule buttons sit in the same
   visual layer as the content, at the same brightness, permanently. A book has
   no buttons on it.
3. **There is no position.** No folio, no running head, no sense of "page 34 of
   80". Prev/next moves an index the wearer cannot see.
4. **There is no arrival.** The lens opens on a table of contents. Books open
   on a cover, and the cover is what tells you what kind of book it is before
   you read a word.

---

## 2. The constraint that decides the look

**Spectacles' display is additive.** Black is not black; black is transparent.
Everything a surface does on a normal screen — sit behind the type, block what
is behind it, define an edge — it does here only to the extent that it *emits*.
The failure mode that follows is specific:

> A white or cream page fill is a large, permanently-lit rectangle floating in
> the wearer's living room. It is the brightest object in the scene, it washes
> out the room behind it, and it costs battery for the privilege.

Note what that rules out: a **bright** fill. It does not rule out a fill.
A dark slate or a deep blue-grey at low alpha adds barely any light and still
does the one job the page needs doing — bounding the sheet, so the reader sees
a page rather than labels in space. That is the version being tested (§4.0),
and it is why every colour in `MatematexPage` is an input rather than a
constant: the difference between "paper" and "lightbox" is a few tenths of
alpha, and it cannot be judged in a preview that composites over black.

What survives regardless is the weighting: the page's **rules carry it**, and
the fill supports them. Grid lines, a border rule, the margin — those read at
any brightness. If the fill has to go to zero on device, the page still works;
if the rules go, it does not.

This is also why the Bitmoji School Pack (§8) was the wrong art direction: not
because it was filled, but because it was filled *bright, opaque and saturated*,
which is the one thing this display punishes.

The **cover** (§5) takes the same treatment a step further — a dim deep blue
fill, so the falling glyphs have something to read against.

---

## 3. The object model

Five states, replacing the current five screens. `Screen` in
`MatematexBookOfMath.ts` grows one member and loses none.

| State | Folio | What it is |
|---|---|---|
| **Cover** | — | Closed book. Title, edition, animated glyph rain. New. |
| **Front matter** | i–iv | Contents. Paged like the body. Replaces the splash. |
| **Body** | 1–80 | One formula per page. Formula `id` **is** the page number. |
| **Proof** | 1–80 | Overlay on the current page, not a separate location. |
| **Search** | — | Unchanged. Out of scope for this brief. |

Two structural claims worth stating outright:

- **Formula id == page number.** There are exactly 80 formulas with contiguous
  ids 1–80, chapters partition them into four blocks of 20, and
  `MATH_FORMULAS` is already indexed `id − 1`. A separate pagination model
  would be a second source of truth for a number we already have. If the book
  ever grows a formula that spans two pages, that is the moment to introduce
  one — not before.
- **Front matter is roman.** i–iv, lowercase, centred. It is the cheapest
  possible signal that the contents are *not* page 1, and it is the convention
  every reader already knows.

---

## 4. The page

### 4.0 Portrait, and what it costs

The page is portrait. Two facts decide how portrait:

**The display is nearly square.** From the FOV the code already derives —
~33° vertical, ~46° diagonal — the horizontal half-angle works out at 16.9°
against 16.5° vertical. At the shipped 101-unit viewing distance that is a
visible box of roughly ±30 × ±31 world units. A portrait page inscribed *inside*
that box is therefore very narrow: at 1:1.41 it would be ±21 wide at most.

(Separately: `SAFE_HALF_WIDTH` is 34, which is wider than the ±31 that
derivation gives. One of the two is wrong. Worth a device check — it is not
load-bearing for anything below, because §4.0 stops treating the FOV as the
page boundary.)

**Narrowing the measure shrinks formulas, and it is measurable.**
`renderFormula` already scales any formula wider than the measure down to fit.
`test/layout-conformance/page-fit-audit.ts` lays out all 80 at the scene's
`emToWorld` of 5 and counts how many that catches:

| Type measure | Formulas shrunk | Worst case |
|---|---|---|
| ±34 (today, landscape) | 2 / 80 | 90% |
| ±26 | 12 / 80 | 69% |
| ±24 | 17 / 80 | 64% |
| ±22 | 23 / 80 | 59% |
| ±19 (portrait inside the FOV) | 34 / 80 | 51% |

The widest formula is #40, De Moivre's Theorem, at 75 units; the median is 36.
So a portrait page that fits the field of view halves the size of the widest
theorem in the book, and shrinks 34 of them — that is not a page shape, it is a
legibility regression.

**Therefore: the page is portrait and larger than the field of view.**
±26 × ±37 world units, 1:1.42, with a type measure of ±24 inside a 2-unit
margin. That costs 17 formulas some shrink and #40 a third of its size, which
is real but survivable, and it buys a page that behaves like a book: you see
the type area, and the head and foot of the sheet run past the edge of your
vision the way a real book at reading distance does. Because the book is
world-locked (§0.1), stepping back takes the whole sheet in.

This is the number most likely to move after a device session. It is one
`@input` on `MatematexPage`, and `page-fit-audit.ts --half-width=N` prices any
alternative in seconds.

### 4.1 Furniture

Drawn once per page, in this order back-to-front:

```
  ┌───────────────────────────┐ ─┐
  │ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ │  │  head margin — runs past the top
  │ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │  │  of the FOV at reading distance
  │ ┊ Geometry           ·34 ┊ │ ─┘  ← running head + folio
  │ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │
  │ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ │  ─┐
  │ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │   │
  │ ┊  Pythagorean Theorem  ┊ │   │  ← formula name
  │ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │   │  TYPE AREA, ±24
  │ ┊ ┊  a² + b² = c²  ┊ ┊ ┊ │    │  the band you actually see
  │ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │   │
  │ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ │   │
  │ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │  ─┘
  │ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ │
  │ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │  ─┐
  │ ┊ ‹                   › ┊ │   │  ← turn ears (§6.3)
  │ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │   │  foot margin
  └───────────────────────────┘ ─┘
    ←──────── ±26 ────────→
```

- **Grid**: 4 world units per square, with every 5th line heavier — the
  minor/major distinction is what makes it read as *graph paper* rather than as
  *a mesh*. Drawn in **warm neutral grey, and that is a constraint, not a
  taste**: the proofs own four hues (`COLOR_BLUE`, `COLOR_RED`, `COLOR_GREEN`,
  `COLOR_AMBER`) and use them to carry meaning — which piece moved, which region
  is congruent to which. The grid was first drawn at (0.45, 0.62, 0.95), which
  is `COLOR_BLUE` to within a rounding error, and a figure whose blue piece is
  the same colour as the paper it is printed on has lost the distinction it was
  drawn to make. The sheet takes the part of the space the proofs left empty:
  no hue at all. One `MeshBuilder` line mesh, one scene object, one draw call.
  `GridMesh.ts` already demonstrates the pattern; it needs converting from
  `MeshTopology.Triangles` to `Lines` and parameterising.
- **Page rule**: the same mesh, four segments, alpha 0.35. This is the single
  most important element — it is what turns floating text into a page.
- **Running head**: chapter name, upper left, scale 0.20, alpha 0.6.
- **Folio**: page number, upper right, scale 0.20. Upper rather than lower
  because the bottom band at y −27 is already spoken for by the turn ears and,
  on the contents pages, by the chapter buttons.
- **Margin rule** (optional, decide on device): one vertical red-ochre line at
  x −26, the notebook convention. Adds warmth; also adds a permanently-lit
  coloured line. Try it, keep it only if it survives a walk around the room.

### 4.2 What the grid must not do

The grid is behind the formula and must never fight it. Two guards:

- Grid alpha is capped such that a grid line crossing a glyph stem is visibly
  dimmer than the stem. If the formula looks like it is on a screen door, the
  alpha is wrong.
- The grid is **not** re-built per page. It is built once, parented to the page
  container, and left enabled across turns. Only the content under it changes.
  This matters for §6.4.

### 4.3 Proof overlay

A proof is **printed on the page**, in front of the sheet. It is worth saying
outright because the first version had it backwards:

```
  container-relative z, not to scale, reader on the right

  BEFORE   proof ──── paper ──── content            👁
           z −10      z −0.6     z 0
             ▲          │
             └──────────┘  sight stops at the paper: proof z-culled

  NOW               paper ──── content ─── proof    👁
                    z −0.6     z 0         z +0.5
                    (writes no depth)        ▲
                                             └── printed on the page
```

`proofOffsetZ` was −10, chosen when there was nothing behind the content at
all. The portrait sheet turned that into a figure hidden ten units behind the
paper. Turning off the paper's depth writing made it visible again — but that
was a rendering accident papering over the wrong arrangement, and it cost size
too: ten units further from the reader draws about 9% smaller than the fit box
asked for. It is now +0.5.

The sheet still writes no depth, which is what lets a *spatial* proof reach
behind the page plane by its own thickness without being sliced — a solid
sitting on a page should be able to do that.

One change of framing: on entering Proof, the grid and page rule **stay** and
the formula content is cleared. The proof is drawn on the same page. Right now the proof reads as a different application; keeping
the furniture makes it read as a figure printed in the book. The Proof/Back
button stays exactly as it is — it already works and it is already labelled
correctly.

---

## 5. The cover

### 5.1 Geometry

A closed book seen face-on, tilted a few degrees so it reads as an object:

- Cover slab: **our own `MeshBuilder` box**, ~56 × 74 × 6 world units, built
  the way `MatematexProof.ts` builds solids — vertex colours with `shadeFor()`
  baked lighting, so the spine and fore-edge separate without depending on
  scene lights we do not control.
- Fill: deep blue, alpha ≈ 0.22. Enough to tint, not enough to block the room.
- Edges: a 1-unit bright rule around the front face and down the spine. In
  additive display the *edges* are what make it a solid.
- Spine visible at a slight yaw (≈ 12°), with the title running vertically.

### 5.2 Type

```
        THE BOOK OF MATH
          First Edition

        80 theorems · four chapters

        Built with Matematex
```

Set in the KaTeX Main face already in the project, so the cover is in the same
voice as the interior.

### 5.3 The rain

The cover's animated element: mathematical symbols and digits falling down the
cover face, Matrix-style, rendered by Matematex rather than as plain text.

**Architecture — pre-render, then recycle.** This is the whole design:

1. At cover build, lay out a **pool of ~24 short LaTeX fragments** through the
   existing bridge — `\int`, `\sum`, `\nabla`, `\alpha`, `\lambda`, `\infty`,
   `\partial`, digits, `\pi`, `e^{i\pi}`, and so on. Each becomes a small
   parented sub-tree of glyph objects. This happens once.
2. Arrange **10–14 columns** across the cover face, each holding **5–7**
   fragments taken from the pool.
3. Per frame, advance each column's y and each fragment's alpha (brightest at
   the head of the column, fading up the trail).
4. When a fragment falls off the bottom, **move it back to the top and swap
   which pool fragment it shows** by enabling a different pre-built sub-tree —
   *never* by re-running the layout and *never* by writing `.text`.

That last point is the one that decides whether this ships. Writing `.text` on
a `Component.Text` forces a re-layout of that component; doing it for 70
objects every frame is exactly the kind of thing that turns a 57 ms frame into
a dropped one. Recycling transforms is nearly free; re-laying out glyphs is
not.

**Budget**: ~70 visible fragment sub-trees, at 1–3 glyph objects each, is
150–200 scene objects — comfortably under the 388 that proof #7 already builds
in 15 ms. Column speeds vary (0.6–1.4× base) so the columns never phase-lock.

### 5.4 Leaving the cover

Forward-swipe, or pinch anywhere on the cover, opens to front matter page i.
Back-swipe from page i returns to the cover — the book closes. That round trip
is worth the small amount of work it costs; it is what makes it a book rather
than a splash screen.

---

## 6. Navigation

### 6.1 The gesture

Horizontal swipe of the dominant hand, tracked through
`SIK.HandInputData.getDominantHand()`. Every keypoint exposes a
`screenPosition: vec2`, which is the right space to measure in — it is
resolution-independent and it does not care how far the wearer is standing from
the page.

Proposed detector, to be tuned on device:

| Parameter | Start value | Note |
|---|---|---|
| Tracked point | `indexKnuckle` | Steadier than `indexTip`, which pitches with the finger |
| Travel threshold | 0.22 of screen width | |
| Max duration | 500 ms | Longer travel is a reach, not a swipe |
| Max vertical drift | 0.5 × horizontal travel | Rejects diagonal reaches |
| Cooldown | 350 ms | One turn per swipe, always |
| Gate | `hand.isTracked()` and not `hand.isPinching()` | A pinch is a button press, not a page turn |

Direction: swipe **left** → page forward (`»`), swipe **right** → page back
(`«`). This is the direction the page itself moves, and it matches every
touchscreen reader the wearer has ever used.

### 6.2 What gets removed

`Launch PinchButtonCapsuleLeft` and `...Right` come out of the scene. The
chapter, search, about and proof buttons **stay**, and stay confined to the
front matter (chapter/search/about) and the formula/proof pages (proof) exactly
as they are now.

### 6.3 Turn ears — the fallback, and the affordance

Two small ink chevrons, `‹` and `›`, at the bottom outer corners of the page,
alpha 0.35. Each has an **invisible collider with a PinchButton** behind it.

They pay for themselves three times:

- **Discoverability.** A gesture nobody knows about is a lens that does not
  work. The chevrons are the only hint the wearer gets.
- **Desktop.** The Lens Studio preview has a `MouseInteractor` and no hand.
  A gesture-only book is untestable at your desk — every layout iteration would
  need a device. This is the practical reason the ears are not optional.
- **Recovery.** Hand tracking drops. Something has to still work.

They are ink marks, not capsules — which is the whole point of the change.

### 6.4 The turn itself

Not a page-flip mesh warp; that is a week of work and a mesh deformation budget
this lens does not have. Instead:

- Outgoing content slides ~10 units in the swipe direction while fading to 0
  over **160 ms**.
- Incoming content fades in from 0 over the same 160 ms, arriving from the
  opposite side.
- **The grid, page rule, running head and folio do not move.** The page stays;
  its contents change. This is what sells it — and it is why §4.2 insists the
  grid is built once and left alone.

A held swipe (or a held ear) repeats at 4 pages/sec after 600 ms, so getting
from page 3 to page 61 does not require 58 swipes. Chapter buttons on the
contents pages remain the real answer for long jumps.

---

## 6.5 How the gesture actually works

Built as `MatematexPageTurn.ts`. Two pictures carry it: what a sweep has to look
like, and what it has to survive.

**The envelope.** A sweep is accepted only inside both limits — enough travel,
not too much drift:

```
   the wearer's view, screen x runs 0 → 1
  ┌──────────────┬─────────────┬──────────────┐
  │              ┊             ┊              │
  │   rejected ↖ ┊             ┊              │
  │       (a reach, not a sweep)              │
  │        ╲     ┊  ╲       ╱  ┊              │
  │  ◀───────────┼───● start ──┼──────────▶   │
  │  FORWARD     ┊  ╱       ╲  ┊      BACK    │
  │              ┊  drift cone ┊              │
  │              ┊  |dy| ≤ ½|dx|              │
  └──────────────┴─────────────┴──────────────┘
        0.22 travel      ·      0.22 travel

   right-to-left = forward, the way your hand goes
   turning a real page
```

**How to hold your hand.** Open hand, fingers extended, palm facing the page —
the shape you would use to sweep a page across a desk. Sweep across your field
of view at about reading distance. **Not a pinch**: a pinch is a button press
and is gated out, so pulling back from a chapter button never turns the page.
**Not a fist**: the tracker wants to see fingers, and this reads the index
knuckle, which a fist tucks away from the camera. Distance matters more than
speed — cross a good fraction of your view, roughly shoulder-width at arm's
length, in well under half a second.

**Tracking loss is part of the gesture, not a failure of it.** Hand tracking
drops during fast motion and at the edge of the camera's view — which is exactly
where a swipe *ends*. The first build cleared its history the moment tracking
dropped, so a completed swipe erased its own evidence and never fired at all.
A loss now triggers one final judgement of the window against the last sample
actually seen, and the history survives a brief blink before being discarded.

The measured point is the index **knuckle**, not the fingertip — the tip
pitches several degrees as the finger curls, which reads as horizontal travel
the hand never made. Screen space rather than world space, because that is the
space the gesture is performed in: how far the reader is standing from the book
has nothing to do with it.

**The gates.** Six, in order, each with its own exit:

```
  every frame
      │
      ▼
  hand.isTracked()          ──✗──▶ no hand — drop the stroke
      │
      ▼
  not hand.isPinching()     ──✗──▶ a pinch is a button press
      │
      ▼
  |dx| ≥ 0.22 within 0.5s   ──✗──▶ too short, or too slow: re-seed
      │
      ▼
  |dy| ≤ 0.8 × |dx|         ──✗──▶ diagonal: a reach (arms arc)
      │
      ▼
  armed?                    ──✗──▶ still disarmed from the last turn
      │                              (see THE RETURN STROKE)
      ▼
  direction vs last turn    ──✗──▶ reversal inside 1.2s: return stroke
      │
      ▼
  book.canTurnPage()        ──✗──▶ search screen / inside a proof
      │
      ▼
  navigate(dx < 0 ? +1 : −1)
```

Every gate buys a missed swipe at the price of a swipe nobody asked for — the
failure that costs the reader their place. Losing tracking **abandons** the
stroke rather than pausing it: a stale origin is how a hand that reappears
somewhere else fires a turn nobody asked for.

**The return stroke.** A hand swipe is not one movement, it is two: you sweep,
and then your hand comes back. The return travels the same distance, along the
same line, in the opposite direction — a textbook-perfect BACK swipe arriving
about half a second after the FORWARD one. The first build turned the page and
turned it straight back.

A longer cooldown does not fix this, it only moves the race. Neither does "wait
until the hand is slow", checked frame by frame — and that one is worth spelling
out, because it looks right and is exactly wrong:

> **A hand reversing direction passes through zero velocity at the turn.**

A single-frame "is the hand slow?" test therefore succeeds at the precise
instant *between* the two halves of the wave. The detector re-arms at the
turnaround and the return stroke that follows is a clean, fully qualified swipe.
That shipped, and it is why the page still turned back.

What distinguishes the end of a gesture from the middle of one is the
**duration** of stillness, not stillness. Two guards, both needed:

```
  turn fires
      │
      ├─ 0.45 s elapsed ─────────────┐
      │                              ├──▶ re-armed
      └─ hand CONTINUOUSLY under ────┘
         0.4 screen widths/sec
         for 0.25 s

  the turnaround dip lasts a frame or two —
  a hand that has finished lingers

  ...and separately, a turn in the OPPOSITE direction to the last
  one needs 1.2 s, not 0.45. Paging on in one direction is normal;
  instantly reversing is the return stroke's signature.
```

**The window.** Detection slides rather than seeding a stroke. The first build
pinned an origin and re-seeded it whenever a sweep ran past `maxDuration`, which
quietly ate real swipes — re-seeding mid-sweep throws away the travel already
banked. Now every frame looks back over the last 0.6 s of samples and takes the
one giving the largest horizontal travel that still passes the drift test.
Nothing to seed, nothing to lose, and a swipe registers the moment it has gone
far enough. That is the half of this aimed at *consistency* rather than at
false positives.

**Sound.** Each turn plays a random one-second window from an 11.3-second
recording of a page being turned over and over, so every turn is a *different*
turn. The same 400 ms transient replayed on every page is what makes a UI sound
feel synthetic, and paging through a chapter fires it twenty times in a row.
Credit — "Textbook page turn" by freesound user 21100267,
[freesound.org/s/591291](https://freesound.org/people/21100267/sounds/591291/) —
is carried on the About page, where a reader can actually see it.

`debugLog` prints the numbers behind every accepted *and* rejected stroke,
because none of this is testable at a desk — the preview has a `MouseInteractor`
and no hands. **Tune against the false-positive rate while idle**, not the hit
rate: wear it, talk with your hands for a minute, count the turns you did not
ask for.

---

## 7. Front matter and the contents

Four pages, roman-numbered, turned with the same gesture as the body:

- **i — Half title.** `Book of Math`, `First Edition`, the theorem count, and
  `Built with Matematex library`. Quiet. This is the page that currently exists
  as the splash, minus the table.
- **ii–iii — Contents.** The chapter list *and* the formula list. Twenty
  formulas per chapter is too many for one page at a legible scale, so:
  two chapters per page, each as a chapter heading with its page range,
  followed by its twenty entries in two columns of ten, `name` left and page
  number right with a leader. Scale ≈ 0.16–0.18; this needs a device check
  before it is committed to, and it is the one part of this brief most likely
  to come back as "too small".
- **iv — About.** Sources, licences, `© IoTone, Inc.` The current About page,
  relocated into the book where it belongs. The About button then only needs to
  exist as a jump-to-page-iv shortcut, or can go away entirely.

The four chapter buttons stay on the contents pages, aligned to their chapter
headings the way they are aligned to TOC rows today.

---

## 8. The School Pack — removed

`Matematex/Assets/School Pack.lspkg` (1.2 MB) is a Bitmoji school prop set:
`C_thickBookA_GEO` / `C_thickBookB_GEO` with a 512² hardcover atlas,
`C_notebook_GEO` with a 1024² atlas, plus a desk, ruler, pencil and scissors.
It was **not placed in the scene**, not referenced by `Scene.scene`, and not
tracked by git — an imported asset and nothing more. It has been deleted.

Reading the atlases directly: `thick_book_color.png` is a cartoon hardcover —
crimson boards with a green cloth spine band, chunky flat shading, no gradients.
`notebook_color.png` has a nice **ruled** pad (blue lines, red margin, red
binding strip) — but ruled, not gridded, and it is one island in an atlas
shared with a backpack, a pencil and a roll of tape.

Three reasons it is the wrong choice here:

1. **Style.** It is Bitmoji-schoolyard: saturated, chunky, deliberately naive.
   Every other pixel in this lens is crisp KaTeX ink. Putting a cartoon prop
   next to a correctly-kerned `\int_a^b` makes both look wrong.
2. **Additive display.** These meshes are lit, opaque, textured props designed
   for a filled render. On an additive waveguide a crimson slab is a bright
   crimson rectangle in the room. Everything in §2 argues against it.
3. **The cover face is not ours.** The cover's UV island is a flat region of a
   shared atlas. Floating the rain on a quad in front of it works, but then the
   mesh is contributing nothing but a coloured rectangle — which §5.1 builds in
   about thirty lines with full control and no import.

Recovering it, if the textbook look ever wins, is a re-import — the pack is a
published Lens Studio asset, not something authored here.

Deleting it dropped 1.2 MB from the lens.

---

## 9. Build order

Each phase is separately shippable and separately checkable on device.

| # | Phase | Acceptance |
|---|---|---|
| 1 | Page furniture: grid mesh, page rule, running head, folio | A formula page reads as a page from across the room; grid does not fight the glyphs |
| 2 | Roman front matter, contents pages ii–iii, About → iv | Every formula reachable from the contents; entries legible on device |
| 3 | Turn animation + turn ears, prev/next capsules removed | Turning feels like turning; ears work with the mouse in preview |
| 4 | Swipe detector | 20 deliberate swipes → 20 turns, 0 spurious turns during a 60 s idle with hands visible |
| 5 | Cover: geometry, type, open/close | Lens opens on the cover; forward-swipe opens the book; back-swipe from i closes it |
| 6 | Cover rain | Frame time on the cover ≤ the 57 ms proof #7 already costs; no allocation per frame |
| 7 | Remove School Pack | Lens size down ~1.2 MB, nothing breaks |

Phases 1–3 are worth doing even if the gesture work is deferred: they are what
turn the deck into a book. Phase 4 is the one with device-only risk.

---

## 10. Risks

- **Spurious page turns.** The real failure mode is not a swipe that fails to
  register, it is a page that turns while the wearer is gesturing at something
  else, twice in a row, and loses their place. The pinch gate, the vertical
  drift limit and the cooldown all exist for this. Budget a tuning session, and
  measure the *false positive* rate during idle, not the hit rate.
- **Contents legibility.** 40 entries across two pages at 0.16–0.18 scale is
  the tightest type in the lens. It may need three pages, or names may need
  truncating. Check before building the leaders.
- **Cover frame cost.** Mitigated by pre-rendering the fragment pool (§5.3),
  but the number to watch is text re-layout, not object count. If frame time
  spikes, the cause is a `.text` write somewhere in the per-frame path.
- **Grid alpha in a bright room.** A 0.10-alpha line is invisible outdoors and
  correct indoors. It may need to be a tunable `@input` rather than a constant,
  which is cheap insurance.

---

## 11. Open questions

Answered (§0): School Pack out, book already world-locked, page portrait.
What is left is device work, not decisions on paper.

1. **What colour is the paper, and does a fill work at all?** The experiment is
   in the scene now — `MatematexPageExperiment`, a `MatematexPage` component
   next to the book, drawing a ±26 × ±37 sheet with every colour and dimension
   as an `@input`. Preview logs `52x74 units, pitch 4, 4 layers drawn`. Judge it
   on device, not at the desk: the preview composites over black and an additive
   waveguide does not, so a fill that reads as paper in one can read as a
   lightbox in the other. `paperColor` alpha 0 gives back today's transparent
   look for A/B in a single field.
2. **Is ±24 the right measure?** It shrinks 17 formulas, worst 64% (§4.0).
   `page-fit-audit.ts --half-width=N` prices any alternative.
3. **Does the world lock hold?** Walk around the book for a minute and watch for
   drift. If it swims, that is a tracking problem, not a design one.
4. **Margin rule** (§4.1) — device call.

# Character reference library

Every reference image is traced into vector shapes that are drawn with the HTML Canvas API.
This library is the source material for the character generator.

**[DRAWING_GUIDE.md](DRAWING_GUIDE.md)** — how the characters are drawn: the art style, body, clothes and
faces, with measurements and illustrations (`guide/`).

## Contents
- `originals/` — the 65 unique reference images (duplicates removed), named by character and content. 01–16 are the body sheets; 17–56 are face close-ups, head sketches and one more body sheet (53); 57–65 are hand references (65 is also a full Korra pose).
- `traces/<id>.js` — one traced figure per file (118 figures: 47 bodies and poses, 61 faces and heads, 10 hands). Each file adds one object to `window.TRACES`.
- `gallery.html` — opens in a browser; draws every traced figure with Canvas next to its original crop.
  Filter by character, sex, view or outfit piece. Click a figure to enlarge.
- `tools/figures.json` — where each figure sits in its sheet (box), plus character, sex, view and outfit tags.
- `masks/<id>.png` — for figures that are not on a plain page (screenshots with scenery, sheets of line
  drawings): white marks the figure inside its box. Made by `tools/cutout.py`.
- `tools/cutout.py` — makes those masks. Screenshots use a segmentation network (`pip install rembg
  onnxruntime`, model downloaded on first run); line drawings use the connected lines with the
  interior filled; single parts such as hands are grown from seed points on their flat colours. `python3 tools/cutout.py [id ...]`. Run it before `trace.py` for a new figure.
- `tools/trace.py` — the tracer. `python3 tools/trace.py` re-traces everything; `python3 tools/trace.py <id> ...` re-traces some.
- `tools/compare.js` — renders each trace beside its original and reports a mean colour difference (`node tools/compare.js <out_dir> [id ...]`).
- `tools/render_lib.js` — the Canvas renderer (`drawTrace(ctx, trace)`).
- `tools/build_gallery.py` — rebuilds `gallery.html` after re-tracing.

## Trace data format
```
{ id, src, box:[x0,y0,x1,y1], character, sex, view, outfit:[...], width, height,
  palette: ['#rrggbb', ...],            // the figure's own flat colours
  order:   [paletteIndex, ...],         // drawing order (largest areas first, ink last)
  paths:   [[paletteIndex, [ring, ring, ...]], ...] }
```
A ring is a flat list `x, y, sharp, x, y, sharp, ...` in source pixels relative to the figure box.
The first ring is the outline, any others are holes (even-odd fill). Points are joined with smooth
curves except where `sharp` is 1. Shapes are stacked: each colour layer is drawn over the previous ones.

## Figures
| Source | Figures |
|---|---|
| Mako (6 images) | lineart front, face close-up, firebending pose, two 4-view turnarounds, colour front |
| Korra season 1 sheet | 3/4, front, back, side + three head studies |
| Korra season 4 sheet | avatar state, 3/4, front, back |
| Korra other | front pair (3/4 + front), leaning pose, season 4 front |
| Metalbender officer (female, armour) | 3/4, front, back, side |
| Bolin (suit) | side, 3/4, front, back |
| Kuvira (coat + metal armour) | 3/4 front, back |
| Asami (jacket + skirt) | 3/4, front, side, back |
| Asami (capelet outfit, gown) | capelet front, capelet 3/4, gown front, back, side |
| Bolin (tunic sheet, image 53) | side, front, 3/4 |

Faces and heads (ids contain `_face_`, `_profile_`, `_head_`, `_expr_` or `_sketch_`; views `head_front`,
`head_three_quarter`, `head_side`):

| Character | Colour close-ups | Line drawings |
|---|---|---|
| Korra | 6 front (2 with the bob), 4 side profiles, plus the 3 small head studies on the season 1 sheet | 3 front (ink bob, pencil, ink ponytail) |
| Mako | 2 front (one show screenshot, one tutorial drawing), 4 three-quarter, 1 side (upper body) | 3 front (two stages of the tutorial drawing, one other) |
| Asami | 2 front, 3 three-quarter, 2 side | — |
| Bolin | 2 front, 1 three-quarter | 4 expression studies, 10 small heads, 7 from a sketch sheet (one is a side-view body) |
| Kuvira | 1 front, 4 three-quarter | — |

Hands (ids start with `hand_`, view `hand`): Korra palm up, open hand from the side, fist against the
cheek, hand spread downward, an open palm, a fist hanging at the side and a hand on the hip (both small, from image 65); Lin's raised hand; Amon's spread hand; one fan-art fist.
Images 61 (comic-style punch) and the second palm in image 64 are saved but not traced.

## Known limits
- Off-white details that touch the background (some fur trims, the lineart's white fill) are hard to
  separate from a white page; enclosed ones are kept.
- The Korra season 1 sheet and the Mako turnaround photos are photographed paper: small heads (~70 px)
  come out blotchy and a little paper shadow remains near Mako's feet on sheet B.
- Watermarks/signatures are removed (inpainted or excluded); faint remnants can remain in the Mako close-up.
- Face close-ups are show screenshots: colours carry the scene's lighting (several are tinted or
  dark), and the picture frame crops the figure. Small irises can still lose their colour to a
  neighbouring grey even with the extra detail colours.
- `asami_profile_closeup`: her black hair is on a black background, so only the face, neck and collar
  are cut out.
- The Bolin sketch sheets (images 30–32) are small scans (heads 60–190 px): traces follow the lines but
  are rough. Image 31 has overlapping drawings, so its figures include stray lines from neighbours.
- Line drawings are traced as filled white shapes with their ink lines on top; open contours
  (shoulders, collars that run off the drawing) are left unfilled.

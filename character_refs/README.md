# Character reference library

Every reference image is traced into vector shapes that are drawn with the HTML Canvas API.
This library is the source material for the character generator.

## Contents
- `originals/` — the 16 unique reference images (duplicates removed), named by character and content.
- `traces/<id>.js` — one traced figure per file (46 figures). Each file adds one object to `window.TRACES`.
- `gallery.html` — opens in a browser; draws every traced figure with Canvas next to its original crop.
  Filter by character, sex, view or outfit piece. Click a figure to enlarge.
- `tools/figures.json` — where each figure sits in its sheet (box), plus character, sex, view and outfit tags.
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

## Known limits
- Off-white details that touch the background (some fur trims, the lineart's white fill) are hard to
  separate from a white page; enclosed ones are kept.
- The Korra season 1 sheet and the Mako turnaround photos are photographed paper: small heads (~70 px)
  come out blotchy and a little paper shadow remains near Mako's feet on sheet B.
- Watermarks/signatures are removed (inpainted or excluded); faint remnants can remain in the Mako close-up.

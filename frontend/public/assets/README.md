# Optional hero photo assets

The homepage ships with an illustrated coin and hands so it works out of the box.
To use real photography, add these files here (they are picked up automatically; any
file that is missing falls back to the illustration, so you can add them one at a time):

| File              | What it is                                                                 |
|-------------------|----------------------------------------------------------------------------|
| `coin.png`        | The whole rupee coin, roughly square, transparent background. It is cut into six wedges in code, so the wedges can never misalign. |
| `hand-top.png`    | Hand + forearm cut-out on a **transparent** background, drawn **pointing right**, with the pinching fingertips at the **right-centre edge** of the image. |
| `hand-right.png`  | Same orientation as above (the scene rotates each hand toward the coin).    |
| `hand-bottom.png` | Same orientation as above.                                                  |

Recommended hand size: about 1240 x 600 px. If your cut-outs have a different size,
adjust `handBox` in `src/components/art/heroAssets.js`.

Optional font: put a licensed `PearlJean.woff2` in `public/fonts/` to use it for the
CreditWise wordmark (falls back to Fredoka otherwise).

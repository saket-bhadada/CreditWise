/**
 * Optional photographic assets for the hero and page headers.
 * Put files in frontend/public/assets/ with these names. Any file that is missing
 * is detected at runtime and replaced by the built-in illustrated fallback, so the
 * page never shows a broken image or a gray rectangle.
 *
 *  coin.png        Whole rupee coin, roughly square, ideally with a transparent background.
 *                  It is cut into six wedges in code (clip-paths), so no pre-sliced tiles
 *                  are needed and the wedges can never misalign.
 *  hand-top.png    Hand + forearm cut-out on a TRANSPARENT background, drawn pointing RIGHT
 *  hand-right.png  with the pinching fingertips at the right-centre edge of the image.
 *  hand-bottom.png (The scene rotates each one toward the coin.)
 *
 * If a hand photo needs a different size/offset, tune `handBox` below (stage units; the
 * coin has radius 186 and the stage is 600 x 540).
 */
export const HERO_ASSETS = {
  coin: "/assets/coin.png",
  hands: ["/assets/hand-top.png", "/assets/hand-right.png", "/assets/hand-bottom.png"],
  // Size of each hand image in stage units. The fingertip pinch point is the image's
  // right-centre. Adjust if your cut-outs are larger or smaller than this.
  handBox: { width: 620, height: 300 },
};

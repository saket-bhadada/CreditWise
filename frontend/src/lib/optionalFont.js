/**
 * Registers the optional, separately licensed "Pearl Jean" display font.
 * Put a licensed copy at frontend/public/fonts/PearlJean.woff2 to use it. If the file is
 * absent (or the server answers with index.html for the missing path) nothing is
 * registered and the CSS falls back to Fredoka, with no console errors.
 */
export async function registerOptionalFont({ family = "Pearl Jean", url = "/fonts/PearlJean.woff2" } = {}) {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || type.includes("text/html")) return false;
    const buf = await res.arrayBuffer();
    // wOF2 / wOFF / OTTO / 0x00010000: real font containers only
    const magic = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 4)));
    if (!["wOF2", "wOFF", "OTTO", "\u0000\u0001\u0000\u0000", "true"].includes(magic)) return false;
    const face = new FontFace(family, buf, { weight: "400 900" });
    await face.load();
    document.fonts.add(face);
    return true;
  } catch {
    return false;
  }
}

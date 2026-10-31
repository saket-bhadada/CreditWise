import React, { useId } from "react";
import { HERO_ASSETS } from "./heroAssets";
import { useAsset } from "./useAsset";

export const COIN_R = 186;

/** Polygon (user units, origin = coin centre) covering a 60° sector centred on `deg`. */
export function sectorPoints(deg, span = 60, radius = 210, steps = 10) {
  const a0 = ((deg - span / 2) * Math.PI) / 180;
  const a1 = ((deg + span / 2) * Math.PI) / 180;
  const pts = ["0,0"];
  for (let i = 0; i <= steps; i += 1) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push(`${(Math.cos(a) * radius).toFixed(2)},${(Math.sin(a) * radius).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** Shared SVG <defs> for the illustrated coin (ids are suffixed so several coins can coexist). */
export function CoinDefs({ uid }) {
  return (
    <defs>
      <radialGradient id={`${uid}-face`} cx="38%" cy="32%" r="85%">
        <stop offset="0" stopColor="#dcd9d0" />
        <stop offset="0.5" stopColor="#aeaa9f" />
        <stop offset="1" stopColor="#6b675e" />
      </radialGradient>
      <radialGradient id={`${uid}-rim`} cx="50%" cy="50%" r="50%">
        <stop offset="0.86" stopColor="#8d897f" stopOpacity="0" />
        <stop offset="1" stopColor="#36332d" stopOpacity="0.55" />
      </radialGradient>
      <filter id={`${uid}-grain`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.19  0 0 0 0 0.17  0 0 0 0.42 -0.08" result="g" />
        <feComposite in="g" in2="SourceAlpha" operator="in" result="gc" />
        <feBlend in="SourceGraphic" in2="gc" mode="multiply" />
      </filter>
      <filter id={`${uid}-emboss`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="-1.4" dy="-1.4" stdDeviation="0.6" floodColor="#f4f1e8" floodOpacity="0.85" result="a" />
        <feDropShadow dx="1.8" dy="2" stdDeviation="1" floodColor="#27241f" floodOpacity="0.55" />
      </filter>
      <path id={`${uid}-ring`} d="M -128,0 A 128,128 0 1,1 128,0 A 128,128 0 1,1 -128,0" fill="none" />
    </defs>
  );
}

/** Illustrated rupee coin face, centred on the origin, radius COIN_R. */
export function CoinFace({ uid }) {
  return (
    <g filter={`url(#${uid}-grain)`}>
      <circle r={COIN_R} fill={`url(#${uid}-face)`} />
      <circle r={COIN_R} fill={`url(#${uid}-rim)`} />
      <circle r={COIN_R - 1.5} fill="none" stroke="#4a463f" strokeWidth="3" />
      <circle r={COIN_R - 14} fill="none" stroke="#f1eee5" strokeOpacity="0.55" strokeWidth="2" />
      <circle r={COIN_R - 24} fill="none" stroke="#575349" strokeWidth="5" strokeDasharray="1.5 9.5" strokeLinecap="round" />
      <circle r={COIN_R - 42} fill="none" stroke="#4d4a43" strokeOpacity="0.7" strokeWidth="1.6" />
      <circle r={COIN_R - 100} fill="none" stroke="#4d4a43" strokeOpacity="0.5" strokeWidth="1.4" />
      <text
        fontFamily="Space Mono, monospace"
        fontWeight="700"
        fontSize="19"
        letterSpacing="5"
        fill="#46423a"
        filter={`url(#${uid}-emboss)`}
      >
        <textPath href={`#${uid}-ring`} startOffset="0">
          INDIA ★ BHARAT ★ INDIA ★ BHARAT ★
        </textPath>
      </text>
      {/* engraved rupee sign */}
      <g
        fill="none"
        stroke="#4a463f"
        strokeWidth="14"
        strokeLinejoin="round"
        strokeLinecap="butt"
        filter={`url(#${uid}-emboss)`}
        transform="translate(0 -4) scale(1.05)"
      >
        <path d="M-44,-54 H14 C58,-54 58,2 14,2 H-44" />
        <path d="M-50,-26 H54" />
        <path d="M-40,2 L20,66" />
      </g>
    </g>
  );
}

/**
 * The coin body used by wedges and the small page mark: the supplied photo when it
 * loads, otherwise the illustrated coin.
 */
export function CoinBody({ uid, photo }) {
  if (photo) {
    return (
      <image
        href={HERO_ASSETS.coin}
        x={-COIN_R}
        y={-COIN_R}
        width={COIN_R * 2}
        height={COIN_R * 2}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }
  return <CoinFace uid={uid} />;
}

/** Small, undistorted coin used in page headers (square box, object-fit: contain behaviour). */
export function CoinMark({ className = "" }) {
  const uid = useId().replace(/:/g, "");
  const photo = useAsset(HERO_ASSETS.coin);
  return (
    <div className={`coin-mark ${className}`} aria-hidden="true">
      {photo ? (
        <img src={HERO_ASSETS.coin} alt="" loading="lazy" decoding="async" />
      ) : (
        <svg viewBox="-196 -196 392 392" focusable="false">
          <CoinDefs uid={uid} />
          <g transform="rotate(-14)">
            <CoinFace uid={uid} />
          </g>
        </svg>
      )}
    </div>
  );
}

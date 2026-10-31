import React from "react";
import { HERO_ASSETS } from "./heroAssets";

/**
 * Illustrated hand fallback, drawn pointing +x with the pinching fingertips at the
 * origin. The body extends toward -x (the arm runs off-screen).
 */
function HandShapes({ uid }) {
  const stroke = "#1f1d1a";
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* sleeve + forearm */}
      <path d="M-700,-82 L-440,-70 L-440,112 L-700,126 Z" fill="#23221f" stroke={stroke} strokeWidth="2.5" />
      <path d="M-440,-70 L-250,-56 C-215,-54 -185,-46 -160,-34 L-160,70 C-190,84 -225,92 -265,94 L-440,106 Z" fill={`url(#${uid}-arm)`} stroke={stroke} strokeWidth="2.5" />
      {/* curled fingers peeking under the palm */}
      <circle cx="-52" cy="74" r="22" fill="#8a867d" stroke={stroke} strokeWidth="2.5" />
      <circle cx="-93" cy="84" r="21" fill="#7f7b73" stroke={stroke} strokeWidth="2.5" />
      <circle cx="-134" cy="86" r="19" fill="#767269" stroke={stroke} strokeWidth="2.5" />
      {/* back of hand */}
      <path d="M-200,-44 C-170,-84 -110,-98 -58,-84 C-30,-76 -18,-60 -22,-40 L-34,46 C-70,78 -130,88 -176,68 Z" fill={`url(#${uid}-palm)`} stroke={stroke} strokeWidth="2.5" />
      {/* thumb (under) and index (over) meeting at the pinch */}
      <path d="M-128,46 C-92,58 -44,46 -6,14" fill="none" stroke={stroke} strokeWidth="42" />
      <path d="M-128,46 C-92,58 -44,46 -6,14" fill="none" stroke={`url(#${uid}-finger)`} strokeWidth="37" />
      <path d="M-96,-62 C-60,-68 -26,-48 -8,-16" fill="none" stroke={stroke} strokeWidth="40" />
      <path d="M-96,-62 C-60,-68 -26,-48 -8,-16" fill="none" stroke={`url(#${uid}-finger)`} strokeWidth="35" />
      {/* knuckle highlight + creases */}
      <ellipse cx="-88" cy="-78" rx="26" ry="9" fill="#fff" opacity="0.2" transform="rotate(-8 -88 -78)" />
      <path d="M-150,-10 C-138,-4 -128,4 -124,16" fill="none" stroke="#5e5a52" strokeWidth="2" opacity="0.55" />
      <path d="M-196,6 C-182,10 -170,18 -164,30" fill="none" stroke="#5e5a52" strokeWidth="2" opacity="0.5" />
    </g>
  );
}

export function HandDefs({ uid }) {
  return (
    <defs>
      <linearGradient id={`${uid}-arm`} x1="0" y1="-60" x2="0" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#c6c2b9" />
        <stop offset="1" stopColor="#7c786f" />
      </linearGradient>
      <linearGradient id={`${uid}-palm`} x1="-120" y1="-96" x2="-60" y2="80" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#d3cfc6" />
        <stop offset="1" stopColor="#8f8b82" />
      </linearGradient>
      <linearGradient id={`${uid}-finger`} x1="0" y1="-70" x2="0" y2="50" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#d8d4cb" />
        <stop offset="1" stopColor="#9a968d" />
      </linearGradient>
      {/* torn orange-red paper silhouette that sits offset behind each hand */}
      <filter id={`${uid}-rust`} x="-10%" y="-20%" width="120%" height="140%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="fat" />
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="4" result="t" />
        <feDisplacementMap in="fat" in2="t" scale="16" xChannelSelector="R" yChannelSelector="G" result="torn" />
        <feFlood floodColor="#c4532f" result="c" />
        <feComposite in="c" in2="torn" operator="in" />
      </filter>
      {/* photographic grain + soft contact shadow */}
      <filter id={`${uid}-photo`} x="-5%" y="-10%" width="110%" height="125%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.15  0 0 0 0 0.14  0 0 0 0 0.12  0 0 0 0.5 -0.1" result="g" />
        <feComposite in="g" in2="SourceAlpha" operator="in" result="gc" />
        <feBlend in="SourceGraphic" in2="gc" mode="multiply" result="tex" />
        <feDropShadow in="tex" dx="2" dy="5" stdDeviation="5" floodColor="#2c2519" floodOpacity="0.35" />
      </filter>
    </defs>
  );
}

/**
 * One hand, positioned so its pinch point lands on `pinch` (stage units) and pointing
 * toward the coin centre. `photo` is the URL of a supplied hand cut-out, or null.
 */
export function Hand({ uid, pinch, towardDeg, photo }) {
  const box = HERO_ASSETS.handBox;
  return (
    <g transform={`translate(${pinch.x.toFixed(2)} ${pinch.y.toFixed(2)}) rotate(${towardDeg})`}>
      {photo ? (
        <image
          href={photo}
          x={-box.width}
          y={-box.height / 2}
          width={box.width}
          height={box.height}
          preserveAspectRatio="xMaxYMid meet"
          style={{ filter: "drop-shadow(2px 5px 5px rgba(44,37,25,.35))" }}
        />
      ) : (
        <>
          <g transform="translate(9 12)" filter={`url(#${uid}-rust)`}>
            <HandShapes uid={uid} />
          </g>
          <g filter={`url(#${uid}-photo)`}>
            <HandShapes uid={uid} />
          </g>
        </>
      )}
    </g>
  );
}

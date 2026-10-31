import React, { useId } from "react";
import { CoinBody, CoinDefs, COIN_R, sectorPoints } from "./Coin";
import { Hand, HandDefs } from "./Hand";
import { HERO_ASSETS } from "./heroAssets";
import { useAsset, useAssets } from "./useAsset";

/** Wedge centre angles (SVG degrees, clockwise from +x). Even indices are carried by a hand. */
const CENTERS = [-120, -60, 0, 60, 120, 180];
const CARRIER_WEDGES = [0, 2, 4]; // three hands, 120° apart
const GAP = 5; // final visible gap between wedges (stage units)
const START_DISTANCE = 230; // how far outside a carrier starts
const PINCH_RADIUS = 166;

const rad = (d) => (d * Math.PI) / 180;
const unit = (deg) => ({ x: Math.cos(rad(deg)), y: Math.sin(rad(deg)) });

/**
 * The hero scene: a rupee coin cut into six wedges. Three wedges are carried in by hands
 * (hand and wedge share ONE animated group, so they cannot drift apart); the other three
 * assemble first. After the carriers arrive the whole assembly gets a short settling
 * tremor, then the hand-drawn accents draw in. All motion is CSS (see home.css) and is
 * disabled under prefers-reduced-motion.
 */
export default function AssemblyStage({ runId, onReplay }) {
  const uid = useId().replace(/:/g, "");
  const coinPhoto = useAsset(HERO_ASSETS.coin);
  const handPhotos = useAssets(HERO_ASSETS.hands);

  const wedge = (idx) => {
    const u = unit(CENTERS[idx]);
    return (
      <g transform={`translate(${(u.x * GAP).toFixed(2)} ${(u.y * GAP).toFixed(2)})`}>
        <g filter={`url(#${uid}-cut)`}>
          <g clipPath={`url(#${uid}-w${idx})`}>
            <CoinBody uid={uid} photo={coinPhoto === true} />
          </g>
        </g>
      </g>
    );
  };

  return (
    <svg
      className="assembly"
      viewBox="-300 -270 600 540"
      role="img"
      aria-label="A rupee coin being assembled from six segments by three hands"
      focusable="false"
    >
      <defs>
        {CENTERS.map((c, i) => (
          <clipPath id={`${uid}-w${i}`} key={i}>
            <polygon points={sectorPoints(c)} />
          </clipPath>
        ))}
        {/* slightly rough, hand-cut edge on every wedge */}
        <filter id={`${uid}-cut`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="11" result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <CoinDefs uid={uid} />
      <HandDefs uid={uid} />

      <g key={runId} className="assembly-run">
        <g className="assembly-core">
          {/* wedges that are already on the table: assemble first */}
          {CENTERS.map((c, i) => {
            if (CARRIER_WEDGES.includes(i)) return null;
            const u = unit(c);
            return (
              <g
                key={`s${i}`}
                className="wedge-static"
                style={{ "--ox": `${(u.x * 46).toFixed(1)}px`, "--oy": `${(u.y * 46).toFixed(1)}px`, "--i": i }}
              >
                {wedge(i)}
              </g>
            );
          })}

          {/* hand + wedge travel as one unit */}
          {CARRIER_WEDGES.map((idx, n) => {
            const c = CENTERS[idx];
            const u = unit(c);
            const pinch = { x: u.x * PINCH_RADIUS, y: u.y * PINCH_RADIUS };
            const tilt = [-5, 4, -4][n];
            return (
              <g
                key={`c${idx}`}
                className="carrier"
                style={{
                  "--sx": `${(u.x * START_DISTANCE).toFixed(1)}px`,
                  "--sy": `${(u.y * START_DISTANCE).toFixed(1)}px`,
                  "--tilt": `${tilt}deg`,
                  "--n": n,
                }}
              >
                {wedge(idx)}
                <Hand uid={uid} pinch={pinch} towardDeg={c + 180} photo={handPhotos[n] === true ? HERO_ASSETS.hands[n] : null} />
              </g>
            );
          })}
        </g>

        {/* hand-drawn accents, drawn after everything has settled */}
        <g className="accent sparks" fill="none" stroke="#181716" strokeWidth="4.5" strokeLinecap="round">
          <path d="M196,-212 L212,-250" pathLength="1" />
          <path d="M218,-200 L256,-226" pathLength="1" />
          <path d="M226,-178 L270,-188" pathLength="1" />
        </g>
        <g className="accent arrow" fill="none" stroke="#bd4b2a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path className="arrow-shaft" d="M268,226 C252,208 236,198 226,172" pathLength="1" />
          <path className="arrow-head" d="M246,180 L226,172 L226,196" />
          <path className="arrow-curl" d="M268,226 C284,242 306,230 292,216 C280,206 264,224 286,238" />
        </g>
      </g>

      {/* click / keyboard target to replay the assembly */}
      <circle
        r={COIN_R}
        fill="transparent"
        style={{ cursor: "pointer" }}
        tabIndex={0}
        role="button"
        aria-label="Replay the coin assembly animation"
        onClick={onReplay}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onReplay();
          }
        }}
      />
    </svg>
  );
}

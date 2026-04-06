const TARGET_SIZE = 64;
const EDGE_RATIO = 0.1;
const MIN_ALPHA = 128;
const MIN_SATURATION_STRICT = 0.18;
const MIN_SATURATION_FALLBACK = 0.08;
const MIN_LIGHTNESS_STRICT = 0.12;
const MAX_LIGHTNESS_STRICT = 0.92;
const MIN_LIGHTNESS_FALLBACK = 0.08;
const MAX_LIGHTNESS_FALLBACK = 0.96;
const QUANTIZATION_STEP = 32;

/*
  Réglages par défaut pour l'affichage de la couleur dans le front.
  Change ces deux valeurs pour tuner rapidement le rendu de .deposit_song.
*/
export const DEPOSIT_ACCENT_LIGHTNESS_DELTA = 0.2;
export const DEPOSIT_ACCENT_SATURATION_DELTA = -0.15;

/*
  Réglages de sélection de la couleur extraite.
  Ici on privilégie fortement la saturation.
  COUNT et LIGHTNESS servent seulement à départager des couleurs proches.
*/
const SATURATION_SCORE_WEIGHT = 1000;
const COUNT_SCORE_WEIGHT = 14;
const LIGHTNESS_SCORE_WEIGHT = 8;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampByte(value) {
  return clamp(Math.round(value || 0), 0, 255);
}

function toHex(value) {
  return clampByte(value).toString(16).padStart(2, "0");
}

export function rgbToHex(r, g, b) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hexToRgb(hex) {
  const value = String(hex || "").replace("#", "").trim();

  if (value.length !== 6) return null;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  if ([r, g, b].some(Number.isNaN)) return null;

  return { r, g, b };
}

export function rgbToHsl(r, g, b) {
  const rn = clampByte(r) / 255;
  const gn = clampByte(g) / 255;
  const bn = clampByte(b) / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;

  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }

  h /= 6;

  return { h, s, l };
}

export function hslToRgb(h, s, l) {
  const hh = ((h % 1) + 1) % 1;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);

  if (ss === 0) {
    const gray = ll * 255;
    return { r: gray, g: gray, b: gray };
  }

  const hueToRgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;

  return {
    r: hueToRgb(p, q, hh + 1 / 3) * 255,
    g: hueToRgb(p, q, hh) * 255,
    b: hueToRgb(p, q, hh - 1 / 3) * 255,
  };
}

export function adjustHexColor(
  hex,
  { lightness = 0, saturation = 0 } = {}
) {
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const nextRgb = hslToRgb(
    hsl.h,
    clamp(hsl.s + saturation, 0, 1),
    clamp(hsl.l + lightness, 0, 1)
  );

  return rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b);
}

/*
  Handler principal pour le rendu front des accents.
*/
export function getDepositAccentColor(
  hex,
  {
    lightness = DEPOSIT_ACCENT_LIGHTNESS_DELTA,
    saturation = DEPOSIT_ACCENT_SATURATION_DELTA,
  } = {}
) {
  if (!hex) return undefined;

  return adjustHexColor(hex, {
    lightness,
    saturation,
  });
}

function isPixelEligible(r, g, b, a, mode) {
  if (a < MIN_ALPHA) return false;

  const { s, l } = rgbToHsl(r, g, b);

  if (mode === "strict") {
    return (
      s >= MIN_SATURATION_STRICT &&
      l >= MIN_LIGHTNESS_STRICT &&
      l <= MAX_LIGHTNESS_STRICT
    );
  }

  return (
    s >= MIN_SATURATION_FALLBACK &&
    l >= MIN_LIGHTNESS_FALLBACK &&
    l <= MAX_LIGHTNESS_FALLBACK
  );
}

function quantizeChannel(value) {
  const quantized =
    Math.floor(clampByte(value) / QUANTIZATION_STEP) * QUANTIZATION_STEP;
  const centered = quantized + QUANTIZATION_STEP / 2;
  return clampByte(centered);
}

function makeBucketKey(r, g, b) {
  return `${quantizeChannel(r)}|${quantizeChannel(g)}|${quantizeChannel(b)}`;
}

/*
  Nouvelle logique :
  - saturation très prioritaire
  - nombre de pixels en bonus léger
  - légère préférence pour une luminosité exploitable
*/
function scoreBucket(bucket) {
  const avgR = bucket.rSum / bucket.count;
  const avgG = bucket.gSum / bucket.count;
  const avgB = bucket.bSum / bucket.count;
  const { s, l } = rgbToHsl(avgR, avgG, avgB);

  const saturationScore = s * SATURATION_SCORE_WEIGHT;
  const countScore = Math.log2(bucket.count + 1) * COUNT_SCORE_WEIGHT;
  const lightnessScore =
    (1 - Math.abs(l - 0.5) * 2) * LIGHTNESS_SCORE_WEIGHT;

  return saturationScore + countScore + lightnessScore;
}

function pickAccentColor(imageData, width, height, mode) {
  const buckets = new Map();
  const edgeX = Math.floor(width * EDGE_RATIO);
  const edgeY = Math.floor(height * EDGE_RATIO);

  for (let y = edgeY; y < height - edgeY; y += 1) {
    for (let x = edgeX; x < width - edgeX; x += 1) {
      const index = (y * width + x) * 4;
      const r = imageData[index];
      const g = imageData[index + 1];
      const b = imageData[index + 2];
      const a = imageData[index + 3];

      if (!isPixelEligible(r, g, b, a, mode)) continue;

      const key = makeBucketKey(r, g, b);
      const current = buckets.get(key) || {
        count: 0,
        rSum: 0,
        gSum: 0,
        bSum: 0,
      };

      current.count += 1;
      current.rSum += r;
      current.gSum += g;
      current.bSum += b;
      buckets.set(key, current);
    }
  }

  let best = null;
  let bestScore = -1;

  for (const bucket of buckets.values()) {
    const score = scoreBucket(bucket);
    if (score > bestScore) {
      best = bucket;
      bestScore = score;
    }
  }

  if (!best || best.count <= 0) return null;

  return rgbToHex(
    best.rSum / best.count,
    best.gSum / best.count,
    best.bSum / best.count
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    img.src = src;
  });
}

export async function extractAccentColorFromImageUrl(imageUrl) {
  if (!imageUrl) return null;

  try {
    const img = await loadImage(imageUrl);

    const canvas = document.createElement("canvas");
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, TARGET_SIZE, TARGET_SIZE);

    const { data } = ctx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE);

    return (
      pickAccentColor(data, TARGET_SIZE, TARGET_SIZE, "strict") ||
      pickAccentColor(data, TARGET_SIZE, TARGET_SIZE, "fallback") ||
      null
    );
  } catch {
    return null;
  }
}

export default extractAccentColorFromImageUrl;

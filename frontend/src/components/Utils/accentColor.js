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

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value || 0)));
}

function toHex(value) {
  return clampByte(value).toString(16).padStart(2, "0");
}

function rgbToHex(r, g, b) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsl(r, g, b) {
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
  const quantized = Math.floor(clampByte(value) / QUANTIZATION_STEP) * QUANTIZATION_STEP;
  const centered = quantized + QUANTIZATION_STEP / 2;
  return clampByte(centered);
}

function makeBucketKey(r, g, b) {
  return `${quantizeChannel(r)}|${quantizeChannel(g)}|${quantizeChannel(b)}`;
}

function scoreBucket(bucket) {
  const avgR = bucket.rSum / bucket.count;
  const avgG = bucket.gSum / bucket.count;
  const avgB = bucket.bSum / bucket.count;
  const { s, l } = rgbToHsl(avgR, avgG, avgB);

  return bucket.count * (1 + s * 1.5) * (1 - Math.abs(l - 0.5) * 0.7);
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
      const current = buckets.get(key) || { count: 0, rSum: 0, gSum: 0, bSum: 0 };
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

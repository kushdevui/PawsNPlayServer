import { AppError } from '../../utils/AppError.js';
import type { WaiverSignature } from './waivers.model.js';

export const SIGN_MESSAGE = 'Please sign in the box.';
const MIN_SIZE = 100;
const MAX_SIZE = 2000;
const MAX_STROKES = 100;
const MIN_POINTS = 10;
const MAX_POINTS = 5000;
/** The drawing must span at least this many pixels (width + height of its bounding box). */
const MIN_EXTENT = 20;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Validates a drawn signature (spec: 1..100 strokes, 10..5000 points, finite numbers inside the box,
 * box 100..2000 px) and returns a normalised copy (coordinates rounded to 0.1 px). Any problem -> 422.
 */
export function parseSignature(raw: unknown): WaiverSignature {
  const fail = () => AppError.validation(SIGN_MESSAGE);
  if (!raw || typeof raw !== 'object') throw fail();
  const { width, height, strokes } = raw as { width?: unknown; height?: unknown; strokes?: unknown };
  if (!isNum(width) || !isNum(height) || width < MIN_SIZE || height < MIN_SIZE || width > MAX_SIZE || height > MAX_SIZE) {
    throw fail();
  }
  if (!Array.isArray(strokes) || strokes.length < 1 || strokes.length > MAX_STROKES) throw fail();

  let total = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const clean: number[][][] = [];
  for (const stroke of strokes) {
    if (!Array.isArray(stroke) || stroke.length === 0) throw fail();
    const points: number[][] = [];
    for (const point of stroke) {
      if (!Array.isArray(point) || point.length !== 2) throw fail();
      const [x, y] = point as unknown[];
      if (!isNum(x) || !isNum(y) || x < 0 || y < 0 || x > width || y > height) throw fail();
      total += 1;
      if (total > MAX_POINTS) throw fail();
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      points.push([round1(x), round1(y)]);
    }
    clean.push(points);
  }
  if (total < MIN_POINTS || maxX - minX + (maxY - minY) < MIN_EXTENT) throw fail();
  return { width: round1(width), height: round1(height), strokes: clean };
}

/** Self-contained SVG of the signature (black strokes, viewBox = the drawing box). Numbers only - no user text. */
export function signatureToSvg({ width, height, strokes }: WaiverSignature): string {
  const paths = strokes
    .map((stroke) => {
      const [first, ...rest] = stroke as [number[], ...number[][]];
      const start = `M${first[0]} ${first[1]}`;
      // A single tap becomes a tiny line so it is visible as a dot.
      if (rest.length === 0) return `${start} l0.1 0`;
      return `${start} ${rest.map((p) => `L${p[0]} ${p[1]}`).join(' ')}`;
    })
    .join(' ');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    `<path d="${paths}" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

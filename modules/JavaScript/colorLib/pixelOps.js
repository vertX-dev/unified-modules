/**
 * pixelOps.js — pure pixel operations for pixel displays (colorLib part `display`).
 *     import { downsample, mergeSquares, countGlyphs } from "./unified/colorLib/pixelOps.js"
 *
 * No imports and no Minecraft APIs — usable in a pack, in Node and on the web
 * (e.g. to preview how many glyphs an image costs before placing it).
 *
 * Image model: { w, h, palette: [0xRRGGBB…], idx: number[] } — row-major, top
 * row first, idx -1 = empty pixel.
 */

// Box-downsample so the longest side is ≤ maxSide (render budget: one shape
// per pixel). A cell is empty when most of it is empty, otherwise the mean of
// its non-empty pixels. Returns { w, h, colors: ({r,g,b}|null)[], factor } — factor = source pixels per output pixel.
export function downsample(img, maxSide) {
    const f = Math.max(1, Math.ceil(Math.max(img.w, img.h) / maxSide));
    const w = Math.ceil(img.w / f);
    const h = Math.ceil(img.h / f);
    const colors = new Array(w * h);
    for (let cy = 0; cy < h; cy++) {
        for (let cx = 0; cx < w; cx++) {
            let r = 0;
            let g = 0;
            let b = 0;
            let n = 0;
            let cells = 0;
            for (let y = cy * f; y < Math.min(img.h, (cy + 1) * f); y++) {
                for (let x = cx * f; x < Math.min(img.w, (cx + 1) * f); x++) {
                    cells++;
                    const p = img.idx[y * img.w + x];
                    if (p < 0) continue;
                    const c = img.palette[p];
                    r += (c >> 16) & 255;
                    g += (c >> 8) & 255;
                    b += c & 255;
                    n++;
                }
            }
            colors[cy * w + cx] = n * 2 >= cells ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) } : null;
        }
    }
    return { w, h, colors, factor: f };
}

// A glyph scales uniformly, so one shape can cover any k×k square of one
// colour (same glyph, centred on the square, k× the scale). Greedy, largest
// squares first: dp[y][x] = biggest same-colour square with its top-left at
// (x, y); cells are taken in descending dp order, shrinking a square that
// would overlap one already placed. Every pixel ends up covered exactly once.
//   colorAt(x, y) -> colour | null   key(colour) -> comparable value
//   maxK          largest square side allowed
// Returns [{ x, y, k, c }] (x, y = top-left pixel).
export function mergeSquares(width, height, colorAt, { maxK = 16, key = (c) => JSON.stringify(c) } = {}) {
    const n = width * height;
    const cols = new Array(n);
    const keys = new Array(n);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const c = colorAt(x, y);
            cols[y * width + x] = c;
            keys[y * width + x] = c ? key(c) : null;
        }
    }
    const dp = new Uint16Array(n);
    for (let y = height - 1; y >= 0; y--) {
        for (let x = width - 1; x >= 0; x--) {
            const i = y * width + x;
            if (keys[i] === null) continue;
            if (x + 1 < width && y + 1 < height) {
                const k = keys[i];
                if (keys[i + 1] === k && keys[i + width] === k && keys[i + width + 1] === k) {
                    dp[i] = 1 + Math.min(dp[i + 1], dp[i + width], dp[i + width + 1]);
                    continue;
                }
            }
            dp[i] = 1;
        }
    }
    const order = [];
    for (let i = 0; i < n; i++) if (dp[i]) order.push(i);
    order.sort((a, b) => dp[b] - dp[a] || a - b);

    const taken = new Uint8Array(n);
    const out = [];
    const free = (x, y, k) => {
        for (let yy = y; yy < y + k; yy++) for (let xx = x; xx < x + k; xx++) if (taken[yy * width + xx]) return false;
        return true;
    };
    for (const i of order) {
        if (taken[i]) continue;
        const x = i % width;
        const y = (i - x) / width;
        let k = Math.min(dp[i], Math.max(1, maxK));
        while (k > 1 && !free(x, y, k)) k--;
        for (let yy = y; yy < y + k; yy++) for (let xx = x; xx < x + k; xx++) taken[yy * width + xx] = 1;
        out.push({ x, y, k, c: cols[i] });
    }
    return out;
}

// How many shapes a display of this grid costs: every non-empty pixel, or the
// merged squares. colorAt(x, y) -> colour | null. Use it to enforce a glyph
// budget before spawning anything.
export function countGlyphs(width, height, colorAt, { merge = false, maxK = 64, key } = {}) {
    if (merge) return mergeSquares(width, height, colorAt, { maxK, ...(key ? { key } : {}) }).length;
    let n = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (colorAt(x, y)) n++;
    return n;
}

// Largest number of shapes one image display may spawn — a glyph budget, not
// a resolution limit: a 256×256 image that merges into few squares is fine.
export const MAX_GLYPHS = 5000;

// Largest merged square side when nothing else caps it.
export const MERGE_UNCAPPED = 64;

// Colour key for {r,g,b} pixels (downsample output) — merge only exact matches.
export const rgbKey = (c) => (c.r << 16) | (c.g << 8) | c.b;

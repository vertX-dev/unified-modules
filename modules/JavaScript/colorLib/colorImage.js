/**
 * colorImage.js — images to blocks: mapart and block art. Re-exported by colorLib.js.
 *
 * Pixels can be a flat array (RGBA, or RGB when its length is width × height × 3; override with
 * `channels`), or one entry per pixel as { r, g, b, a? } or [r, g, b, a?]. Rows go top to bottom
 * (north to south for mapart). Pixels with alpha < 128 stay empty (null).
 *
 * Big images can stall a tick. The *Job variants return { job, done }: hand `job` to
 * system.runJob and await `done` for the result. They work one image row per step.
 */
import { createMatcher } from './colorLib.js';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const DITHERS = ['none', 'floyd-steinberg', 'ordered'];

function pixelReader(pixels, width, height, channels) {
    if (!(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0)) {
        throw new RangeError(`colorLib: bad image size ${width}×${height}`);
    }
    const count = width * height;
    if (typeof pixels[0] === 'object') {
        if (pixels.length !== count) throw new RangeError(`colorLib: expected ${count} pixels, got ${pixels.length}`);
        return (i) => {
            const p = pixels[i];
            return Array.isArray(p) ? [p[0], p[1], p[2], p[3] ?? 255] : [p.r, p.g, p.b, p.a ?? 255];
        };
    }
    const ch = channels ?? (pixels.length === count * 3 ? 3 : 4);
    if (pixels.length !== count * ch) throw new RangeError(`colorLib: expected ${count * ch} values (${ch} per pixel), got ${pixels.length}`);
    return (i) => [pixels[i * ch], pixels[i * ch + 1], pixels[i * ch + 2], ch === 4 ? pixels[i * ch + 3] : 255];
}

// Runs `match` over every pixel with optional dithering, calling onPixel(index, hit) and yielding
// after each row. `hit.rgb` is the color the chosen block actually shows.
function* quantize(pixels, width, height, { dither = 'none', channels, spread = 48 }, match, onPixel) {
    if (!DITHERS.includes(dither)) throw new RangeError(`colorLib: dither must be one of ${DITHERS.join(', ')}, got "${dither}"`);
    const read = pixelReader(pixels, width, height, channels);
    const fs = dither === 'floyd-steinberg';
    let cur = fs ? new Float32Array((width + 2) * 3) : null; // error for this row, offset by one pixel
    let next = fs ? new Float32Array((width + 2) * 3) : null;
    const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const [r, g, b, a] = read(i);
            if (a < 128) {
                onPixel(i, null);
                continue;
            }
            const want = [r, g, b];
            if (fs) for (let c = 0; c < 3; c++) want[c] += cur[(x + 1) * 3 + c];
            else if (dither === 'ordered') {
                const t = ((BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * spread;
                for (let c = 0; c < 3; c++) want[c] += t;
            }
            const hit = match({ r: clamp(want[0]), g: clamp(want[1]), b: clamp(want[2]) });
            onPixel(i, hit);
            if (fs && hit) {
                const got = [hit.rgb.r, hit.rgb.g, hit.rgb.b];
                for (let c = 0; c < 3; c++) {
                    const err = clamp(want[c]) - got[c];
                    cur[(x + 2) * 3 + c] += (err * 7) / 16;
                    next[x * 3 + c] += (err * 3) / 16;
                    next[(x + 1) * 3 + c] += (err * 5) / 16;
                    next[(x + 2) * 3 + c] += err / 16;
                }
            }
        }
        if (fs) {
            [cur, next] = [next, cur];
            next.fill(0);
        }
        yield;
    }
}

// Heights for a staircase mapart from each pixel's shade. A block is shaded by comparing it to the
// block north of it: lower → shade 0, same → 1, higher → 2. Each column starts from a support row
// just north of the image (z = -1); heights are shifted so each column's lowest block is at 0.
function staircase(width, height, shades) {
    const heights = new Array(width * height).fill(null);
    const north = new Array(width).fill(0);
    for (let x = 0; x < width; x++) {
        let prev = 0;
        let min = 0;
        for (let z = 0; z < height; z++) {
            const s = shades[z * width + x];
            if (s < 0) continue;
            prev += s === 0 ? -1 : s === 2 ? 1 : 0;
            heights[z * width + x] = prev;
            if (prev < min) min = prev;
        }
        north[x] = -min;
        for (let z = 0; z < height; z++) if (heights[z * width + x] !== null) heights[z * width + x] -= min;
    }
    return { heights, northHeights: north };
}

function* mapartGen(pixels, width, height, opts = {}) {
    const { palette = 'mapart', shades = 'flat', penalty } = opts;
    if (shades !== 'flat' && shades !== 'staircase') throw new RangeError(`colorLib: mapart shades must be "flat" or "staircase", got "${shades}"`);
    const match = createMatcher({ palette, mode: 'map', shades, penalty });
    const n = width * height;
    const ids = new Array(n).fill(null);
    const colors = new Array(n).fill(null);
    const shadeOf = new Array(n).fill(-1);
    yield* quantize(pixels, width, height, opts, match, (i, hit) => {
        if (!hit) return;
        ids[i] = 'minecraft:' + hit.id;
        colors[i] = { ...hit.rgb };
        shadeOf[i] = hit.shade;
    });
    const result = { width, height, ids, colors, shades: shadeOf };
    return shades === 'staircase' ? { ...result, ...staircase(width, height, shadeOf) } : result;
}

function* blockArtGen(pixels, width, height, opts = {}) {
    const { palette = 'solid_survival', face = 'side', penalty } = opts;
    const match = createMatcher({ palette, mode: 'texture', face, penalty });
    const n = width * height;
    const ids = new Array(n).fill(null);
    const colors = new Array(n).fill(null);
    yield* quantize(pixels, width, height, opts, match, (i, hit) => {
        if (!hit) return;
        ids[i] = 'minecraft:' + hit.id;
        colors[i] = { ...hit.rgb };
    });
    return { width, height, ids, colors };
}

function drain(gen) {
    let step;
    while (!(step = gen.next()).done);
    return step.value;
}

function asJob(gen) {
    let resolve, reject;
    const done = new Promise((res, rej) => ([resolve, reject] = [res, rej]));
    function* job() {
        try {
            let step = gen.next();
            while (!step.done) {
                yield;
                step = gen.next();
            }
            resolve(step.value);
        } catch (e) {
            reject(e);
        }
    }
    return { job: job(), done };
}

/**
 * Image → mapart. Picks a block and shade per pixel so a filled map shows the image.
 *   { palette  = "mapart" (survival-placeable blocks drawn on maps; see palette())
 *     shades   = "flat" (one height, shade 1) | "staircase" (3 shades via heights)
 *     dither   = "none" | "floyd-steinberg" | "ordered"
 *     channels, penalty }
 * Returns { width, height, ids, colors, shades }, row-major; `colors` is what the map shows and
 * `shades` the shade index per pixel (-1 = empty). Staircase adds `heights` (per block, lowest 0)
 * and `northHeights` (the support row to build just north of the image, per column).
 * Water depth shading isn't modelled; the default palette excludes liquids.
 */
export function mapartFromImage(pixels, width, height, opts) {
    return drain(mapartGen(pixels, width, height, opts));
}

/** mapartFromImage for system.runJob: returns { job, done }, where `done` resolves to the result. */
export function mapartJob(pixels, width, height, opts) {
    return asJob(mapartGen(pixels, width, height, opts));
}

/**
 * Image → block art (a wall or floor), matching texture colors.
 *   { palette = "solid_survival", face = "side" (walls) | "top" (floors) | "avg",
 *     dither = "none" | "floyd-steinberg" | "ordered", channels, penalty }
 * Returns { width, height, ids, colors }, row-major (top row first).
 */
export function blockArt(pixels, width, height, opts) {
    return drain(blockArtGen(pixels, width, height, opts));
}

/** blockArt for system.runJob: returns { job, done }, where `done` resolves to the result. */
export function blockArtJob(pixels, width, height, opts) {
    return asJob(blockArtGen(pixels, width, height, opts));
}

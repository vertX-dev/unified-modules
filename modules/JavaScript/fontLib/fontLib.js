/**
 * fontLib.js — pixel fonts for building text in the world. No @minecraft/* imports: pure layout
 * math, so it also runs in Node.
 *     import * as fontLib from "./unified/fontLib/fontLib.js"
 *     import block from "./unified/fontLib/fonts/block.js"
 *
 * A font is generated data (see tools/fontLib): { name, height, baseline, spacing, lineSpacing,
 * caseFold, fallback, spaceWidth, encoding, glyphs }. Glyphs are keyed by character (any Unicode
 * code point) and are `height` rows of equal width, top row first, "#" = ink. Fonts with
 * `encoding: "bits"` store glyphs packed as "width,hex" strings; they're decoded on first use.
 *
 * Functions take a font object or the name of a registered one. Layout options (all optional):
 *   spacing      px between glyphs (default: the font's)
 *   lineSpacing  px between lines (default: the font's)
 *   align        "left" | "center" | "right" for multi-line text
 *   monospace    true (widest glyph) or a width: fixed advance, glyphs centered in it
 *   vertical     one character per line (a column of letters)
 *   caseFold     "upper" | "lower" | null: try the other case when a glyph is missing
 *   onMissing    "fallback" (the font's fallback glyph, default) | "skip" | "throw"
 */

const registry = new Map();

/** Register a font so functions accept its name. Returns the font. */
export function registerFont(font) {
    if (!font || typeof font.name !== 'string' || !font.glyphs || !(font.height > 0)) {
        throw new TypeError('fontLib: not a font (needs name, height and glyphs)');
    }
    registry.set(font.name, font);
    return font;
}

/** Names of the registered fonts. */
export const listFonts = () => [...registry.keys()];

/** A font object from a font or a registered name. */
export function getFont(font) {
    if (typeof font !== 'string') return font;
    const found = registry.get(font);
    if (!found) throw new RangeError(`fontLib: unknown font "${font}" (registered: ${listFonts().join(', ') || 'none'})`);
    return found;
}

// ---------- glyphs ----------

const decodedCache = new WeakMap(); // font → Map(char → rows) for "bits" fonts

function decodeBits(font, height, packed) {
    const [w, hex] = packed.split(',');
    const width = Number(w);
    const rows = [];
    for (let y = 0; y < height; y++) {
        let row = '';
        for (let x = 0; x < width; x++) {
            const bit = y * width + x;
            const nibble = parseInt(hex[bit >> 2] ?? '0', 16);
            row += (nibble >> (3 - (bit & 3))) & 1 ? '#' : ' ';
        }
        rows.push(row);
    }
    return rows;
}

function rawGlyph(font, ch) {
    const g = font.glyphs[ch];
    if (g === undefined) return null;
    if (Array.isArray(g)) return g;
    let cache = decodedCache.get(font);
    if (!cache) decodedCache.set(font, (cache = new Map()));
    let rows = cache.get(ch);
    if (!rows) cache.set(ch, (rows = decodeBits(font, font.height, g)));
    return rows;
}

function blank(font) {
    const w = font.spaceWidth ?? Math.max(1, Math.round(font.height / 2));
    return new Array(font.height).fill(' '.repeat(w));
}

/**
 * Glyph rows for one character, after case folding; a space falls back to a blank of `spaceWidth`.
 * Returns null when the font has no glyph (the layout functions then apply `onMissing`).
 */
export function getGlyph(font, ch, { caseFold } = {}) {
    font = getFont(font);
    const fold = caseFold === undefined ? font.caseFold : caseFold;
    let rows = rawGlyph(font, ch);
    if (!rows && fold === 'upper') rows = rawGlyph(font, ch.toUpperCase());
    if (!rows && fold === 'lower') rows = rawGlyph(font, ch.toLowerCase());
    if (!rows && ch === ' ') rows = blank(font);
    return rows;
}

/** Characters of `text` the font can't draw (after case folding), each listed once. */
export function missingChars(text, font, opts = {}) {
    font = getFont(font);
    const missing = new Set();
    for (const ch of text) if (ch !== '\n' && !getGlyph(font, ch, opts)) missing.add(ch);
    return [...missing];
}

/** Whether every character of `text` can be drawn without the fallback glyph. */
export const canRender = (text, font, opts) => missingChars(text, font, opts).length === 0;

/** Every character the font has, in code point order. */
export function charset(font) {
    return Object.keys(getFont(font).glyphs).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}

// ---------- layout ----------

function layout(text, font, opts = {}) {
    font = getFont(font);
    const { align = 'left', vertical = false, onMissing = 'fallback' } = opts;
    const spacing = opts.spacing ?? font.spacing ?? 1;
    const lineSpacing = opts.lineSpacing ?? font.lineSpacing ?? 1;
    if (!['left', 'center', 'right'].includes(align)) throw new RangeError(`fontLib: align must be left, center or right, got "${align}"`);
    if (!['fallback', 'skip', 'throw'].includes(onMissing)) throw new RangeError(`fontLib: onMissing must be fallback, skip or throw, got "${onMissing}"`);

    const resolve = (ch) => {
        const rows = getGlyph(font, ch, opts);
        if (rows) return rows;
        if (onMissing === 'throw') throw new RangeError(`fontLib: font "${font.name}" has no glyph for "${ch}" (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`);
        if (onMissing === 'skip') return null;
        return (font.fallback && getGlyph(font, font.fallback, opts)) || null;
    };
    let mono = null;
    if (opts.monospace === true) mono = Math.max(...Object.keys(font.glyphs).map((ch) => rawGlyph(font, ch)[0].length));
    else if (typeof opts.monospace === 'number') mono = opts.monospace;

    const texts = vertical ? [...text.replace(/\n/g, '')] : text.split('\n');
    const lines = texts.map((lineText) => {
        const glyphs = [];
        let x = 0;
        for (const ch of lineText) {
            const rows = resolve(ch);
            if (!rows) continue;
            const w = rows[0]?.length ?? 0;
            const cell = mono ?? w;
            glyphs.push({ char: ch, rows, x: x + Math.floor((cell - w) / 2) });
            x += cell + spacing;
        }
        return { text: lineText, glyphs, width: glyphs.length ? x - spacing : 0 };
    });
    const width = Math.max(0, ...lines.map((l) => l.width));
    const height = lines.length * font.height + (lines.length - 1) * lineSpacing;
    lines.forEach((line, i) => {
        line.x = align === 'left' ? 0 : align === 'right' ? width - line.width : Math.floor((width - line.width) / 2);
        line.y = (lines.length - 1 - i) * (font.height + lineSpacing); // bottom row of the line, y up
    });
    return { font, width, height, lines };
}

/**
 * Size of the laid-out text in pixels.
 * Returns { width, height, lines: [{ text, width }] }.
 */
export function measure(text, font, opts) {
    const { width, height, lines } = layout(text, font, opts);
    return { width, height, lines: lines.map((l) => ({ text: l.text, width: l.width })) };
}

function* inkPixels(text, font, opts) {
    const { font: f, lines } = layout(text, font, opts);
    for (const line of lines) {
        for (const g of line.glyphs) {
            for (let row = 0; row < g.rows.length; row++) {
                const r = g.rows[row];
                for (let col = 0; col < r.length; col++) {
                    if (r[col] === '#') yield { x: line.x + g.x + col, y: line.y + (f.height - 1 - row) };
                }
            }
        }
    }
}

/** Ink pixels of the text as { x, y }: y points up, (0, 0) is the bottom-left of the text. */
export function pixels(text, font, opts) {
    return [...inkPixels(text, font, opts)];
}

/** The whole text as rows (top first), "#" = ink, like a glyph. */
export function render(text, font, opts) {
    const { width, height } = layout(text, font, opts);
    const grid = Array.from({ length: height }, () => new Array(width).fill(' '));
    for (const { x, y } of inkPixels(text, font, opts)) grid[height - 1 - y][x] = '#';
    return grid.map((row) => row.join(''));
}

// Direction → how text axes map to the world. `right`/`up`: [axis, sign] for reading direction and
// text-up; `depth`: [axis, sign] for thickness. Blocks always fill toward + from their base corner,
// matching Commands++ /buildtext.
const DIRECTIONS = {
    north: { right: ['x', -1], up: ['y', 1], depth: ['z', 1] },
    south: { right: ['x', 1], up: ['y', 1], depth: ['z', 1] },
    east: { right: ['z', 1], up: ['y', 1], depth: ['x', 1] },
    west: { right: ['z', -1], up: ['y', 1], depth: ['x', 1] },
    up: { right: ['x', 1], up: ['z', -1], depth: ['y', 1] }, // flat on the ground, read from above, top toward north
    down: { right: ['x', 1], up: ['z', 1], depth: ['y', -1] }, // flat on a ceiling, read from below
};

/**
 * Block positions for the text, lazily (feed them to a fill job).
 *   { origin = { x, y, z }  where the bottom-left pixel starts (floored)
 *     direction = "north" | "south" | "east" | "west" | "up" | "down"
 *       north/south/east/west: standing text reading toward that direction; up/down: lying flat
 *     scale = 1   each pixel becomes scale × scale blocks in the text plane
 *     depth = scale   thickness in blocks, independent of scale
 *     ...layout options }
 * With the defaults of Commands++ (spacing 1, depth = scale) the output matches /buildtext.
 */
export function* positions(text, font, opts = {}) {
    const { origin = { x: 0, y: 0, z: 0 }, direction = 'north', scale = 1 } = opts;
    const depth = opts.depth ?? scale;
    const dir = DIRECTIONS[direction];
    if (!dir) throw new RangeError(`fontLib: direction must be one of ${Object.keys(DIRECTIONS).join(', ')}, got "${direction}"`);
    if (!(scale >= 1 && depth >= 1)) throw new RangeError('fontLib: scale and depth must be at least 1');
    const o = { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) };
    const [ra, rs] = dir.right;
    const [ua, us] = dir.up;
    const [da, ds] = dir.depth;
    const size = { [ra]: scale, [ua]: scale, [da]: depth };
    for (const px of inkPixels(text, font, opts)) {
        const base = { ...o };
        base[ra] += rs * px.x * scale;
        base[ua] += us * px.y * scale;
        if (ds < 0) base[da] -= depth - 1;
        for (let dx = 0; dx < size.x; dx++) {
            for (let dy = 0; dy < size.y; dy++) {
                for (let dz = 0; dz < size.z; dz++) yield { x: base.x + dx, y: base.y + dy, z: base.z + dz };
            }
        }
    }
}

/** How many blocks positions() will yield, without generating them. */
export function countPixels(text, font, opts = {}) {
    const scale = opts.scale ?? 1;
    const depth = opts.depth ?? scale;
    let n = 0;
    for (const _ of inkPixels(text, font, opts)) n++;
    return n * scale * scale * depth;
}

#!/usr/bin/env node
/**
 * Builds fontLib fonts: tools/fontLib/sources/<name>/ → modules/JavaScript/fontLib/fonts/<name>.js
 *
 *   node tools/fontLib/build.mjs <name> [<name> ...]
 *   node tools/fontLib/build.mjs --all
 *
 * Each source folder has a font.json (see README.md) and one of: a `#`-art text file, a PNG sheet,
 * a folder of per-character PNGs, or a BDF bitmap font.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../colorLib/images.mjs';
import { inkMask, crop, detectPixelSize, downsample, resample, toRows, trimX } from './pixels.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = path.join(here, 'sources');
const OUT = path.join(here, '../../modules/JavaScript/fontLib/fonts');

// "A", "U+00C9", "00C9", or a name from font.json `names`.
function parseChar(spec, names = {}) {
    if (names[spec] !== undefined) return names[spec];
    const hex = spec.match(/^(?:U\+)?([0-9A-Fa-f]{4,6})$/);
    if (hex) return String.fromCodePoint(parseInt(hex[1], 16));
    if ([...spec].length === 1) return spec;
    throw new Error(`can't read "${spec}" as a character (use the character, U+XXXX, or a name from "names")`);
}

const codeLabel = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

// ---------- importers: each returns { glyphs: Map(char → rows), height?, baseline? } ----------

// `== A ==` headers, then rows of "#" (ink) and "." or " " (empty). A fully empty row must be
// written with dots: blank lines only separate glyphs (editors strip trailing spaces).
// `== U+0020 ==` for characters that are awkward to type.
function importText(cfg, dir) {
    const text = fs.readFileSync(path.join(dir, cfg.file), 'utf8');
    const glyphs = new Map();
    let current = null;
    for (const line of text.split(/\r?\n/)) {
        const header = line.match(/^==\s*(.+?)\s*==$/);
        if (header) {
            current = parseChar(header[1], cfg.names);
            if (glyphs.has(current)) throw new Error(`${cfg.file}: "${current}" defined twice`);
            glyphs.set(current, []);
        } else if (current !== null && line.trim() !== '') glyphs.get(current).push(line.replace(/[^#]/g, ' '));
    }
    return { glyphs };
}

function imageGlyph(mask, cfg, pixelSize) {
    const m = cfg.height ? resample(mask, cfg.height, cfg.coverage ?? 0.5) : downsample(mask, pixelSize);
    return toRows(m);
}

// One PNG with a grid of cells. `chars`: rows of characters in sheet order, or `codepoints`: the
// code point of cell 0 with cells numbered left-to-right, top-to-bottom (Minecraft ascii.png style).
function importSheet(cfg, dir) {
    const img = decodePng(fs.readFileSync(path.join(dir, cfg.file)));
    const mask = inkMask(img, cfg);
    const [cw, ch] = cfg.cell;
    const [gx, gy] = cfg.gap ?? [0, 0];
    const [ox, oy] = cfg.offset ?? [0, 0];
    const cols = Math.floor((img.width - ox + gx) / (cw + gx));
    const cellsWanted = [];
    if (cfg.codepoints !== undefined) {
        const rowsCount = Math.floor((img.height - oy + gy) / (ch + gy));
        for (let i = 0; i < cols * rowsCount; i++) cellsWanted.push([i % cols, Math.floor(i / cols), String.fromCodePoint(cfg.codepoints + i)]);
    } else {
        cfg.chars.forEach((row, r) => [...row].forEach((c, col) => cellsWanted.push([col, r, c])));
    }
    const cells = cellsWanted.map(([c, r, char]) => [char, crop(mask, ox + c * (cw + gx), oy + r * (ch + gy), cw, ch)]);
    const pixelSize = cfg.pixelSize ?? detectPixelSize(cells.map(([, m]) => m));
    const glyphs = new Map();
    for (const [char, m] of cells) {
        const rows = imageGlyph(m, cfg, pixelSize);
        if (cfg.codepoints !== undefined && char !== ' ' && !rows.some((r) => r.includes('#'))) continue; // empty cell
        glyphs.set(char, rows);
    }
    return { glyphs, pixelSize };
}

// A folder with one PNG per character: `A.png`, `U+003F.png` / `003F.png`, or a name from `names`.
function importGlyphs(cfg, dir) {
    const folder = path.join(dir, cfg.dir ?? 'glyphs');
    const files = fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.png'));
    const masks = files.map((f) => [parseChar(path.basename(f, path.extname(f)), cfg.names), inkMask(decodePng(fs.readFileSync(path.join(folder, f))), cfg)]);
    const pixelSize = cfg.pixelSize ?? detectPixelSize(masks.map(([, m]) => m));
    const glyphs = new Map();
    for (const [char, m] of masks) {
        if (glyphs.has(char)) throw new Error(`${cfg.dir}: two files for "${char}"`);
        glyphs.set(char, imageGlyph(m, cfg, pixelSize));
    }
    return { glyphs, pixelSize };
}

// BDF bitmap font. `include`: code point ranges to keep ("U+0020-U+007E"), default everything.
function importBdf(cfg, dir) {
    const lines = fs.readFileSync(path.join(dir, cfg.file), 'latin1').split(/\r?\n/);
    const ranges = (cfg.include ?? []).map((r) => r.split('-').map((p) => parseInt(p.replace(/^U\+/i, ''), 16)));
    const wanted = (cp) => !ranges.length || ranges.some(([a, b = a]) => cp >= a && cp <= b);
    let ascent = 0;
    let descent = 0;
    const raw = [];
    let g = null;
    let inBitmap = false;
    for (const line of lines) {
        const [key, ...v] = line.trim().split(/\s+/);
        if (key === 'FONT_ASCENT') ascent = Number(v[0]);
        else if (key === 'FONT_DESCENT') descent = Number(v[0]);
        else if (key === 'STARTCHAR') g = { bitmap: [] };
        else if (key === 'ENCODING' && g) g.cp = Number(v[0]);
        else if (key === 'DWIDTH' && g) g.dwidth = Number(v[0]);
        else if (key === 'BBX' && g) [g.w, g.h, g.xoff, g.yoff] = v.map(Number);
        else if (key === 'BITMAP') inBitmap = true;
        else if (key === 'ENDCHAR') {
            if (g.cp >= 0 && wanted(g.cp)) raw.push(g);
            g = null;
            inBitmap = false;
        } else if (inBitmap && key) g.bitmap.push(key);
    }
    if (!ascent) throw new Error(`${cfg.file}: no FONT_ASCENT`);
    const height = ascent + descent;
    const glyphs = new Map();
    for (const c of raw) {
        const top = ascent - (c.yoff + c.h); // rows from the top of the cell to the glyph's top
        const width = c.w || c.dwidth || 1;
        const rows = Array.from({ length: height }, () => ' '.repeat(width).split(''));
        c.bitmap.forEach((hexRow, y) => {
            const bits = BigInt('0x' + hexRow);
            const total = hexRow.length * 4;
            for (let x = 0; x < c.w; x++) {
                const on = (bits >> BigInt(total - 1 - x)) & 1n;
                const row = top + y;
                if (on && row >= 0 && row < height) rows[row][x] = '#';
            }
        });
        glyphs.set(String.fromCodePoint(c.cp), rows.map((r) => r.join('')));
    }
    return { glyphs, height, baseline: descent };
}

const IMPORTERS = { text: importText, sheet: importSheet, glyphs: importGlyphs, bdf: importBdf };

// ---------- normalize, check, write ----------

function encodeBits(rows) {
    const width = rows[0].length;
    let hex = '';
    let nibble = 0;
    let n = 0;
    for (const r of rows) {
        for (const c of r) {
            nibble = (nibble << 1) | (c === '#' ? 1 : 0);
            if (++n % 4 === 0) {
                hex += nibble.toString(16);
                nibble = 0;
            }
        }
    }
    if (n % 4) hex += (nibble << (4 - (n % 4))).toString(16);
    return `${width},${hex.replace(/0+$/, '')}`;
}

export function buildFont(name, { write = true, log = console.log, dir = path.join(SOURCES, name) } = {}) {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'font.json'), 'utf8'));
    const importer = IMPORTERS[cfg.type];
    if (!importer) throw new Error(`${name}: type must be one of ${Object.keys(IMPORTERS).join(', ')}`);
    const imported = importer(cfg, dir);
    const trim = cfg.trim ?? (cfg.type === 'text' ? 'none' : 'x');
    const warnings = [];

    // Every glyph gets the same height (bottom-aligned, so the baseline stays put) and equal-width rows.
    const height = imported.height ?? Math.max(...[...imported.glyphs.values()].map((r) => r.length));
    const glyphs = new Map();
    const empty = [];
    for (const [char, rows0] of [...imported.glyphs].sort(([a], [b]) => a.codePointAt(0) - b.codePointAt(0))) {
        // An inkless glyph (other than whitespace) is a placeholder: drop it so the fallback shows.
        if (!/\s/.test(char) && !rows0.some((r) => r.includes('#'))) {
            empty.push(char);
            continue;
        }
        let rows = rows0.length > height ? rows0.slice(rows0.length - height) : rows0;
        if (rows0.length > height) warnings.push(`"${char}" is taller than ${height} rows; top cut`);
        if (trim === 'x' && char !== ' ') rows = trimX(rows);
        if (char === ' ' && cfg.spaceWidth) rows = new Array(height).fill(' '.repeat(cfg.spaceWidth));
        const width = Math.max(1, ...rows.map((r) => r.length));
        const padded = [...new Array(height - rows.length).fill(''), ...rows].map((r) => r.padEnd(width, ' '));
        if (new Set(rows0.map((r) => r.length)).size > 1) warnings.push(`"${char}": ragged rows padded to ${width}`);
        glyphs.set(char, padded);
    }
    if (empty.length) {
        const shown = empty.length > 12 ? `${empty.slice(0, 12).join('')}… (${codeLabel(empty[0])}–${codeLabel(empty.at(-1))})` : empty.join(' ');
        warnings.push(`dropped ${empty.length} glyphs with no ink: ${shown}`);
    }

    // Baseline: from font.json, the importer (BDF), or the empty rows under A–Z / 0–9.
    let baseline = cfg.baseline ?? imported.baseline;
    if (baseline === undefined) {
        const probe = [...glyphs].filter(([c]) => /[A-Z0-9]/.test(c));
        baseline = probe.length ? Math.min(...probe.map(([, rows]) => height - 1 - rows.findLastIndex((r) => r.includes('#')))) : 0;
    }
    const missingAscii = [];
    for (let cp = 0x21; cp <= 0x7e; cp++) {
        const c = String.fromCharCode(cp);
        const folded = cfg.caseFold === 'upper' ? c.toUpperCase() : cfg.caseFold === 'lower' ? c.toLowerCase() : c;
        if (!glyphs.has(c) && !glyphs.has(folded)) missingAscii.push(c);
    }
    const encoding = cfg.encoding ?? (glyphs.size > 300 ? 'bits' : 'rows');
    const font = {
        name,
        version: 1,
        height,
        baseline,
        spacing: cfg.spacing ?? 1,
        lineSpacing: cfg.lineSpacing ?? 1,
        caseFold: cfg.caseFold ?? null,
        fallback: cfg.fallback ?? (glyphs.has('?') ? '?' : null),
        spaceWidth: cfg.spaceWidth ?? glyphs.get(' ')?.[0].length ?? Math.max(1, Math.round(height / 2)),
        license: cfg.license ?? null,
        author: cfg.author ?? null,
        encoding,
    };

    const nonAscii = [...glyphs.keys()].filter((c) => c.codePointAt(0) > 0x7e).length;
    log(`${name}: ${glyphs.size} glyphs (${nonAscii} beyond ASCII), height ${height}, baseline ${baseline}, ${encoding}` + (imported.pixelSize > 1 ? `, drawn at ${imported.pixelSize}×` : ''));
    if (missingAscii.length) log(`  missing printable ASCII: ${missingAscii.join('')}`);
    for (const w of warnings) log(`  warning: ${w}`);

    const body = [...glyphs]
        .map(([c, rows]) => `        ${JSON.stringify(c)}: ${encoding === 'bits' ? JSON.stringify(encodeBits(rows)) : JSON.stringify(rows)},`)
        .join('\n');
    const meta = Object.entries(font)
        .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
        .join('\n');
    // `notice`: a license file whose text must travel with the font (BSD/MIT notices).
    const notice = cfg.notice ? fs.readFileSync(path.join(dir, cfg.notice), 'utf8').trim().split(/\r?\n/).map((l) => `// ${l}`.trimEnd()).join('\n') + '\n' : '';
    const text = `// GENERATED by tools/fontLib/build.mjs from tools/fontLib/sources/${name} — do not edit.\n${notice}export default {\n${meta}\n    glyphs: {\n${body}\n    },\n};\n`;
    if (write) {
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, `${name}.js`), text);
        log(`  wrote fonts/${name}.js (${(text.length / 1024).toFixed(1)} KB)`);
    }
    return { font: { ...font, glyphs: Object.fromEntries(glyphs) }, text, warnings, missingAscii };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const names = args.includes('--all') ? fs.readdirSync(SOURCES).filter((d) => fs.existsSync(path.join(SOURCES, d, 'font.json'))) : args;
    if (!names.length) {
        console.error('usage: node tools/fontLib/build.mjs <name> [...] | --all');
        process.exit(2);
    }
    for (const n of names) buildFont(n);
}

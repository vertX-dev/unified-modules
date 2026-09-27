#!/usr/bin/env node
// fontLib tests: node tools/fontLib/test.mjs [--cmdpp <Commands++ folder>]
// Builds fixture fonts from every source type in a temp folder, then checks the runtime.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as fontLib from '../../modules/JavaScript/fontLib/fontLib.js';
import block from '../../modules/JavaScript/fontLib/fonts/block.js';
import slim from '../../modules/JavaScript/fontLib/fonts/slim.js';
import { buildFont } from './build.mjs';
import { encodePng } from './pixels.mjs';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) pass++;
    else {
        fail++;
        console.log(`FAIL ${name} ${detail}`);
    }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fontlib-test-'));
const quiet = { log: () => {}, write: false };
const load = async (text) => (await import('data:text/javascript,' + encodeURIComponent(text))).default;

// Draw glyph rows into an RGBA image: each font pixel becomes px×px, black ink on white.
function drawRows(cells, px, { gap = 0, margin = 0, alpha = false } = {}) {
    const ch = cells[0].length;
    const cw = cells[0][0].length;
    const w = (cells.length * (cw + gap) - gap) * px + margin * 2;
    const h = ch * px + margin * 2;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set(alpha ? [0, 0, 0, 0] : [255, 255, 255, 255], i * 4);
    cells.forEach((rows, n) =>
        rows.forEach((row, y) =>
            [...row].forEach((c, x) => {
                if (c !== '#') return;
                for (let dy = 0; dy < px; dy++) {
                    for (let dx = 0; dx < px; dx++) {
                        const X = margin + (n * (cw + gap) + x) * px + dx;
                        const Y = margin + y * px + dy;
                        rgba.set([0, 0, 0, 255], (Y * w + X) * 4);
                    }
                }
            }),
        ),
    );
    return { w, h, png: encodePng(w, h, rgba) };
}
const A = ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '.....'].map((r) => r.replace(/\./g, ' '));
const B = ['####.', '#...#', '####.', '#...#', '#...#', '####.', '.....'].map((r) => r.replace(/\./g, ' '));
const E_ACUTE = ['..#..', '#####', '#....', '####.', '#....', '#####', '.....'].map((r) => r.replace(/\./g, ' '));
const Q = ['.##.', '#..#', '..#.', '.#..', '....', '.#..', '....'].map((r) => r.replace(/\./g, ' '));
const writeSource = (name, cfg, files = {}) => {
    const dir = path.join(tmp, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'font.json'), JSON.stringify(cfg));
    for (const [f, data] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), data);
    }
    return dir;
};

// ---------- importers ----------
{
    // sheet drawn at 4× with a margin and a gap: pixel size is detected, glyphs trimmed
    const { png } = drawRows([A, B], 4, { gap: 1, margin: 3 });
    const dir = writeSource('sheet', { type: 'sheet', file: 'sheet.png', cell: [20, 28], gap: [4, 0], offset: [3, 3], chars: ['AB'] }, { 'sheet.png': png });
    const { font } = buildFont('sheet', { ...quiet, dir });
    check('sheet: A', same(font.glyphs.A, A), JSON.stringify(font.glyphs.A));
    check('sheet: B trimmed', same(font.glyphs.B, B.map((r) => r.slice(0, 5))) && font.height === 7);
    check('sheet: baseline auto = 1 empty row', font.baseline === 1, font.baseline);
}
{
    // one PNG per glyph: a literal name, a code point (É) and a named file (?), transparent background
    const files = {};
    for (const [f, rows] of [['A', A], ['U+00C9', E_ACUTE], ['question', Q]]) files[`glyphs/${f}.png`] = drawRows([rows], 3, { alpha: true }).png;
    const dir = writeSource('glyphs', { type: 'glyphs', names: { question: '?' }, caseFold: 'upper' }, files);
    const { font } = buildFont('glyphs', { ...quiet, dir });
    check('glyphs: chars from file names', same(Object.keys(font.glyphs).sort(), ['?', 'A', 'É']), Object.keys(font.glyphs));
    check('glyphs: É rows', same(font.glyphs['É'], E_ACUTE));
}
{
    // a drawing that isn't pixel art: resampled to 7 rows by coverage
    const big = Array.from({ length: 70 }, (_, y) => Array.from({ length: 50 }, (_, x) => (x < 10 || x >= 40 || y < 10 || (y >= 30 && y < 40) ? '#' : ' ')).join(''));
    const dir = writeSource('drawn', { type: 'glyphs', height: 7, channel: 'luma' }, { 'glyphs/A.png': drawRows([big], 1).png });
    const { font } = buildFont('drawn', { ...quiet, dir });
    check('resample: 7 rows, aspect kept', font.height === 7 && font.glyphs.A[0].length === 5, JSON.stringify(font.glyphs.A));
    check('resample: shape', font.glyphs.A[0] === '#####' && font.glyphs.A[3] === '#####' && font.glyphs.A[5] === '#   #');
}
{
    // BDF with Cyrillic, a descender and a space
    const bdf = `STARTFONT 2.1
FONT test
SIZE 7 75 75
FONTBOUNDINGBOX 5 8 0 -1
STARTPROPERTIES 2
FONT_ASCENT 7
FONT_DESCENT 1
ENDPROPERTIES
CHARS 4
STARTCHAR space
ENCODING 32
DWIDTH 3 0
BBX 0 0 0 0
BITMAP
ENDCHAR
STARTCHAR A
ENCODING 65
DWIDTH 6 0
BBX 5 6 0 0
BITMAP
70
88
88
F8
88
88
ENDCHAR
STARTCHAR zhe
ENCODING 1046
DWIDTH 6 0
BBX 5 6 0 0
BITMAP
A8
A8
70
70
A8
A8
ENDCHAR
STARTCHAR j
ENCODING 106
DWIDTH 3 0
BBX 2 8 0 -1
BITMAP
40
00
40
40
40
40
40
80
ENDCHAR
ENDFONT
`;
    const dir = writeSource('bdf', { type: 'bdf', file: 'test.bdf', include: ['U+0020-U+007E', 'U+0400-U+04FF'] }, { 'test.bdf': bdf });
    const { font } = buildFont('bdf', { ...quiet, dir });
    check('bdf: height = ascent + descent, baseline = descent', font.height === 8 && font.baseline === 1);
    check('bdf: Ж (U+0416)', same(font.glyphs['Ж'], ['     ', '# # #', '# # #', ' ### ', ' ### ', '# # #', '# # #', '     ']), JSON.stringify(font.glyphs['Ж']));
    check('bdf: descender reaches the bottom row', font.glyphs.j[7] === '# ', JSON.stringify(font.glyphs.j));
    check('bdf: space keeps its width', font.glyphs[' '][0].length === 3);
}
{
    // bits encoding decodes to the same rows
    const dir = writeSource('bits', { type: 'text', file: 'f.txt', encoding: 'bits' }, { 'f.txt': `== A ==\n${A.map((r) => r.replace(/ /g, '.')).join('\n')}\n\n== Ж ==\n#.#.#\n#.#.#\n.###.\n.###.\n#.#.#\n#.#.#\n.....\n` });
    const { text } = buildFont('bits', { ...quiet, dir });
    const f = await load(text);
    check('bits: stored packed', typeof f.glyphs.A === 'string');
    check('bits: decodes', same(fontLib.getGlyph(f, 'A'), A) && fontLib.getGlyph(f, 'Ж')[2] === ' ### ');
}

// ---------- runtime ----------
check('caseFold upper', same(fontLib.getGlyph(block, 'a'), block.glyphs.A));
check('missingChars', same(fontLib.missingChars('Hi~~ É', block), ['~', 'É']));
check('fallback glyph', same(fontLib.render('~', block), fontLib.render('?', block)));
check('onMissing skip', fontLib.measure('A~A', block, { onMissing: 'skip' }).width === fontLib.measure('AA', block).width);
let threw = false;
try {
    fontLib.render('É', block, { onMissing: 'throw' });
} catch (e) {
    threw = /U\+00C9/.test(e.message);
}
check('onMissing throw names the code point', threw);
{
    const uni = { name: 'uni', height: 7, baseline: 1, spacing: 1, caseFold: 'upper', glyphs: { É: E_ACUTE, A } };
    fontLib.registerFont(uni);
    check('unicode: é folds to É, by font name', same(fontLib.getGlyph('uni', 'é'), E_ACUTE) && fontLib.canRender('éa', 'uni'));
    check('unicode: surrogate pairs are one character', same(fontLib.missingChars('😀', 'uni'), ['😀']));
}
{
    const m = fontLib.measure('AB\nA', slim, { align: 'center' });
    const wA = slim.glyphs.A[0].length;
    const wB = slim.glyphs.B[0].length;
    check('measure', m.width === wA + 1 + wB && m.height === slim.height * 2 + 1, JSON.stringify(m));
    const rows = fontLib.render('AB\nA', slim, { align: 'center' });
    check('render size + centering', rows.length === m.height && rows.every((r) => r.length === m.width) && rows[slim.height + 1].startsWith(' '.repeat(Math.floor((m.width - wA) / 2)) + slim.glyphs.A[0]));
    const mono = fontLib.measure('I1', block, { monospace: 9 });
    check('monospace', mono.width === 9 + 1 + 9);
    const col = fontLib.measure('ABC', slim, { vertical: true });
    check('vertical stacks characters', col.lines.length === 3 && col.height === slim.height * 3 + 2);
    const px = fontLib.pixels('A', slim);
    check('pixels y-up from bottom-left', px.some((p) => p.y === slim.height - 1) && Math.min(...px.map((p) => p.y)) === 0);
}
{
    const o = { x: 10.7, y: 64, z: -3.2 };
    const count = (it) => [...it].length;
    const ink = fontLib.pixels('HI', block).length;
    check('positions scale³ by default', count(fontLib.positions('HI', block, { origin: o, scale: 2 })) === ink * 8 && fontLib.countPixels('HI', block, { scale: 2 }) === ink * 8);
    const thin = [...fontLib.positions('HI', block, { origin: o, scale: 3, depth: 1 })];
    const span = (ps, k) => Math.max(...ps.map((p) => p[k])) - Math.min(...ps.map((p) => p[k])) + 1;
    check('depth independent of scale', thin.length === ink * 9 && span(thin, 'z') === 1 && fontLib.countPixels('HI', block, { scale: 3, depth: 1 }) === thin.length);
    const east = [...fontLib.positions('HI', block, { origin: o, direction: 'east', depth: 4 })];
    check('depth along x when facing east', span(east, 'x') === 4 && span(east, 'z') === fontLib.measure('HI', block).width);
    const flat = [...fontLib.positions('HI', block, { origin: o, direction: 'up', depth: 2 })];
    check('flat text: height along z, depth along y', span(flat, 'y') === 2 && span(flat, 'z') === block.height);
}

// ---------- shipped Unicode fonts ----------
{
    const spleen6 = (await import('../../modules/JavaScript/fontLib/fonts/spleen6x12.js')).default;
    const spleen8 = (await import('../../modules/JavaScript/fontLib/fonts/spleen8x16.js')).default;
    check('spleen6x12: Cyrillic + Latin-1', fontLib.canRender('Привет, мир! Ёё Élan ß', spleen6), fontLib.missingChars('Привет, мир! Ёё Élan ß', spleen6));
    check('spleen8x16: Latin Extended-A', fontLib.canRender('Żółć Łódź Šđ', spleen8));
    check('spleen: rows decode to full height', fontLib.getGlyph(spleen8, 'Ж').length === 16 && fontLib.getGlyph(spleen6, 'Ж').length === 12);
    check('spleen: license notice travels with the font', spleen6.license === 'BSD-2-Clause' && spleen6.author === 'Frederic Cambus');
}

// ---------- parity with Commands++ /buildtext ----------
const cmdpp = process.argv.includes('--cmdpp') ? process.argv[process.argv.indexOf('--cmdpp') + 1] : 'W:/ADDONS/Commands++';
const shapesFile = path.join(cmdpp, 'src/BP/scripts/core/shapes.js');
if (fs.existsSync(shapesFile)) {
    const { textPositions } = await import(pathToFileURL(shapesFile).href);
    const { FONTS } = await import(pathToFileURL(path.join(cmdpp, 'src/BP/scripts/core/buildTextFont.js')).href);
    const key = (p) => `${p.x},${p.y},${p.z}`;
    // Skip glyphs whose rows were ragged in Commands++ (its advance read only the first row).
    for (const [font, name, text] of [[block, 'block', 'HELLO WORM 2026!'], [slim, 'slim', 'ABC XYZ 0189=+']]) {
        for (const direction of ['north', 'south', 'east', 'west']) {
            for (const [scale, depth] of [[1, 1], [3, 3], [2, 5]]) {
                const origin = { x: 5.5, y: 70, z: -12.25 };
                const old = new Set([...textPositions(text, FONTS[name], origin, scale, direction, false, depth)].map(key));
                const now = [...fontLib.positions(text, font, { origin, direction, scale, depth })].map(key);
                check(`parity ${name} ${direction} s${scale} d${depth}`, now.length === old.size && now.every((k) => old.has(k)), `${now.length} vs ${old.size}`);
            }
        }
    }
} else console.log(`(skipping Commands++ parity: ${shapesFile} not found)`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

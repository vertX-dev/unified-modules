#!/usr/bin/env node
// colorLib `display` part — tests for the pure pixelOps.js (no Minecraft APIs):
//   node tools/colorLib/pixelOps.test.mjs
// colorDisplay.js needs @minecraft/server + debug-utilities; it is exercised by
// Commands++'s test suite (tests/mapart.test.mjs) against stubs.
import { downsample, mergeSquares, countGlyphs, rgbKey } from '../../modules/JavaScript/colorLib/pixelOps.js';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) pass++;
    else {
        fail++;
        console.log(`FAIL ${name} ${detail}`);
    }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── downsample ──────────────────────────────────────────────────────────────
{
    const img = { w: 4, h: 2, palette: [0x000000, 0xffffff], idx: [0, 1, -1, -1, 1, 0, 0, -1] };
    const s = downsample(img, 2);
    check('factor 2 -> 2×1', s.w === 2 && s.h === 1 && s.factor === 2);
    check('cell = mean of its non-empty pixels', eq(s.colors[0], { r: 128, g: 128, b: 128 }));
    check('mostly-empty cell stays empty', s.colors[1] === null);
    const same = downsample(img, 64);
    check('no downsample when it already fits', same.factor === 1 && same.w === 4);
    const odd = downsample({ w: 5, h: 3, palette: [0x102030], idx: new Array(15).fill(0) }, 2);
    check('odd sizes round up', odd.w === 2 && odd.h === 1 && odd.factor === 3);
}

// ── mergeSquares ────────────────────────────────────────────────────────────
const covers = (w, h, colorAt, cells) => {
    const seen = new Uint8Array(w * h);
    for (const { x, y, k, c } of cells) {
        for (let yy = y; yy < y + k; yy++)
            for (let xx = x; xx < x + k; xx++) {
                if (xx >= w || yy >= h || seen[yy * w + xx]++ || colorAt(xx, yy) !== c) return false;
            }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (colorAt(x, y) !== null && !seen[y * w + x]) return false;
    return true;
};
{
    check('solid 8×8 -> one glyph', eq(mergeSquares(8, 8, () => 'a', { key: (c) => c }).map((q) => q.k), [8]));
    check('checker never merges', mergeSquares(6, 6, (x, y) => ((x + y) % 2 ? 'a' : 'b'), { key: (c) => c }).length === 36);
    check('maxK caps squares', mergeSquares(8, 8, () => 'a', { maxK: 3, key: (c) => c }).every((q) => q.k <= 3));
    let seed = 7;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
    const grid = [];
    for (let i = 0; i < 80; i++) grid.push(rnd() < 0.15 ? null : ['r', 'g', 'b'][Math.floor(rnd() * 3)]);
    const colorAt = (x, y) => grid[Math.floor(y / 5) * 10 + Math.floor(x / 4)];
    const cells = mergeSquares(40, 40, colorAt, { key: (c) => c });
    check('covers every pixel exactly once, one colour per glyph', covers(40, 40, colorAt, cells));
}

// ── countGlyphs / rgbKey ────────────────────────────────────────────────────
{
    const at = (x, y) => (x < 4 && y < 4 ? { r: 1, g: 2, b: 3 } : null);
    check('count without merge = non-empty pixels', countGlyphs(8, 8, at) === 16);
    check('count with merge = squares', countGlyphs(8, 8, at, { merge: true, key: rgbKey }) === 1);
    check('rgbKey packs', rgbKey({ r: 1, g: 2, b: 3 }) === 0x010203);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

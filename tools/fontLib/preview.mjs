#!/usr/bin/env node
/**
 * Preview a built font in the terminal, or as a PNG.
 *
 *   node tools/fontLib/preview.mjs <font> "Hello, world!"      text
 *   node tools/fontLib/preview.mjs <font> --charset            every glyph, labelled
 *   node tools/fontLib/preview.mjs <font> "text" --png out.png [--px 8]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as fontLib from '../../modules/JavaScript/fontLib/fontLib.js';
import { encodePng } from './pixels.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const [name] = args;
if (!name) {
    console.error('usage: node tools/fontLib/preview.mjs <font> "text" | --charset [--png out.png] [--px 8]');
    process.exit(2);
}
const opt = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const font = (await import(pathToFileURL(path.join(here, '../../modules/JavaScript/fontLib/fonts', `${name}.js`)).href)).default;

let text = args[1] && !args[1].startsWith('--') ? args[1] : null;
if (args.includes('--charset')) {
    const chars = fontLib.charset(font);
    const perLine = 16;
    const lines = [];
    for (let i = 0; i < chars.length; i += perLine) lines.push(chars.slice(i, i + perLine).join(' '));
    text = lines.join('\n');
    console.log(`${font.name}: ${chars.length} glyphs, height ${font.height}, baseline ${font.baseline}\n`);
}
if (!text) {
    console.error('nothing to preview: give text or --charset');
    process.exit(2);
}

const missing = fontLib.missingChars(text, font);
if (missing.length) console.log(`missing (drawn as "${font.fallback ?? 'nothing'}"): ${missing.join(' ')}\n`);
const rows = fontLib.render(text, font);

const png = opt('--png');
if (png) {
    const px = Number(opt('--px') ?? 8);
    const pad = 1;
    const w = (rows[0].length + pad * 2) * px;
    const h = (rows.length + pad * 2) * px;
    const rgba = new Uint8Array(w * h * 4).fill(255);
    rows.forEach((row, y) =>
        [...row].forEach((c, x) => {
            if (c !== '#') return;
            for (let dy = 0; dy < px; dy++) {
                for (let dx = 0; dx < px; dx++) {
                    const o = (((y + pad) * px + dy) * w + (x + pad) * px + dx) * 4;
                    rgba[o] = rgba[o + 1] = rgba[o + 2] = 20;
                }
            }
        }),
    );
    fs.writeFileSync(png, encodePng(w, h, rgba));
    console.log(`wrote ${png} (${w}×${h})`);
} else {
    for (const row of rows) console.log(row.replace(/#/g, '█').replace(/ /g, '·'));
}

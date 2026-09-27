#!/usr/bin/env node
/**
 * Builds modules/JavaScript/colorLib/data/colors.js from the vanilla textures in bedrock-samples and
 * the block/item id lists in @minecraft/vanilla-data. No game or server needed.
 *
 *   node tools/colorLib/generate.mjs --samples <bedrock-samples> [--vanilla-data <dir>] [--out <file>]
 *
 * --samples       bedrock-samples checkout (default $BEDROCK_SAMPLES)
 * --vanilla-data  @minecraft/vanilla-data package folder (default: `npm install` in tools/colorLib)
 * --out           output file (default: the colorLib module's data/colors.js)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decodePng, decodeTga } from './images.mjs';
import { BASE, ruleColor, tintOf } from './mapRules.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const samples = args.samples ?? process.env.BEDROCK_SAMPLES;
if (!samples) {
    console.error('usage: node tools/colorLib/generate.mjs --samples <bedrock-samples> [--vanilla-data <dir>] [--out <file>]');
    process.exit(2);
}
const out = args.out ?? path.join(here, '../../modules/JavaScript/colorLib/data/colors.js');
const rp = path.join(samples, 'resource_pack');

// ---------- JSON with // comments ----------
function readJson(file) {
    const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    let res = '';
    let inStr = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
            res += c;
            if (c === '\\') res += text[++i];
            else if (c === '"') inStr = false;
        } else if (c === '"') {
            inStr = true;
            res += c;
        } else if (c === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            res += '\n';
        } else res += c;
    }
    return JSON.parse(res);
}

// ---------- color helpers (linear light) ----------
const toLin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));
const LIN = Array.from({ length: 256 }, (_, i) => toLin(i));
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb = (lin) => lin.map(toSrgb);
const chroma = (lin) => {
    const s = lin.map(toSrgb);
    return Math.max(...s) - Math.min(...s);
};

// ---------- textures ----------
const imageCache = new Map();
function loadImage(rel) {
    if (imageCache.has(rel)) return imageCache.get(rel);
    let img = null;
    for (const [ext, decode] of [['.png', decodePng], ['.tga', decodeTga]]) {
        const file = path.join(rp, rel + ext);
        if (fs.existsSync(file)) {
            try {
                img = decode(fs.readFileSync(file));
            } catch (e) {
                console.warn(`skip ${rel}${ext}: ${e.message}`);
            }
            break;
        }
    }
    imageCache.set(rel, img);
    return img;
}

// Average of one atlas entry value → linear [r,g,b] or null.
// `overlay_color`: pixels with alpha 255 are the tint mask; alpha 0 pixels are plain opaque ones.
function averageOf(entry) {
    if (Array.isArray(entry)) entry = entry[0]; // aux variants: variant 0 is the default state
    if (!entry) return null;
    const spec = typeof entry === 'string' ? { path: entry } : entry;
    const img = loadImage(spec.path);
    if (!img) return null;
    const overlay = spec.overlay_color && hexRgb(spec.overlay_color).map((v) => v / 255);
    const tint = spec.tint_color && hexRgb(spec.tint_color).map((v) => v / 255);
    const sum = [0, 0, 0];
    let weight = 0;
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const a = overlay ? 1 : d[i + 3] / 255;
        if (!a) continue;
        const mul = overlay ? (d[i + 3] === 255 ? overlay : null) : tint;
        for (let c = 0; c < 3; c++) sum[c] += a * LIN[d[i + c]] * (mul ? mul[c] : 1);
        weight += a;
    }
    return weight ? sum.map((v) => v / weight) : null;
}

const terrain = readJson(path.join(rp, 'textures/terrain_texture.json')).texture_data;
const itemAtlas = readJson(path.join(rp, 'textures/item_texture.json')).texture_data;
const blockDefs = readJson(path.join(rp, 'blocks.json'));
const version = readJson(path.join(samples, 'version.json')).latest.version;

const terrainAvg = (name) => (terrain[name] ? averageOf(terrain[name].textures) : null);

// ---------- block and item ids ----------
const require = createRequire(import.meta.url);
const vanillaDir = args['vanilla-data'] ? path.resolve(args['vanilla-data']) : '@minecraft/vanilla-data';
let vanilla;
try {
    vanilla = require(vanillaDir);
} catch {
    console.error('@minecraft/vanilla-data not found: run `npm install` in tools/colorLib, or pass --vanilla-data <dir>');
    process.exit(2);
}
const shortIds = (types) => Object.values(types).map((id) => id.replace(/^minecraft:/, ''));
const blockIds = shortIds(vanilla.MinecraftBlockTypes).sort();
const itemIds = shortIds(vanilla.MinecraftItemTypes).sort();

// ---------- map palette ----------
const palette = BASE.map(([name, c]) => (name === 'NONE' ? null : [(c >> 16) & 255, (c >> 8) & 255, c & 255]));
const paletteIndex = (color) => {
    let i = palette.findIndex((p) => p?.join() === color.join());
    if (i < 0) i = palette.push(color) - 1;
    return i;
};
const baseLin = palette.map((p) => p && p.map((v) => LIN[v]));
function nearestBase(lin) {
    let best = 1;
    let bestD = Infinity;
    for (let i = 1; i < BASE.length; i++) {
        const d = baseLin[i].reduce((s, v, c) => s + (v - lin[c]) ** 2, 0);
        if (d < bestD) [best, bestD] = [i, d];
    }
    return best;
}

// ---------- blocks ----------
// Grayscale textures the game colors by block state; baked at the default state.
const STATE_TINT = { redstone_wire: '#4c0000', melon_stem: '#00ff00', pumpkin_stem: '#00ff00' };

// flags: 1 = map color estimated from the texture, 2 = biome tint (plains) baked in
const FLAG = { MAP_ESTIMATED: 1, TINTED: 2 };
const blocks = {};
const stats = { tinted: 0, rule: 0, estimated: 0, none: 0, noTexture: 0 };
// blocks.json still uses some pre-flattening / camelCase names.
const RENAMED = { grass: 'grass_block', chain: 'iron_chain', tallgrass: 'short_grass' };
const defs = new Map();
for (const [k, v] of Object.entries(blockDefs)) {
    if (typeof v !== 'object') continue;
    const id = RENAMED[k] ?? k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    if (!defs.has(id) || k === id) defs.set(id, v);
}
// Data-driven variants aren't in blocks.json: `red_wool_slab` looks like `red_wool`, `hard_glass` like `glass`.
function defFor(id) {
    if (defs.get(id)?.textures) return defs.get(id);
    const base = id.replace(/^hard_/, '').replace(/_(slab|double_slab|stairs|wall)$/, '');
    return defs.get(base)?.textures ? defs.get(base) : (defs.get(id) ?? {});
}
for (const id of blockIds) {
    const def = defFor(id);
    const biome = tintOf(id);
    // Texture tint: plains ÷ untinted map color for biome tints; a few blocks tint by state instead.
    const tint = biome
        ? biome.plains.map((v, c) => LIN[v] / (LIN[biome.base[c]] || 1))
        : STATE_TINT[id] && hexRgb(STATE_TINT[id]).map((v) => LIN[v]);
    let flags = 0;
    const face = (name) => {
        let lin = terrainAvg(name);
        if (lin && tint && chroma(lin) < 24) {
            lin = lin.map((v, c) => v * tint[c]);
            flags |= FLAG.TINTED;
        }
        return lin;
    };
    const t = def.textures;
    let up, down, side;
    if (typeof t === 'string') up = down = side = face(t);
    else if (t && typeof t === 'object') {
        up = face(t.up ?? t.side);
        down = face(t.down ?? t.side);
        const sides = ['north', 'south', 'east', 'west'].map((k) => face(t[k] ?? t.side)).filter(Boolean);
        side = sides.length ? sides.reduce((a, b) => a.map((v, c) => v + b[c])).map((v) => v / sides.length) : null;
    }
    const faces = [[up, 1], [down, 1], [side, 4]].filter(([f]) => f);
    const w = faces.reduce((s, [, k]) => s + k, 0);
    const avg = faces.length ? faces.reduce((s, [f, k]) => s.map((v, c) => v + f[c] * k), [0, 0, 0]).map((v) => v / w) : null;

    let map;
    if (biome) {
        map = paletteIndex(biome.plains);
        flags |= FLAG.TINTED;
        stats.tinted++;
    } else if ((map = ruleColor(id)) !== undefined) stats.rule++;
    else if (up ?? avg) {
        map = nearestBase(up ?? avg);
        flags |= FLAG.MAP_ESTIMATED;
        stats.estimated++;
    } else {
        map = 0;
        stats.none++;
    }
    if (!avg) stats.noTexture++;

    const entry = [avg ? rgb(avg) : null, map, flags];
    const top = up ? rgb(up) : null;
    const sideC = side ? rgb(side) : null;
    if (avg && (top?.join() !== entry[0].join() || sideC?.join() !== entry[0].join())) entry.push(top, sideC);
    blocks[id] = entry;
}

// ---------- items ----------
// Item icons: exact atlas key, the BP item's minecraft:icon, else an atlas texture whose file name
// holds every word of the id (`red_dye` → dye_powder_red, `light_gray_bed` → bed_silver).
const iconOf = {};
const bpItems = path.join(samples, 'behavior_pack/items');
if (fs.existsSync(bpItems)) {
    for (const f of fs.readdirSync(bpItems)) {
        try {
            const item = readJson(path.join(bpItems, f))['minecraft:item'];
            const icon = item.components?.['minecraft:icon'];
            const tex = typeof icon === 'string' ? icon : (icon?.textures?.default ?? icon?.texture);
            if (tex) iconOf[item.description.identifier.replace(/^minecraft:/, '')] = tex;
        } catch {}
    }
}
const itemPaths = new Map(); // file base name → atlas path
for (const { textures } of Object.values(itemAtlas)) {
    for (const p of [textures].flat()) {
        const rel = typeof p === 'string' ? p : p?.path;
        if (rel) itemPaths.set(path.basename(rel), rel);
    }
}
function itemTexture(id) {
    if (iconOf[id] && itemAtlas[iconOf[id]]) return itemAtlas[iconOf[id]].textures;
    if (itemAtlas[id]) return itemAtlas[id].textures;
    const words = id.replace('light_gray', 'silver').split('_');
    let best = null;
    for (const [base, rel] of itemPaths) {
        const parts = base.split('_');
        if (!words.every((w) => parts.includes(w))) continue;
        const score = parts.length - words.length - (parts.includes('new') ? 0.5 : 0);
        if (!best || score < best[0]) best = [score, rel];
    }
    return best?.[1] ?? null;
}
const items = {};
let itemMisses = 0;
for (const id of itemIds) {
    if (id in blocks) continue;
    const tex = itemTexture(id);
    const lin = tex && averageOf(tex);
    if (lin) items[id] = rgb(lin);
    else itemMisses++;
}

// ---------- write ----------
const body = (obj) => Object.entries(obj).map(([k, v]) => `"${k}":${JSON.stringify(v)}`).join(',\n');
const text = `// GENERATED by tools/colorLib/generate.mjs from bedrock-samples ${version} — do not edit.
// Colors are [r, g, b] (0–255); null = none.
export const MC_VERSION = ${JSON.stringify(version)};

// Map base colors; index 0 (null) is transparent / not drawn. Shade them with MAP_SHADES.
export const mapPalette = ${JSON.stringify(palette)};

// Block flags.
export const MAP_ESTIMATED = 1; // no rule for this block: nearest map color to its top texture
export const TINTED = 2; // biome-tinted (grass, leaves, water): plains tint baked into texture and map color

// id (no namespace) → [avg, mapIndex, flags, top?, side?]
// avg weights the faces up 1 : down 1 : sides 4; top/side are only present when they differ from avg.
export const blocks = {
${body(blocks)}
};

// id (no namespace) → avg icon color. Only items that aren't blocks.
export const items = {
${body(items)}
};
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text);
// Stable: samples 1.26.40.5 ↔ vanilla-data 1.26.40. Preview: samples 1.26.60.28 ↔ 1.26.60-preview.28.
const vdVersion = require(path.join(vanillaDir, 'package.json')).version;
const vdMatches = vdVersion.includes('-preview.') ? version === vdVersion.replace('-preview.', '.') : version.startsWith(vdVersion + '.');
if (!vdMatches) console.warn(`warning: bedrock-samples ${version} but @minecraft/vanilla-data ${vdVersion}`);
console.log(`colorLib data for ${version}: ${blockIds.length} blocks, ${Object.keys(items).length} items, ${palette.length} map colors`);
console.log(`  map colors: ${stats.rule} by rule, ${stats.tinted} biome-tinted, ${stats.estimated} estimated, ${stats.none} none`);
console.log(`  blocks without texture: ${stats.noTexture}; items without icon: ${itemMisses}`);
console.log(`  wrote ${path.relative(process.cwd(), out)} (${(text.length / 1024).toFixed(1)} KB)`);

#!/usr/bin/env node
/**
 * Builds colorLib's data files from a bedrock-samples checkout (textures + metadata). No game,
 * server or npm packages needed.
 *
 *   node tools/colorLib/generate.mjs --samples <bedrock-samples> [--out <dir>]
 *
 * --samples  bedrock-samples checkout (default $BEDROCK_SAMPLES); we track the preview branch
 * --out      data folder (default: modules/JavaScript/colorLib/data)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, decodeTga } from './images.mjs';
import { BASE, ruleColor, tintOf } from './mapRules.mjs';
import { FLAGS, blockFlags } from './blockFlags.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const samples = args.samples ?? process.env.BEDROCK_SAMPLES;
if (!samples) {
    console.error('usage: node tools/colorLib/generate.mjs --samples <bedrock-samples> [--out <dir>]');
    process.exit(2);
}
const outDir = args.out ?? path.join(here, '../../modules/JavaScript/colorLib/data');
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
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
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

// Linear RGB → OKLab.
function linToOklab([r, g, b]) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

// One atlas entry value → { lin: mean linear [r,g,b], coverage: opaque share 0–1, noise } or null.
// noise = OKLab standard deviation of the pixels × 100 (0 for a flat color, ~15+ for busy textures).
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
    const labSum = [0, 0, 0];
    const labSq = [0, 0, 0];
    let weight = 0;
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const a = overlay ? 1 : d[i + 3] / 255;
        if (!a) continue;
        const mul = overlay ? (d[i + 3] === 255 ? overlay : null) : tint;
        const px = [0, 1, 2].map((c) => LIN[d[i + c]] * (mul ? mul[c] : 1));
        const lab = linToOklab(px);
        for (let c = 0; c < 3; c++) {
            sum[c] += a * px[c];
            labSum[c] += a * lab[c];
            labSq[c] += a * lab[c] * lab[c];
        }
        weight += a;
    }
    if (!weight) return null;
    const variance = labSum.reduce((v, x, c) => v + Math.max(0, labSq[c] / weight - (x / weight) ** 2), 0);
    return { lin: sum.map((v) => v / weight), coverage: weight / (d.length / 4), noise: 100 * Math.sqrt(variance) };
}

const terrain = readJson(path.join(rp, 'textures/terrain_texture.json')).texture_data;
const itemAtlas = readJson(path.join(rp, 'textures/item_texture.json')).texture_data;
const blockDefs = readJson(path.join(rp, 'blocks.json'));
const version = readJson(path.join(samples, 'version.json')).latest.version;

const terrainInfo = (name) => (terrain[name] ? averageOf(terrain[name].textures) : null);

// ---------- block and item ids (+ block state names) ----------
const vanilla = (kind) => readJson(path.join(samples, `metadata/vanilladata_modules/mojang-${kind}.json`)).data_items;
const short = (id) => id.replace(/^minecraft:/, '');
const blockStates = new Map(vanilla('blocks').map((b) => [short(b.name), (b.properties ?? []).map((p) => p.name)]));
const blockIds = [...blockStates.keys()].sort();
const itemIds = vanilla('items').map((i) => short(i.name)).sort();

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

const FLAG = FLAGS;
const blocks = {};
const noise = {};
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
    let transparent = false;
    const faceNoise = new Map();
    const face = (name) => {
        const info = terrainInfo(name);
        if (!info) return null;
        let lin = info.lin;
        if (tint && chroma(lin) < 24) {
            lin = lin.map((v, c) => v * tint[c]);
            flags |= FLAG.TINTED;
        }
        if (info.coverage < 0.999) transparent = true;
        faceNoise.set(lin, info.noise);
        return lin;
    };
    const t = def.textures;
    let up, down, side;
    const sideParts = {};
    if (typeof t === 'string') up = down = side = face(t);
    else if (t && typeof t === 'object') {
        up = face(t.up ?? t.side);
        down = face(t.down ?? t.side);
        for (const k of ['north', 'south', 'east', 'west']) sideParts[k] = face(t[k] ?? t.side);
        const sides = Object.values(sideParts).filter(Boolean);
        side = sides.length ? sides.reduce((a, b) => a.map((v, c) => v + b[c])).map((v) => v / sides.length) : null;
    }
    const faces = [[up, 1], [down, 1], [side, 4]].filter(([f]) => f);
    const w = faces.reduce((s, [, k]) => s + k, 0);
    const avg = faces.length ? faces.reduce((s, [f, k]) => s.map((v, c) => v + f[c] * k), [0, 0, 0]).map((v) => v / w) : null;
    // Side faces were averaged together, so their noise is the mean of the individual sides.
    const sideNoise = side && (faceNoise.get(side) ?? mean(['north', 'south', 'east', 'west'].map((k) => faceNoise.get(sideParts[k])).filter((n) => n !== undefined)));
    if (avg) noise[id] = Math.round(([[up, 1], [down, 1], [side, 4]].filter(([f]) => f).reduce((s, [f, k]) => s + (f === side ? sideNoise : faceNoise.get(f)) * k, 0) / w) * 10) / 10;
    flags |= blockFlags(id, blockStates.get(id) ?? [], transparent);

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
    const info = tex && averageOf(tex);
    if (info) items[id] = rgb(info.lin);
    else itemMisses++;
}

// ---------- write ----------
const body = (obj) => Object.entries(obj).map(([k, v]) => `"${k}":${JSON.stringify(v)}`).join(',\n');
const header = `// GENERATED by tools/colorLib/generate.mjs from bedrock-samples ${version} — do not edit.`;
const flagLines = {
    MAP_ESTIMATED: 'no map rule for this block: nearest map color to its top texture',
    TINTED: 'biome-tinted (grass, leaves, water): plains tint baked into texture and map color',
    FULL_CUBE: 'fills the whole block space',
    TRANSPARENT: 'see-through or cut-out texture (glass, leaves, ice)',
    GRAVITY: 'falls without a block under it (sand, gravel, concrete powder)',
    NEEDS_SUPPORT: "breaks or can't be placed without a supporting block (carpet, torch, flowers)",
    CREATIVE_ONLY: "can't be obtained and placed in survival",
    LIQUID: 'water, lava, bubble column',
};
const colors = `${header}
// Colors are [r, g, b] (0–255); null = none.
export const MC_VERSION = ${JSON.stringify(version)};

// Map base colors; index 0 (null) is transparent / not drawn. Shade them with MAP_SHADES.
export const mapPalette = ${JSON.stringify(palette)};

// Block flags (bitmask).
${Object.entries(flagLines).map(([k, why]) => `export const ${k} = ${FLAGS[k]}; // ${why}`).join('\n')}

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
const detailed = `${header}
// Texture noise per block: OKLab standard deviation of the pixels × 100, faces weighted like avg.
// 0 = flat color (concrete ~1–3); busy textures (ores, gravel) score 10+.
export const noise = {
${body(noise)}
};
`;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'colors.js'), colors);
fs.writeFileSync(path.join(outDir, 'colorsDetailed.js'), detailed);
const count = (bit) => Object.values(blocks).filter((b) => b[2] & bit).length;
console.log(`colorLib data for ${version}: ${blockIds.length} blocks, ${Object.keys(items).length} items, ${palette.length} map colors`);
console.log(`  map colors: ${stats.rule} by rule, ${stats.tinted} biome-tinted, ${stats.estimated} estimated, ${stats.none} none`);
console.log(`  flags: ${['FULL_CUBE', 'TRANSPARENT', 'GRAVITY', 'NEEDS_SUPPORT', 'CREATIVE_ONLY', 'LIQUID'].map((k) => `${k} ${count(FLAGS[k])}`).join(', ')}`);
console.log(`  blocks without texture: ${stats.noTexture}; items without icon: ${itemMisses}`);
console.log(`  wrote ${path.relative(process.cwd(), outDir)}/colors.js (${(colors.length / 1024).toFixed(1)} KB), colorsDetailed.js (${(detailed.length / 1024).toFixed(1)} KB)`);

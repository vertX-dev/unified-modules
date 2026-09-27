/**
 * colorLib.js — colors of vanilla blocks and items, for mapart, gradients and palettes.
 *     import * as colorLib from "unified/colorLib/colorLib.js"
 *
 * Block/item ids work with or without the `minecraft:` namespace. Colors are { r, g, b } (0–255).
 * Texture colors come from the vanilla textures; map colors follow Java's assignments, with Bedrock's
 * plains tint for grass, leaves and water. See data/colors.js for flags on each block.
 */
import { blocks, items, mapPalette, MAP_ESTIMATED, TINTED } from './data/colors.js';
import { toRgb, rgbToOklab, oklabDistance } from './colorMath.js';

export { MC_VERSION } from './data/colors.js';

// Map shade multipliers (/255), indexed by shade: 0 dark (lower than the block to the north),
// 1 normal (same height: flat mapart), 2 light (higher), 3 darkest (not placeable in survival).
export const MAP_SHADES = [180, 220, 255, 135];
const SHADE_SETS = { flat: [1], staircase: [0, 1, 2], all: [0, 1, 2, 3] };

// The 16 dye colors, as the game tints with them (sheep, leather, banners).
export const DYE_COLORS = {
    white: { r: 249, g: 255, b: 254 },
    orange: { r: 249, g: 128, b: 29 },
    magenta: { r: 199, g: 78, b: 189 },
    light_blue: { r: 58, g: 179, b: 218 },
    yellow: { r: 254, g: 216, b: 61 },
    lime: { r: 128, g: 199, b: 31 },
    pink: { r: 243, g: 139, b: 170 },
    gray: { r: 71, g: 79, b: 82 },
    light_gray: { r: 157, g: 157, b: 151 },
    cyan: { r: 22, g: 156, b: 156 },
    purple: { r: 137, g: 50, b: 184 },
    blue: { r: 60, g: 68, b: 170 },
    brown: { r: 131, g: 84, b: 50 },
    green: { r: 94, g: 124, b: 22 },
    red: { r: 176, g: 46, b: 38 },
    black: { r: 29, g: 29, b: 33 },
};
const COLOR_ALIASES = { silver: 'light_gray', grey: 'gray', light_grey: 'light_gray', lightblue: 'light_blue', lightgray: 'light_gray' };

const obj = (c) => (c ? { r: c[0], g: c[1], b: c[2] } : null); // data [r, g, b] → { r, g, b }
const shortId = (id) => (typeof id === 'string' ? id : (id?.typeId ?? id?.type?.id ?? '')).replace(/^minecraft:/, '');

// ---------- lookups ----------

/** Block or item info, or undefined for an unknown id. */
export function getBlockInfo(id) {
    const key = shortId(id);
    const b = blocks[key];
    if (!b) return items[key] ? { id: 'minecraft:' + key, item: true, avg: obj(items[key]) } : undefined;
    const [avg, map, flags, top = avg, side = avg] = b;
    return {
        id: 'minecraft:' + key,
        item: false,
        avg: obj(avg),
        top: obj(top),
        side: obj(side),
        mapIndex: map,
        map: obj(mapPalette[map]),
        mapEstimated: (flags & MAP_ESTIMATED) !== 0,
        tinted: (flags & TINTED) !== 0,
    };
}

/** Average texture color of a block or item; `face` is "avg" (default), "top" or "side". */
export function getColor(id, face = 'avg') {
    const key = shortId(id);
    const b = blocks[key];
    if (!b) return obj(items[key]);
    return obj(face === 'top' ? (b[3] ?? b[0]) : face === 'side' ? (b[4] ?? b[0]) : b[0]);
}

/** Map color of a block at a shade (default 1, flat), or null if it isn't drawn on maps / unknown. */
export function getMapColor(id, shade = 1) {
    const map = blocks[shortId(id)]?.[1];
    return map ? shadeColor(map, shade) : null;
}

function shadeColor(mapIndex, shade) {
    const m = MAP_SHADES[shade] ?? MAP_SHADES[1];
    const [r, g, b] = mapPalette[mapIndex];
    return { r: ((r * m) / 255) | 0, g: ((g * m) / 255) | 0, b: ((b * m) / 255) | 0 };
}

// ---------- toNearestMapColor ----------

let mapCandidates = null; // per shade set: [{ lab, rgb, base, shade }]
const nearestCache = new Map();

function candidatesFor(set) {
    mapCandidates ??= {};
    if (mapCandidates[set]) return mapCandidates[set];
    const used = new Set(Object.values(blocks).map((b) => b[1]));
    used.delete(0);
    const list = [];
    for (const base of used) {
        for (const shade of SHADE_SETS[set]) {
            const rgb = shadeColor(base, shade);
            list.push({ lab: rgbToOklab(rgb), rgb, base, shade });
        }
    }
    return (mapCandidates[set] = list);
}

/**
 * Nearest color a map can show, among map colors some block produces.
 * `shades`: "staircase" (default: dark/normal/light), "flat" (normal only) or "all" (adds darkest).
 * Returns { r, g, b, base, shade }: `base` indexes mapPalette, `shade` indexes MAP_SHADES.
 * Also accepts ({ r, g, b }), ("#rrggbb") or (0xRRGGBB) in place of (r, g, b).
 */
export function toNearestMapColor(r, g, b, shades = 'staircase') {
    let rgb;
    if (typeof r === 'number' && typeof g === 'number') rgb = { r, g, b };
    else {
        rgb = toRgb(r);
        if (typeof g === 'string') shades = g; // toNearestMapColor("#3a6ea5", "flat")
    }
    if (!SHADE_SETS[shades]) throw new RangeError(`colorLib: shades must be "flat", "staircase" or "all", got "${shades}"`);
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v) || 0));
    rgb = { r: clamp(rgb.r), g: clamp(rgb.g), b: clamp(rgb.b) };
    const key = `${shades}:${(rgb.r << 16) | (rgb.g << 8) | rgb.b}`;
    let hit = nearestCache.get(key);
    if (!hit) {
        const lab = rgbToOklab(rgb);
        let bestD = Infinity;
        for (const c of candidatesFor(shades)) {
            const d = oklabDistance(lab, c.lab);
            if (d < bestD) [hit, bestD] = [c, d];
        }
        if (nearestCache.size >= 65536) nearestCache.clear();
        nearestCache.set(key, hit);
    }
    return { ...hit.rgb, base: hit.base, shade: hit.shade };
}

// ---------- find16Colors ----------

function colorName(color) {
    const name = String(color).toLowerCase().replace(/^minecraft:/, '').replace(/[\s-]+/g, '_');
    const resolved = COLOR_ALIASES[name] ?? name;
    if (!DYE_COLORS[resolved]) {
        throw new RangeError(`colorLib: unknown color "${color}" (expected one of ${Object.keys(DYE_COLORS).join(', ')})`);
    }
    return resolved;
}

// Does the id name this color as a word? `blue` matches blue_wool, not light_blue_wool; light_gray also matches silver_*.
function namesColor(id, name) {
    const words = id.split('_');
    for (let i = 0; i < words.length; i++) {
        if (name === 'light_gray' && words[i] === 'silver') return true;
        if (name.startsWith('light_')) {
            if (words[i] === 'light' && words[i + 1] === name.slice(6)) return true;
        } else if (words[i] === name && words[i - 1] !== 'light') return true;
    }
    return false;
}

let labCache = null; // data color array → OKLab, shared by every find16Colors call

/**
 * Blocks and items whose texture is close to one of the 16 dye colors.
 *   color      "red", "light_blue", … ("silver", "grey" work too)
 *   maxAmount  most results to return (default: all)
 *   maxDiff    largest OKLab distance ×100 from the dye color (default 10; wool/concrete of that color are within ~8)
 *   checkName  also include ids that name the color (red_terracotta, red_nether_brick) even when
 *              their texture is further off than maxDiff
 *   options    { source: "all" | "blocks" | "items" }
 * Returns Map<"minecraft:id", { r, g, b }> of average texture colors, closest first.
 */
export function find16Colors(color, maxAmount = Infinity, maxDiff = 10, checkName = false, { source = 'all' } = {}) {
    const name = colorName(color);
    const ref = rgbToOklab(DYE_COLORS[name]);
    labCache ??= new Map();
    const hits = [];
    const consider = (id, color) => {
        if (!color) return;
        let lab = labCache.get(color);
        if (!lab) labCache.set(color, (lab = rgbToOklab(obj(color))));
        const d = oklabDistance(ref, lab);
        if (d <= maxDiff || (checkName && namesColor(id, name))) hits.push([id, color, d]);
    };
    if (source !== 'items') for (const id in blocks) consider(id, blocks[id][0]);
    if (source !== 'blocks') for (const id in items) consider(id, items[id]);
    hits.sort((a, b) => a[2] - b[2]);
    const limit = maxAmount == null || maxAmount < 0 ? Infinity : maxAmount;
    return new Map(hits.slice(0, limit).map(([id, color]) => ['minecraft:' + id, obj(color)]));
}

// ---------- mapArrayColors ----------

/**
 * Map colors for a list of blocks (e.g. the top blocks of a mapart, row by row).
 *   blockIds  ids ("minecraft:stone" / "stone") or anything with a typeId (Block, BlockPermutation)
 *   shades    one shade for all (default 1, flat) or an array with a shade per block
 * Returns an array of { r, g, b }, with null where the block isn't drawn on maps or is unknown.
 */
export function mapArrayColors(blockIds, shades = 1) {
    const out = new Array(blockIds.length);
    for (let i = 0; i < blockIds.length; i++) {
        const map = blocks[shortId(blockIds[i])]?.[1];
        out[i] = map ? shadeColor(map, Array.isArray(shades) ? shades[i] : shades) : null;
    }
    return out;
}

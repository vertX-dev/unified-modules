/**
 * colorLib.js — colors of vanilla blocks and items, for mapart, gradients and palettes.
 *     import * as colorLib from "./unified/colorLib/colorLib.js"
 *
 * Block/item ids work with or without the `minecraft:` namespace; results use full ids.
 * Colors come back as { r, g, b } (0–255). Anywhere a color goes in, you can pass { r, g, b },
 * [r, g, b], "#rrggbb" or 0xRRGGBB.
 * Texture colors come from the vanilla textures; map colors follow Java's assignments, with Bedrock's
 * plains tint for grass, leaves and water. See data/colors.js for the flags on each block.
 */
import {
    blocks,
    items,
    mapPalette,
    MAP_ESTIMATED,
    TINTED,
    FULL_CUBE,
    TRANSPARENT,
    GRAVITY,
    NEEDS_SUPPORT,
    CREATIVE_ONLY,
    LIQUID,
} from './data/colors.js';
import { toRgb, rgbToOklab, oklabDistance } from './colorMath.js';

export {
    MC_VERSION,
    MAP_ESTIMATED,
    TINTED,
    FULL_CUBE,
    TRANSPARENT,
    GRAVITY,
    NEEDS_SUPPORT,
    CREATIVE_ONLY,
    LIQUID,
} from './data/colors.js';
export { mapartFromImage, mapartJob, blockArt, blockArtJob } from './colorImage.js';

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
const fullId = (id) => 'minecraft:' + id;
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v) || 0));
const colorKey = ({ r, g, b }) => (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);

function shadeSet(shades) {
    const set = SHADE_SETS[shades];
    if (!set) throw new RangeError(`colorLib: shades must be "flat", "staircase" or "all", got "${shades}"`);
    return set;
}

function shadeColor(mapIndex, shade) {
    const m = MAP_SHADES[shade] ?? MAP_SHADES[1];
    const [r, g, b] = mapPalette[mapIndex];
    return { r: ((r * m) / 255) | 0, g: ((g * m) / 255) | 0, b: ((b * m) / 255) | 0 };
}

// ---------- lookups ----------

/** Flags of a block as booleans, or undefined for an unknown id. */
export function getFlags(id) {
    const b = blocks[shortId(id)];
    if (!b) return undefined;
    const f = b[2];
    return {
        fullCube: (f & FULL_CUBE) !== 0,
        transparent: (f & TRANSPARENT) !== 0,
        gravity: (f & GRAVITY) !== 0,
        needsSupport: (f & NEEDS_SUPPORT) !== 0,
        creativeOnly: (f & CREATIVE_ONLY) !== 0,
        liquid: (f & LIQUID) !== 0,
        mapEstimated: (f & MAP_ESTIMATED) !== 0,
        tinted: (f & TINTED) !== 0,
    };
}

/** Block or item info, or undefined for an unknown id. */
export function getBlockInfo(id) {
    const key = shortId(id);
    const b = blocks[key];
    if (!b) return items[key] ? { id: fullId(key), item: true, avg: obj(items[key]) } : undefined;
    const [avg, map, , top = avg, side = avg] = b;
    return {
        id: fullId(key),
        item: false,
        avg: obj(avg),
        top: obj(top),
        side: obj(side),
        mapIndex: map,
        map: obj(mapPalette[map]),
        ...getFlags(key),
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

/**
 * Can this block be part of a mapart? It must be drawn on maps, and by default obtainable in survival
 * and not a liquid. Options: { survival = true, gravity = true, support = true, liquids = false }.
 * Set gravity/support to false to also reject sand-like blocks / blocks that need one under them.
 */
export function isPlaceableForMapart(id, { survival = true, gravity = true, support = true, liquids = false } = {}) {
    const b = blocks[shortId(id)];
    if (!b || !b[1]) return false;
    const f = b[2];
    if (survival && f & CREATIVE_ONLY) return false;
    if (!gravity && f & GRAVITY) return false;
    if (!support && f & NEEDS_SUPPORT) return false;
    if (!liquids && f & LIQUID) return false;
    return true;
}

/**
 * Color of an id, Block, BlockPermutation or ItemStack.
 *   { face = "avg" | "top" | "side", mode = "texture" | "map", shade = 1 }
 * Dyed leather items return their dye color. In map mode a placed Block uses the game's own map
 * color when it has one (tinted by the block's real biome); otherwise the library data.
 */
export function colorOf(thing, { face = 'avg', mode = 'texture', shade = 1 } = {}) {
    if (thing && typeof thing === 'object' && typeof thing.getComponent === 'function') {
        const unit = (c) => ({ r: Math.round(c.red * 255), g: Math.round(c.green * 255), b: Math.round(c.blue * 255) });
        try {
            const dye = mode === 'texture' && thing.getComponent('minecraft:dyeable')?.color;
            if (dye) return unit(dye);
            const map = mode === 'map' && thing.getComponent('minecraft:map_color')?.tintedColor;
            if (map) {
                const m = MAP_SHADES[shade] ?? MAP_SHADES[1];
                const c = unit(map);
                return { r: ((c.r * m) / 255) | 0, g: ((c.g * m) / 255) | 0, b: ((c.b * m) / 255) | 0 };
            }
        } catch {
            // unloaded block or a component this object doesn't have: fall back to the data
        }
    }
    return mode === 'map' ? getMapColor(thing, shade) : getColor(thing, face);
}

// ---------- palettes ----------

const STONE = /^(stone|cobblestone|mossy_cobblestone|smooth_stone|stone_bricks|mossy_stone_bricks|cracked_stone_bricks|chiseled_stone_bricks|(polished_)?(andesite|diorite|granite|tuff|blackstone|basalt|deepslate)|cobbled_deepslate|deepslate_(bricks|tiles)|cracked_deepslate_(bricks|tiles)|chiseled_deepslate|tuff_bricks|chiseled_tuff(_bricks)?|polished_blackstone_bricks|chiseled_polished_blackstone|smooth_basalt|calcite|dripstone_block|end_stone|end_bricks|(chiseled_|cut_|smooth_)?(red_)?sandstone|bricks|brick_block|mud_bricks|packed_mud|prismarine|prismarine_bricks|dark_prismarine|(chiseled_|cracked_)?nether_brick|red_nether_brick|netherrack|quartz_block|quartz_bricks|smooth_quartz|purpur_block|obsidian)$/;
const has = (f, bit) => (f & bit) !== 0;
// Full, opaque, stable blocks. Double slabs are left out: they look exactly like their base block.
const solid = (id, f) => has(f, FULL_CUBE) && !has(f, TRANSPARENT) && !has(f, GRAVITY) && !has(f, LIQUID) && !/_double_slab$/.test(id);

// name → (id, [avg, map, flags]) → boolean. Every preset also needs a texture color.
const PRESETS = {
    all: () => true,
    solid: (id, b) => solid(id, b[2]),
    survival: (id, b) => !has(b[2], CREATIVE_ONLY),
    solid_survival: (id, b) => solid(id, b[2]) && !has(b[2], CREATIVE_ONLY),
    mapart: (id) => isPlaceableForMapart(id),
    mapart_creative: (id) => isPlaceableForMapart(id, { survival: false }),
    wool: (id) => /_wool$/.test(id),
    carpet: (id) => /_carpet$/.test(id),
    concrete: (id) => /_concrete$/.test(id),
    concrete_powder: (id) => /_concrete_powder$/.test(id),
    terracotta: (id) => id === 'hardened_clay' || (/_terracotta$/.test(id) && !/_glazed_terracotta$/.test(id)),
    glazed_terracotta: (id) => /_glazed_terracotta$/.test(id),
    stained_glass: (id) => /^(?!hard_)[a-z_]+_stained_glass$/.test(id),
    planks: (id) => /_planks$/.test(id),
    logs: (id, b) => /_(log|stem|wood|hyphae)$|^bamboo_block$/.test(id) && has(b[2], FULL_CUBE),
    stone: (id) => STONE.test(id),
    ores: (id) => /_ore$/.test(id) && !/^lit_/.test(id),
};
export const PALETTE_PRESETS = Object.freeze(Object.keys(PRESETS));

const paletteCache = new Map();

function resolvePalette(spec) {
    if (spec && typeof spec === 'object' && spec.__colorLibPalette) return spec.__colorLibPalette;
    const cacheable = typeof spec === 'string' || (Array.isArray(spec) && spec.every((s) => typeof s === 'string'));
    const key = cacheable ? JSON.stringify(spec) : null;
    if (key && paletteCache.has(key)) return paletteCache.get(key);

    const o = typeof spec === 'string' || Array.isArray(spec) ? { presets: [spec].flat() } : { presets: ['all'], ...spec };
    const addPreset = (set, name) => {
        const test = PRESETS[name];
        if (test) {
            for (const id in blocks) if (blocks[id][0] && test(id, blocks[id])) set.add(id);
            return;
        }
        const id = shortId(name);
        if (!blocks[id]) throw new RangeError(`colorLib: "${name}" is neither a palette preset (${PALETTE_PRESETS.join(', ')}) nor a block id`);
        set.add(id);
    };
    const set = new Set();
    for (const p of o.presets ?? ['all']) addPreset(set, p);
    for (const p of o.include ?? []) addPreset(set, p);
    for (const p of o.exclude ?? []) {
        const drop = new Set();
        addPreset(drop, p);
        for (const id of drop) set.delete(id);
    }
    const ids = [...set].filter((id) => {
        const f = blocks[id][2];
        if (o.require && (f & o.require) !== o.require) return false;
        if (o.forbid && f & o.forbid) return false;
        return !o.filter || o.filter(fullId(id));
    });
    const result = { ids, key: key ?? `custom:${paletteCache.size}:${Math.random()}` };
    if (key) paletteCache.set(key, result);
    return result;
}

/**
 * Build a palette (a list of block ids) to pass as the `palette` option elsewhere.
 *   palette("wool")                                   a preset (see PALETTE_PRESETS)
 *   palette(["concrete", "minecraft:white_wool"])     presets and ids mixed
 *   palette({ presets: ["concrete", "terracotta"], include: [...], exclude: [...],
 *             require: FULL_CUBE, forbid: GRAVITY | TRANSPARENT, filter: (id) => boolean })
 * Returns a frozen array of full ids (usable directly as a palette).
 */
export function palette(spec = 'all') {
    const resolved = resolvePalette(spec);
    const list = Object.freeze(Object.assign(resolved.ids.map(fullId), { __colorLibPalette: resolved }));
    return list;
}

// ---------- nearest block ----------

// Candidate lists per (palette, mode, face/shades): [{ id, ids, rgb, lab, shade? }].
const candidateCache = new Map();

// Blocks sharing a map color, best-for-building first: full, opaque, stable blocks, and among
// those the usual mapart staples (concrete, wool, terracotta, planks), then shorter (plainer) ids.
const STAPLE = /_(concrete|wool|terracotta|planks)$/;
function buildScore(id) {
    const f = blocks[id][2];
    return (
        (has(f, FULL_CUBE) ? 8 : 0) +
        (has(f, TRANSPARENT) ? 0 : 4) +
        (has(f, GRAVITY) ? 0 : 2) +
        (has(f, NEEDS_SUPPORT) ? 0 : 1) +
        (STAPLE.test(id) && !/glazed/.test(id) ? 0.5 : 0) -
        id.length / 100
    );
}

function candidates(pal, mode, face, shades) {
    const key = `${pal.key}|${mode}|${mode === 'map' ? shades : face}`;
    let list = candidateCache.get(key);
    if (list) return list;
    list = [];
    if (mode === 'map') {
        const byBase = new Map();
        for (const id of pal.ids) {
            const map = blocks[id][1];
            if (!map) continue;
            if (!byBase.has(map)) byBase.set(map, []);
            byBase.get(map).push(id);
        }
        for (const [base, ids] of byBase) {
            ids.sort((a, b) => buildScore(b) - buildScore(a));
            for (const shade of shadeSet(shades)) {
                const rgb = shadeColor(base, shade);
                list.push({ id: ids[0], ids, rgb, lab: rgbToOklab(rgb), base, shade });
            }
        }
    } else {
        if (!['avg', 'top', 'side'].includes(face)) throw new RangeError(`colorLib: face must be "avg", "top" or "side", got "${face}"`);
        for (const id of pal.ids) {
            const rgb = getColor(id, face);
            if (rgb) list.push({ id, ids: [id], rgb, lab: rgbToOklab(rgb) });
        }
    }
    candidateCache.set(key, list);
    return list;
}

function readNearestOpts({ palette: pal, mode = 'texture', face = 'avg', shades = 'staircase', penalty } = {}) {
    if (mode !== 'texture' && mode !== 'map') throw new RangeError(`colorLib: mode must be "texture" or "map", got "${mode}"`);
    const resolved = resolvePalette(pal ?? (mode === 'map' ? 'mapart' : 'solid_survival'));
    return { list: candidates(resolved, mode, face, shades), mode, penalty };
}

function toResult(c, distance, mode) {
    const out = { id: fullId(c.id), color: { ...c.rgb }, distance };
    if (mode === 'map') Object.assign(out, { shade: c.shade, base: c.base, ids: c.ids.map(fullId) });
    return out;
}

// n nearest candidates to an OKLab color; `exclude` is a Set of short ids to skip.
function searchLab(lab, n, { list, penalty }, exclude) {
    if (n === 1 && !penalty && !exclude) {
        // Hot path for images: compare squared distances, no allocation.
        const [L, A, B] = lab;
        let best = null;
        let bestSq = Infinity;
        for (let i = 0; i < list.length; i++) {
            const q = list[i].lab;
            const dl = q[0] - L;
            const da = q[1] - A;
            const db = q[2] - B;
            const sq = dl * dl + da * da + db * db;
            if (sq < bestSq) [best, bestSq] = [list[i], sq];
        }
        return best ? [[best, 100 * Math.sqrt(bestSq)]] : [];
    }
    const best = [];
    for (const c of list) {
        if (exclude?.has(c.id)) continue;
        const d = oklabDistance(lab, c.lab) + (penalty ? penalty(fullId(c.id)) : 0);
        if (best.length < n || d < best[best.length - 1][1]) {
            let i = best.length;
            while (i > 0 && best[i - 1][1] > d) i--;
            best.splice(i, 0, [c, d]);
            if (best.length > n) best.pop();
        }
    }
    return best;
}

/**
 * The n blocks whose color is closest to `color`, closest first.
 *   { palette   preset name, id list or palette() result
 *               (default "solid_survival" in texture mode, "mapart" in map mode)
 *     mode      "texture" (default): compare texture colors; "map": compare map colors
 *     face      texture mode: "avg" (default), "top" (floors, top-down) or "side" (walls)
 *     shades    map mode: "staircase" (default), "flat" or "all"
 *     penalty   (id) => number added to each block's distance (e.g. colorLibDetailed.noisePenalty()) }
 * Returns [{ id, color, distance }]. Map mode adds { shade, base, ids }: one entry per map color
 * and shade, `id` being the best block to build it with and `ids` every palette block that has it.
 */
export function nearestBlocks(color, n = 5, opts = {}) {
    const o = readNearestOpts(opts);
    return searchLab(rgbToOklab(toRgb(color)), n, o).map(([c, d]) => toResult(c, d, o.mode));
}

/** The single closest block (see nearestBlocks for options), or null if the palette is empty. */
export function nearestBlock(color, opts = {}) {
    return nearestBlocks(color, 1, opts)[0] ?? null;
}

/**
 * A fast single-color matcher for bulk work (used by the image functions): same options as
 * nearestBlocks, results cached by color. Returns (rgb) => { id, ids, rgb, shade?, base? } | null.
 */
export function createMatcher(opts = {}) {
    const o = readNearestOpts(opts);
    const cache = new Map();
    return (rgb) => {
        const key = colorKey(rgb);
        let hit = cache.get(key);
        if (hit === undefined) {
            hit = searchLab(rgbToOklab(rgb), 1, o)[0]?.[0] ?? null;
            if (cache.size >= 1 << 17) cache.clear();
            cache.set(key, hit);
        }
        return hit;
    };
}

// ---------- map colors ----------

let mapCandidates = null; // per shade set: [{ lab, rgb, base, shade }]
const nearestCache = new Map();

function mapCandidatesFor(set) {
    mapCandidates ??= {};
    if (mapCandidates[set]) return mapCandidates[set];
    const used = new Set(Object.values(blocks).map((b) => b[1]));
    used.delete(0);
    const list = [];
    for (const base of used) {
        for (const shade of shadeSet(set)) {
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
 * Also accepts any color form in place of (r, g, b): toNearestMapColor("#3a6ea5", "flat").
 */
export function toNearestMapColor(r, g, b, shades = 'staircase') {
    let rgb;
    if (typeof r === 'number' && typeof g === 'number') rgb = { r, g, b };
    else {
        rgb = toRgb(r);
        if (typeof g === 'string') shades = g;
    }
    shadeSet(shades);
    rgb = { r: clamp(rgb.r), g: clamp(rgb.g), b: clamp(rgb.b) };
    const key = `${shades}:${colorKey(rgb)}`;
    let hit = nearestCache.get(key);
    if (!hit) {
        const lab = rgbToOklab(rgb);
        let bestD = Infinity;
        for (const c of mapCandidatesFor(shades)) {
            const d = oklabDistance(lab, c.lab);
            if (d < bestD) [hit, bestD] = [c, d];
        }
        if (nearestCache.size >= 65536) nearestCache.clear();
        nearestCache.set(key, hit);
    }
    return { ...hit.rgb, base: hit.base, shade: hit.shade };
}

/**
 * The nearest map color to `color` that the palette can build, and the blocks that build it.
 *   { palette = "mapart", shades = "staircase" }
 * Returns { r, g, b, base, shade, ids } (ids best-for-building first), or null for an empty palette.
 */
export function mapColorToBlocks(color, { palette: pal = 'mapart', shades = 'staircase' } = {}) {
    const hit = nearestBlock(color, { palette: pal, mode: 'map', shades });
    return hit && { ...hit.color, base: hit.base, shade: hit.shade, ids: hit.ids };
}

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

// ---------- gradients ----------

/**
 * Blocks fading between colors or blocks, interpolated in OKLab.
 *   gradient(from, to, steps, opts) or gradient([stop, stop, ...], steps, opts)
 *   Stops are colors or block ids; a block stop is used as-is at its position.
 *   { palette = "solid_survival", face = "avg", unique = false (never repeat a block), penalty }
 * Returns an array of `steps` full ids.
 */
export function gradient(...args) {
    const [stops, steps, opts = {}] = Array.isArray(args[0]) ? args : [[args[0], args[1]], args[2], args[3]];
    if (stops.length < 2) throw new RangeError('colorLib: gradient needs at least 2 stops');
    if (!(steps >= 2)) throw new RangeError('colorLib: gradient needs at least 2 steps');
    const { face = 'avg', unique = false } = opts;
    const o = readNearestOpts({ ...opts, mode: 'texture', face });
    const isBlockId = (s) => typeof s === 'string' && !s.startsWith('#') && blocks[shortId(s)] !== undefined;
    const points = stops.map((s) => {
        const rgb = isBlockId(s) ? getColor(s, face) : toRgb(s);
        if (!rgb) throw new RangeError(`colorLib: gradient stop "${s}" has no color`);
        return { lab: rgbToOklab(rgb), id: isBlockId(s) ? shortId(s) : null };
    });
    const used = unique ? new Set() : null;
    const out = [];
    for (let i = 0; i < steps; i++) {
        const t = (i / (steps - 1)) * (points.length - 1);
        const k = Math.min(Math.floor(t), points.length - 2);
        const f = t - k;
        const [a, b] = [points[k], points[k + 1]];
        const exact = f === 0 ? a.id : f === 1 ? b.id : null;
        let id = exact && !used?.has(exact) ? exact : null;
        if (!id) {
            const lab = a.lab.map((v, c) => v + (b.lab[c] - v) * f);
            id = (searchLab(lab, 1, o, used)[0] ?? searchLab(lab, 1, o)[0])?.[0].id;
            if (!id) throw new RangeError('colorLib: gradient palette has no blocks with a color');
        }
        used?.add(id);
        out.push(fullId(id));
    }
    return out;
}

// ---------- sorting and grouping ----------

// OKLCh of a block/item color: [lightness 0–1, chroma, hue degrees].
function lch(id, face) {
    const rgb = getColor(id, face);
    if (!rgb) return null;
    const [L, a, b] = rgbToOklab(rgb);
    return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}
const NEUTRAL_CHROMA = 0.04;

/**
 * Sort ids by color: by = "hue" (rainbow; grays last, dark to light), "lightness" (dark → light)
 * or "saturation" (dull → vivid). { face = "avg", reverse = false }. Ids without a color go last.
 */
export function sortByColor(ids, by = 'hue', { face = 'avg', reverse = false } = {}) {
    const keyOf = {
        hue: ([L, C, h]) => (C < NEUTRAL_CHROMA ? 1000 + L : h),
        lightness: ([L]) => L,
        saturation: ([, C]) => C,
    }[by];
    if (!keyOf) throw new RangeError(`colorLib: sort by "hue", "lightness" or "saturation", got "${by}"`);
    const rows = ids.map((id) => [fullId(shortId(id)), lch(shortId(id), face)]);
    const known = rows.filter(([, c]) => c).sort((a, b) => keyOf(a[1]) - keyOf(b[1]));
    if (reverse) known.reverse();
    return [...known, ...rows.filter(([, c]) => !c)].map(([id]) => id);
}

// Hue buckets: name → OKLCh hue center.
export const HUE_GROUPS = {
    red: 25,
    orange: 55,
    yellow: 95,
    yellow_green: 125,
    green: 150,
    teal: 170,
    cyan: 200,
    azure: 230,
    blue: 265,
    violet: 290,
    purple: 315,
    magenta: 345,
};

/**
 * Group ids by hue into HUE_GROUPS names plus "neutral" (grays, black, white).
 * { face = "avg" }. Returns Map<group, ids[]> in rainbow order; each group sorted dark → light.
 */
export function groupByHue(ids, { face = 'avg' } = {}) {
    const groups = new Map([...Object.keys(HUE_GROUPS), 'neutral'].map((g) => [g, []]));
    for (const raw of ids) {
        const id = shortId(raw);
        const c = lch(id, face);
        if (!c) continue;
        let group = 'neutral';
        if (c[1] >= NEUTRAL_CHROMA) {
            let bestD = Infinity;
            for (const [name, center] of Object.entries(HUE_GROUPS)) {
                const d = Math.min(Math.abs(c[2] - center), 360 - Math.abs(c[2] - center));
                if (d < bestD) [group, bestD] = [name, d];
            }
        }
        groups.get(group).push([fullId(id), c[0]]);
    }
    const out = new Map();
    for (const [g, list] of groups) if (list.length) out.set(g, list.sort((a, b) => a[1] - b[1]).map(([id]) => id));
    return out;
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
    return new Map(hits.slice(0, limit).map(([id, color]) => [fullId(id), obj(color)]));
}

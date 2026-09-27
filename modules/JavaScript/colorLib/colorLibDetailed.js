/**
 * colorLibDetailed.js — optional texture-noise data on top of colorLib (`--with detailed`).
 *     import * as detailed from "./unified/colorLib/colorLibDetailed.js"
 *
 * Noise is how busy a block's texture is: the OKLab standard deviation of its pixels × 100.
 * Concrete scores ~0–1, wool ~3, planks ~8, ores and glowstone 10–20. Adding it to match
 * distances steers colorLib toward plain blocks, which read better in pixel art and mapart.
 */
import { noise } from './data/colorsDetailed.js';
import { nearestBlocks as coreNearestBlocks } from './colorLib.js';

const shortId = (id) => (typeof id === 'string' ? id : (id?.typeId ?? id?.type?.id ?? '')).replace(/^minecraft:/, '');

/** Texture noise of a block, or null for an unknown id / a block without a texture. */
export function getNoise(id) {
    return noise[shortId(id)] ?? null;
}

/**
 * A `penalty` option for colorLib's matching functions (nearestBlocks, gradient, mapartFromImage,
 * blockArt, …): adds noise × weight to each block's distance. Blocks without data get `missing`.
 */
export function noisePenalty(weight = 0.5, missing = 0) {
    return (id) => (noise[shortId(id)] ?? missing) * weight;
}

/** colorLib.nearestBlocks, preferring plain textures: extra option `noiseWeight` (default 0.5). */
export function nearestBlocks(color, n = 5, { noiseWeight = 0.5, ...opts } = {}) {
    return coreNearestBlocks(color, n, { ...opts, penalty: combine(opts.penalty, noisePenalty(noiseWeight)) });
}

/** colorLib.nearestBlock, preferring plain textures (see nearestBlocks). */
export function nearestBlock(color, opts = {}) {
    return nearestBlocks(color, 1, opts)[0] ?? null;
}

/** Ids sorted from plainest to busiest texture; ids without data go last. */
export function sortByNoise(ids, { reverse = false } = {}) {
    const known = ids.filter((id) => getNoise(id) !== null).sort((a, b) => getNoise(a) - getNoise(b));
    if (reverse) known.reverse();
    return [...known, ...ids.filter((id) => getNoise(id) === null)].map((id) => 'minecraft:' + shortId(id));
}

function combine(a, b) {
    return a ? (id) => a(id) + b(id) : b;
}

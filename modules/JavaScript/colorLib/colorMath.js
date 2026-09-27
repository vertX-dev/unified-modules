/**
 * colorMath.js — color conversions and distance used by colorLib.
 *     import { rgbToOklab, distance } from "unified/colorLib/colorMath.js"
 * Colors are { r, g, b } with 0–255 channels unless noted; OKLab is [L, a, b].
 */

const LINEAR = Array.from({ length: 256 }, (_, i) => {
    const v = i / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

export const srgbToLinear = (v) => LINEAR[Math.max(0, Math.min(255, Math.round(v)))];

export function linearToSrgb(v) {
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(255 * Math.max(0, Math.min(1, s)));
}

// 0xRRGGBB → { r, g, b }
export const unpack = (c) => ({ r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255 });
export const pack = ({ r, g, b }) => (r << 16) | (g << 8) | b;

export function hexToRgb(hex) {
    const h = hex.replace(/^#/, '');
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    if (!/^[0-9a-f]{6}$/i.test(full)) throw new TypeError(`colorLib: bad hex color "${hex}"`);
    return unpack(parseInt(full, 16));
}

export const rgbToHex = ({ r, g, b }) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);

// Accepts (r, g, b), ({ r, g, b }), ("#rrggbb") or (0xRRGGBB) → { r, g, b }.
export function toRgb(r, g, b) {
    if (typeof r === 'object' && r) return { r: r.r, g: r.g, b: r.b };
    if (typeof r === 'string') return hexToRgb(r);
    if (g === undefined && typeof r === 'number') return unpack(r);
    return { r, g, b };
}

export function rgbToOklab({ r, g, b }) {
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

export function oklabToRgb([L, A, B]) {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return {
        r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    };
}

// Perceptual distance: OKLab Euclidean × 100. ~1 is barely visible, ~10 is clearly different.
export function oklabDistance(p, q) {
    return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

export const distance = (a, b) => oklabDistance(rgbToOklab(a), rgbToOklab(b));

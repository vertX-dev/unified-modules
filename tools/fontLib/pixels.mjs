// Image → glyph pixel helpers for build.mjs. Masks are { width, height, ink: Uint8Array } (1 = ink).
import zlib from 'node:zlib';

/**
 * Which pixels are ink. `channel`: "alpha" (transparent background), "luma" (dark ink on light;
 * `invert` for light on dark) or "auto" (alpha when the image has any transparency, else luma).
 */
export function inkMask(img, { channel = 'auto', threshold = 128, invert = false } = {}) {
    const { width, height, data } = img;
    let mode = channel;
    if (mode === 'auto') {
        mode = 'luma';
        for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { mode = 'alpha'; break; }
    }
    const ink = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
        const o = i * 4;
        let on;
        if (mode === 'alpha') on = data[o + 3] >= threshold;
        else {
            const luma = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
            on = data[o + 3] >= 128 && luma < threshold;
        }
        ink[i] = on !== invert ? 1 : 0;
    }
    return { width, height, ink };
}

export function crop(mask, x0, y0, w, h) {
    const ink = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const sx = x0 + x;
            const sy = y0 + y;
            ink[y * w + x] = sx < mask.width && sy < mask.height ? mask.ink[sy * mask.width + sx] : 0;
        }
    }
    return { width: w, height: h, ink };
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * Size of one "font pixel" in an upscaled drawing: the GCD of every run of equal pixels along rows
 * and columns, ignoring runs that touch the edge (margins can be any size). 1 = not upscaled.
 */
export function detectPixelSize(masks) {
    let g = 0;
    const runs = (get, len, lines) => {
        for (let l = 0; l < lines; l++) {
            let start = 0;
            for (let i = 1; i <= len; i++) {
                if (i === len || get(l, i) !== get(l, start)) {
                    if (start > 0 && i < len) g = gcd(g, i - start);
                    start = i;
                }
            }
        }
    };
    for (const m of masks) {
        runs((y, x) => m.ink[y * m.width + x], m.width, m.height);
        runs((x, y) => m.ink[y * m.width + x], m.height, m.width);
    }
    return g || 1;
}

/** Take one sample from the middle of each `size`×`size` block. */
export function downsample(mask, size) {
    if (size === 1) return mask;
    const width = Math.floor(mask.width / size);
    const height = Math.floor(mask.height / size);
    const ink = new Uint8Array(width * height);
    const half = size >> 1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) ink[y * width + x] = mask.ink[(y * size + half) * mask.width + x * size + half];
    return { width, height, ink };
}

/**
 * Resample a drawing (not pixel art) to `rows` rows by area coverage: each output pixel is ink when
 * at least `coverage` of the source area under it is ink. Width keeps the aspect ratio.
 */
export function resample(mask, rows, coverage = 0.5) {
    const f = mask.height / rows;
    const width = Math.max(1, Math.round(mask.width / f));
    const fx = mask.width / width;
    const ink = new Uint8Array(width * rows);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < width; x++) {
            let on = 0;
            let total = 0;
            for (let sy = Math.floor(y * f); sy < Math.min(mask.height, Math.ceil((y + 1) * f)); sy++) {
                for (let sx = Math.floor(x * fx); sx < Math.min(mask.width, Math.ceil((x + 1) * fx)); sx++) {
                    on += mask.ink[sy * mask.width + sx];
                    total++;
                }
            }
            ink[y * width + x] = total && on / total >= coverage ? 1 : 0;
        }
    }
    return { width, height: rows, ink };
}

export function toRows(mask) {
    const rows = [];
    for (let y = 0; y < mask.height; y++) {
        let r = '';
        for (let x = 0; x < mask.width; x++) r += mask.ink[y * mask.width + x] ? '#' : ' ';
        rows.push(r);
    }
    return rows;
}

/** Crop empty columns on both sides. An empty glyph keeps its width. */
export function trimX(rows) {
    let left = Infinity;
    let right = -1;
    for (const r of rows) {
        const a = r.indexOf('#');
        if (a >= 0) {
            left = Math.min(left, a);
            right = Math.max(right, r.lastIndexOf('#'));
        }
    }
    return right < 0 ? rows : rows.map((r) => r.slice(left, right + 1));
}

/** Minimal PNG writer (RGBA8), for previews and test fixtures. */
export function encodePng(width, height, rgba) {
    const chunk = (type, body) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(body.length);
        const td = Buffer.concat([Buffer.from(type, 'latin1'), body]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(zlib.crc32(td) >>> 0);
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

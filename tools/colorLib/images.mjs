// Minimal PNG + TGA decoders (Node built-ins only). Both return { width, height, data } with
// `data` as RGBA8 bytes, row-major, top row first.
import { inflateSync } from 'node:zlib';

export function decodePng(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
    let pos = 8;
    let width, height, depth, type, interlace;
    let palette = null;
    let trns = null;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const kind = buf.toString('latin1', pos + 4, pos + 8);
        const body = buf.subarray(pos + 8, pos + 8 + len);
        pos += 12 + len;
        if (kind === 'IHDR') {
            width = body.readUInt32BE(0);
            height = body.readUInt32BE(4);
            depth = body[8];
            type = body[9];
            interlace = body[12];
        } else if (kind === 'PLTE') palette = body;
        else if (kind === 'tRNS') trns = body;
        else if (kind === 'IDAT') idat.push(body);
        else if (kind === 'IEND') break;
    }
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
    const bpp = Math.max(1, (channels * depth) >> 3); // bytes per pixel for filtering
    const raw = inflateSync(Buffer.concat(idat));
    const data = Buffer.alloc(width * height * 4);
    // Adam7 passes as [x0, y0, dx, dy]; a non-interlaced image is one pass over everything.
    const passes = interlace
        ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
        : [[0, 0, 1, 1]];
    let offset = 0;
    for (const [x0, y0, dx, dy] of passes) {
        const w = Math.ceil((width - x0) / dx);
        const h = Math.ceil((height - y0) / dy);
        if (w <= 0 || h <= 0) continue;
        const stride = (w * channels * depth + 7) >> 3;
        const rows = unfilter(raw.subarray(offset, offset + h * (stride + 1)), stride, h, bpp);
        offset += h * (stride + 1);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                writePixel(data, ((y0 + y * dy) * width + x0 + x * dx) * 4, rows, y * stride, x, channels, depth, type, palette, trns);
            }
        }
    }
    return { width, height, data };
}

function unfilter(raw, stride, height, bpp) {
    const rows = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const out = rows.subarray(y * stride, (y + 1) * stride);
        const prev = y ? rows.subarray((y - 1) * stride, y * stride) : null;
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? out[i - bpp] : 0;
            const b = prev ? prev[i] : 0;
            const c = prev && i >= bpp ? prev[i - bpp] : 0;
            let v = src[i];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            out[i] = v & 255;
        }
    }
    return rows;
}

function writePixel(data, o, rows, rowStart, x, channels, depth, type, palette, trns) {
    // One sample (channel `ch` of pixel `x`) scaled to 8 bits; palette indices stay raw.
    const max = (1 << depth) - 1;
    const sample = (ch) => {
        const idx = x * channels + ch;
        if (depth === 8) return rows[rowStart + idx];
        if (depth === 16) return rows[rowStart + idx * 2];
        const bit = idx * depth;
        const v = (rows[rowStart + (bit >> 3)] >> (8 - depth - (bit & 7))) & max;
        return type === 3 ? v : Math.round((v * 255) / max);
    };
    if (type === 3) {
        const i = sample(0);
        data[o] = palette[i * 3];
        data[o + 1] = palette[i * 3 + 1];
        data[o + 2] = palette[i * 3 + 2];
        data[o + 3] = trns && i < trns.length ? trns[i] : 255;
    } else if (type === 0 || type === 4) {
        data[o] = data[o + 1] = data[o + 2] = sample(0);
        data[o + 3] = type === 4 ? sample(1) : 255;
    } else {
        data[o] = sample(0);
        data[o + 1] = sample(1);
        data[o + 2] = sample(2);
        data[o + 3] = type === 6 ? sample(3) : 255;
    }
}

export function decodeTga(buf) {
    const idLen = buf[0];
    const type = buf[2];
    const width = buf.readUInt16LE(12);
    const height = buf.readUInt16LE(14);
    const depth = buf[16];
    const topDown = (buf[17] & 0x20) !== 0;
    if (![2, 3, 10, 11].includes(type)) throw new Error(`TGA type ${type} not supported`);
    const gray = type === 3 || type === 11;
    const bytes = depth >> 3;
    const count = width * height;
    const px = Buffer.alloc(count * bytes);
    let pos = 18 + idLen;
    if (type === 2 || type === 3) buf.copy(px, 0, pos, pos + px.length);
    else {
        let n = 0;
        while (n < count) {
            const head = buf[pos++];
            const run = (head & 0x7f) + 1;
            if (head & 0x80) {
                for (let i = 0; i < run; i++) buf.copy(px, (n + i) * bytes, pos, pos + bytes);
                pos += bytes;
            } else {
                buf.copy(px, n * bytes, pos, pos + run * bytes);
                pos += run * bytes;
            }
            n += run;
        }
    }
    const data = Buffer.alloc(count * 4);
    for (let i = 0; i < count; i++) {
        const y = Math.floor(i / width);
        const row = topDown ? y : height - 1 - y;
        const o = (row * width + (i % width)) * 4;
        const s = i * bytes;
        if (gray) {
            data[o] = data[o + 1] = data[o + 2] = px[s];
            data[o + 3] = bytes > 1 ? px[s + 1] : 255;
        } else {
            data[o] = px[s + 2];
            data[o + 1] = px[s + 1];
            data[o + 2] = px[s];
            data[o + 3] = bytes === 4 ? px[s + 3] : 255;
        }
    }
    return { width, height, data };
}

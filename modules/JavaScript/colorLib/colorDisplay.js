/**
 * colorDisplay.js — pixel displays drawn with DebugText (colorLib part `display`).
 *     import * as display from "./unified/colorLib/colorDisplay.js"
 *
 * ⚠ Needs `@minecraft/debug-utilities` (beta) in the pack manifest — this part
 * does not add it for you (module dependencies are module-wide, and colorLib
 * itself needs none). The world needs the Beta APIs experiment.
 *
 * Also uses @minecraft/server. Pure helpers live in ./pixelOps.js.
 */
import { world } from '@minecraft/server';
import { debugDrawer, DebugText } from '@minecraft/debug-utilities';
import { downsample, mergeSquares, countGlyphs, rgbKey, tolKey, MAX_GLYPHS, MERGE_UNCAPPED, MAX_TOL } from './pixelOps.js';

export { downsample, mergeSquares, countGlyphs, rgbKey, MAX_GLYPHS, MERGE_UNCAPPED, MAX_TOL };
export { mergeImage, colorError, sweepMerge, tolKey, meanRgb } from './pixelOps.js';

// Pixel displays built from DebugText: one square glyph per pixel, rotation
// locked (`useRotation`) so it sits flat in a plane, colour per shape.
//
// A display is: a frame (centre + in-plane right/up axes + shape rotation),
// a grid size, and a colour source `(x, y) => RGBA | null` (null = no shape,
// which also saves the shape).

// Placement faces understood by resolvePlacement.
export const DISPLAY_FACES = Object.freeze(['view', 'look', 'north', 'south', 'east', 'west', 'up', 'down']);

// The only glyph: █ (full block). ■ and the bare text plate were tried and
// dropped — smaller / non-square, they left gaps a single calibration can't fix.
export const GLYPH = '█';
export const DEFAULT_SPACING = 0.25;
export const SCALE_PER_SPACING = 4; // scale 1 ≈ spacing 0.25; the fine fit comes from the calibration
export const FACE_OFFSET = 0.02; // lift off the block face to avoid z-fighting
export const LOOK_DISTANCE = 16;
const CLEAR = { red: 0, green: 0, blue: 0, alpha: 0 };

// ── Calibration ─────────────────────────────────────────────────────────────
// How the █ glyph actually tiles on screen. Font metrics are the client's, so
// this is measured in-game, not derived:
//   x, y     pixel pitch multipliers, horizontal / vertical (lower = closer)
//   points   glyph-scale multipliers measured at given pixel pitches (blocks)
//   overlap  extra glyph growth on pixel displays only (closes hairline seams);
//            `exact` displays skip it so fitting stays exact
//   ox, oy   glyph centre offset, in blocks per unit of glyph scale. DebugText
//            anchors text at its TOP-CENTRE, so a glyph hangs below its anchor:
//            the measured oy (−0.107) is half the glyph height at scale 1
//            (1 / (4 × 1.177) ≈ 0.212 blocks). Each glyph moves back by
//            (ox, oy) × its scale along the panel's right / up.
//
// Measured in-game (2026-09-28): with the offset corrected ONE constant
// multiplier (×1.177) fills every resolution from 1×1 to 32×32 per block — the
// glyph scales linearly. An earlier "small pixels need a bigger boost" curve
// was the uncorrected offset showing up as size-dependent gaps. Points are
// still a curve (power-law between points, straight in log–log, extended past
// the ends, clamped to [0.5, 6]); a single point means a constant.
//
// Stored world-wide (see configureDisplay); setCalibration() edits it and
// re-lays every live display.
export const DEFAULT_CALIBRATION = Object.freeze({
    x: 1,
    y: 1,
    overlap: 1,
    ox: 0,
    oy: -0.107,
    points: Object.freeze([Object.freeze({ pitch: 1 / 4, scale: 1.177 })]),
});
// World dynamic property the calibration is stored in; configureDisplay() can
// change it (call before the first display is created).
let CAL_KEY = 'colorlib:display_cal';

export function configureDisplay({ storageKey } = {}) {
    if (typeof storageKey === 'string' && storageKey) {
        CAL_KEY = storageKey;
        calibration = undefined; // re-read from the new key on next use
    }
}
const SAME_PITCH = 0.1; // points within ±10% of a pitch are the same point
let calibration;

const clone = (c) => ({ x: c.x ?? 1, y: c.y ?? 1, overlap: c.overlap ?? 1, ox: c.ox ?? 0, oy: c.oy ?? 0, points: (c.points ?? []).map((p) => ({ pitch: p.pitch, scale: p.scale })) });

export function getCalibration() {
    if (calibration) return calibration;
    calibration = clone(DEFAULT_CALIBRATION);
    try {
        const raw = world.getDynamicProperty(CAL_KEY);
        if (typeof raw === 'string') {
            let o = JSON.parse(raw);
            // Saves from the per-style era ({ block, square, plate }) keep block.
            if (o && typeof o.block === 'object') o = o.block;
            for (const k of ['x', 'y', 'overlap', 'ox', 'oy']) if (typeof o[k] === 'number') calibration[k] = o[k];
            if (Array.isArray(o.points)) calibration.points = o.points.filter((p) => p.pitch > 0 && p.scale > 0).map((p) => ({ pitch: p.pitch, scale: p.scale }));
            else if (typeof o.scale === 'number') calibration.points = [{ pitch: 0.25, scale: o.scale }]; // pre-curve save
        }
    } catch {}
    return calibration;
}

// Glyph-scale multiplier for a pixel pitch (blocks).
export function glyphMultiplier(pitch, points = getCalibration().points) {
    if (!points.length) return 1;
    if (points.length === 1 || !(pitch > 0)) return points[0].scale;
    const pts = [...points].sort((a, b) => a.pitch - b.pitch);
    // Segment containing pitch, or the end segment to extend.
    let i = 0;
    while (i < pts.length - 2 && pitch > pts[i + 1].pitch) i++;
    const a = pts[i];
    const b = pts[i + 1];
    const t = Math.log(pitch / a.pitch) / Math.log(b.pitch / a.pitch);
    const m = Math.exp(Math.log(a.scale) + t * (Math.log(b.scale) - Math.log(a.scale)));
    return Math.max(0.5, Math.min(6, m));
}

function relayout() {
    let moved = 0;
    for (const d of live) moved += layoutDisplay(d);
    return moved;
}

// Update, persist, and re-lay every live display.
//   { x, y }            pitch multipliers
//   { scale, pitch }    record a point at that pitch (replaces one within ±10%)
//   { scale } alone     one constant multiplier for every size (clears points)
//   { points: [...] }   replace the whole curve ([] = no points: multiplier 1)
//   { overlap, ox, oy } see above
// Returns { calibration, moved }.
export function setCalibration(partial) {
    const next = clone(getCalibration());
    const clamp = (v) => Math.max(0.1, Math.min(6, v));
    for (const k of ['x', 'y']) if (typeof partial[k] === 'number' && Number.isFinite(partial[k])) next[k] = clamp(partial[k]);
    for (const k of ['ox', 'oy']) if (typeof partial[k] === 'number' && Number.isFinite(partial[k])) next[k] = Math.max(-2, Math.min(2, partial[k]));
    if (typeof partial.overlap === 'number' && Number.isFinite(partial.overlap)) next.overlap = Math.max(0.5, Math.min(2, partial.overlap));
    if (Array.isArray(partial.points)) next.points = partial.points.filter((p) => p.pitch > 0 && p.scale > 0).map((p) => ({ pitch: p.pitch, scale: p.scale }));
    if (typeof partial.scale === 'number' && Number.isFinite(partial.scale)) {
        const scale = clamp(partial.scale);
        if (partial.pitch > 0) {
            next.points = next.points.filter((p) => Math.abs(p.pitch / partial.pitch - 1) > SAME_PITCH);
            next.points.push({ pitch: partial.pitch, scale });
            next.points.sort((a, b) => a.pitch - b.pitch);
        } else {
            next.points = [{ pitch: 0.25, scale }];
        }
    }
    calibration = next;
    const isDefault = JSON.stringify(next) === JSON.stringify(clone(DEFAULT_CALIBRATION));
    world.setDynamicProperty(CAL_KEY, isDefault ? undefined : JSON.stringify(next));
    return { calibration: clone(next), moved: relayout() };
}

export function resetCalibration() {
    calibration = clone(DEFAULT_CALIBRATION);
    return setCalibration({});
}

// The calibration as source to paste over DEFAULT_CALIBRATION above
// so a tuned world can become the shipped default.
export function calibrationExport(c = getCalibration()) {
    const r = (n) => Math.round((n ?? 0) * 10000) / 10000;
    const pitch = (p) => {
        const inv = 1 / p;
        return Math.abs(inv - Math.round(inv)) < 1e-6 && Math.round(inv) > 1 ? `1 / ${Math.round(inv)}` : String(r(p));
    };
    const points = [...c.points].sort((a, b) => a.pitch - b.pitch).map((p) => `Object.freeze({ pitch: ${pitch(p.pitch)}, scale: ${r(p.scale)} })`);
    return [
        'export const DEFAULT_CALIBRATION = Object.freeze({',
        `    x: ${r(c.x)},`,
        `    y: ${r(c.y)},`,
        `    overlap: ${r(c.overlap ?? 1)},`,
        `    ox: ${r(c.ox)},`,
        `    oy: ${r(c.oy)},`,
        `    points: Object.freeze([${points.join(', ')}]),`,
        '});',
    ];
}

// ── Placement ───────────────────────────────────────────────────────────────

// Cardinal facing: f = horizontal view direction, yaw = matching rotation.
const CARDINALS = {
    south: { f: { x: 0, y: 0, z: 1 }, yaw: 0 },
    north: { f: { x: 0, y: 0, z: -1 }, yaw: 180 },
    east: { f: { x: 1, y: 0, z: 0 }, yaw: -90 },
    west: { f: { x: -1, y: 0, z: 0 }, yaw: 90 },
};
const FACE_NORMALS = {
    north: { x: 0, y: 0, z: -1 },
    south: { x: 0, y: 0, z: 1 },
    east: { x: 1, y: 0, z: 0 },
    west: { x: -1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    down: { x: 0, y: -1, z: 0 },
};
// A viewer looking at a wall face looks against its normal.
const WALL_VIEW = { north: 'south', south: 'north', east: 'west', west: 'east' };

export function playerCardinal(player) {
    const v = player.getViewDirection();
    if (Math.abs(v.x) > Math.abs(v.z)) return CARDINALS[v.x > 0 ? 'east' : 'west'];
    return CARDINALS[v.z > 0 ? 'south' : 'north'];
}

export const rightOf = (f) => ({ x: -f.z, y: 0, z: f.x }); // viewer's right-hand side

// Resolve the panel frame. Returns { center, right, up, rotation, dimensionId,
// onBlock, faceName? } or { error } when the requested block/face isn't found.
//   view  — floating, facing your cardinal; at `location`, else 4 blocks ahead
//   look  — flat on the block face you are looking at
//   north/south/east/west/up/down — that face of the block at `location`
//           (or of the block you are looking at)
export function resolvePlacement(player, face, location, offset = FACE_OFFSET) {
    const view = playerCardinal(player);
    const dimensionId = player.dimension.id;

    if (face === 'view') {
        const eye = player.getHeadLocation();
        const center = location ?? { x: eye.x + view.f.x * 4, y: eye.y, z: eye.z + view.f.z * 4 };
        return { center, right: rightOf(view.f), up: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: view.yaw, z: 0 }, dimensionId, onBlock: false };
    }

    let block;
    let faceName = face === 'look' ? undefined : face; // 'look' takes the face from the ray below
    if (location) block = { x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z) };
    if (!block || !faceName) {
        const hit = player.getBlockFromViewDirection({ maxDistance: LOOK_DISTANCE, includeLiquidBlocks: false, includePassableBlocks: false });
        if (!hit) return { error: `look at a block within ${LOOK_DISTANCE} blocks${location ? ' (or name a face)' : ''}` };
        block ??= hit.block.location;
        faceName ??= String(hit.face).toLowerCase();
    }
    const n = FACE_NORMALS[faceName];
    if (!n) return { error: `unknown face "${faceName}"` };

    const lift = 0.5 + offset;
    const center = { x: block.x + 0.5 + n.x * lift, y: block.y + 0.5 + n.y * lift, z: block.z + 0.5 + n.z * lift };

    if (WALL_VIEW[faceName]) {
        const c = CARDINALS[WALL_VIEW[faceName]];
        return { center, right: rightOf(c.f), up: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: c.yaw, z: 0 }, dimensionId, onBlock: true, faceName };
    }
    // Floor / ceiling: lie flat, image "up" points the way you are facing.
    return { center, right: rightOf(view.f), up: view.f, rotation: { x: faceName === 'up' ? 90 : -90, y: view.yaw, z: 0 }, dimensionId, onBlock: true, faceName };
}

// Spacing/scale from options: explicit spacing wins, then fit, then 1 block
// on faces, else the default.
export function sizeFor(width, height, opts, onBlock) {
    const fit = opts.fit ?? (opts.spacing === undefined && onBlock ? 1 : undefined);
    const spacing = opts.spacing ?? (fit !== undefined ? fit / Math.max(width, height) : DEFAULT_SPACING);
    const scale = opts.scale ?? spacing * SCALE_PER_SPACING;
    return { spacing, scale };
}

// Turn the image clockwise by `deg` (snapped to 90° steps) within its plane.
// Glyphs are square, so only the pixel axes change: a clockwise quarter turn
// maps image-right to panel-down and image-up to panel-right.
export function rotateFrame(frame, deg = 0) {
    const steps = ((Math.round((deg || 0) / 90) % 4) + 4) % 4;
    let { right, up } = frame;
    for (let i = 0; i < steps; i++) [right, up] = [{ x: -up.x, y: -up.y, z: -up.z }, right];
    return { ...frame, right, up };
}

export function withRotationOffset(rotation, opts) {
    return { x: rotation.x + (opts.pitch ?? 0), y: rotation.y + (opts.yaw ?? 0), z: rotation.z + (opts.roll ?? 0) };
}

// ── Displays ────────────────────────────────────────────────────────────────

// Live displays, so a calibration change can re-lay them all.
const live = new Set();

// ── Merging ─────────────────────────────────────────────────────────────────
// mergeSquares (pixelOps.js): one glyph per same-colour k×k square.

// Largest square side worth merging at this pixel pitch. With a constant
// multiplier (0–1 points) glyphs scale linearly, so any size is safe; with a
// real curve, sizes past the largest measured pitch are extrapolated, so stay
// inside the measured range. (MERGE_UNCAPPED lives in pixelOps.js.)
export function maxMergeFor(spacing, points = getCalibration().points) {
    if (points.length <= 1) return MERGE_UNCAPPED;
    const top = Math.max(...points.map((p) => p.pitch));
    return Math.max(1, Math.floor(top / spacing + 1e-9));
}

// Glyph scale for a k×k glyph: k× the pixel's, with the calibration for its size.
// `points` hold the fitted size (a glyph exactly spanning its pixel); pixel
// displays add the overlap on top, exact ones (the fit bench) don't.
const glyphScaleFor = (d, k) => d.scale * k * glyphMultiplier(d.spacing * k) * (d.exact ? 1 : (getCalibration().overlap ?? 1));

// Where a glyph covering the k×k square at pixel (x, y) goes, under the
// calibration (grid pitch, then the glyph-centre offset at this glyph's scale).
function pixelPlace(d, x, y, k = 1) {
    const cal = getCalibration();
    const { center, right, up } = d.frame;
    const scale = glyphScaleFor(d, k);
    const ox = (x + (k - 1) / 2 - (d.width - 1) / 2) * d.spacing * cal.x - (cal.ox ?? 0) * scale;
    const oy = ((d.height - 1) / 2 - y - (k - 1) / 2) * d.spacing * cal.y - (cal.oy ?? 0) * scale;
    return {
        dimension: d.dimension,
        x: center.x + right.x * ox + up.x * oy,
        y: center.y + right.y * ox + up.y * oy,
        z: center.z + right.z * ox + up.z * oy,
    };
}

// Re-apply position + scale to every glyph (after a calibration change).
function layoutDisplay(d) {
    let n = 0;
    for (const p of d.shapes) {
        try {
            p.shape.setLocation(pixelPlace(d, p.x, p.y, p.k));
            p.shape.scale = glyphScaleFor(d, p.k);
            n++;
        } catch {}
    }
    return n;
}

// Spawn the pixels. frame: { center, right, up, rotation, dimensionId }.
// colorAt(x, y) -> RGBA (0..1 channels) or null to leave that pixel out.
// `seconds` undefined = permanent until removed. `spacing`/`scale` are the
// nominal values; the calibration is applied on top.
// `merge`: cover same-colour k×k squares with one glyph (static displays only —
// recolorDisplay addresses single pixels). A number caps k; true = the cap from
// maxMergeFor. `tol` (0..MAX_TOL, with merge) also merges nearly equal
// colours — that many low bits per channel ignored; the glyph shows the mean.
// `meta`: optional { label: value } describing where the display came from.
// Returns a display handle; `pixels` counts the image pixels drawn.
export function createDisplay({ frame, width, height, colorAt, spacing, scale, seconds, range = 32, depth = true, merge = false, tol = 0, exact = false, meta }) {
    const d = {
        shapes: [],
        frame,
        center: frame.center,
        dimension: world.getDimension(frame.dimensionId),
        dimensionId: frame.dimensionId,
        range,
        width,
        height,
        spacing,
        scale,
        pixels: 0,
        merged: false,
        exact,
        meta,
        extent: (Math.max(width, height) * spacing) / 2,
        interval: undefined,
    };
    let cells;
    if (merge) {
        const maxK = typeof merge === 'number' ? Math.max(1, Math.floor(merge)) : maxMergeFor(spacing);
        const t = Math.max(0, Math.min(MAX_TOL, Math.round(tol)));
        const key = t ? (c) => `${Math.round(c.red * 255) >> t},${Math.round(c.green * 255) >> t},${Math.round(c.blue * 255) >> t},${c.alpha}` : (c) => `${c.red},${c.green},${c.blue},${c.alpha}`;
        cells = mergeSquares(width, height, colorAt, { maxK, key, ...(t ? { mix: meanRgba } : {}) });
        d.merged = true;
    } else {
        cells = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const c = colorAt(x, y);
                if (c) cells.push({ x, y, k: 1, c });
            }
        }
    }
    for (const { x, y, k, c } of cells) {
        const shape = new DebugText(pixelPlace(d, x, y, k), GLYPH);
        shape.useRotation = true;
        shape.rotation = frame.rotation;
        shape.backfaceVisible = true;
        shape.textBackfaceVisible = true;
        shape.depthTest = depth;
        shape.scale = glyphScaleFor(d, k);
        if (seconds !== undefined) shape.timeLeft = seconds;
        shape.maximumRenderDistance = range;
        paint(shape, c);
        debugDrawer.addShape(shape);
        d.shapes.push({ shape, x, y, k });
        d.pixels += k * k;
    }
    live.add(d);
    return d;
}

function meanRgba(list) {
    const m = { red: 0, green: 0, blue: 0, alpha: 0 };
    for (const c of list) {
        m.red += c.red;
        m.green += c.green;
        m.blue += c.blue;
        m.alpha += c.alpha;
    }
    for (const k in m) m[k] /= list.length;
    return m;
}

function paint(shape, c) {
    shape.color = c;
    shape.backgroundColorOverride = CLEAR;
}

// Recolour an existing display in place (animation). colorAt(x, y) -> RGBA.
// Merged displays are static: a merged glyph takes the colour of its top-left pixel.
export function recolorDisplay(d, colorAt) {
    for (const p of d.shapes) {
        const c = colorAt(p.x, p.y);
        if (c) paint(p.shape, c);
    }
}

export function setDisplayRange(d, r) {
    d.range = r;
    for (const p of d.shapes) {
        try {
            p.shape.maximumRenderDistance = r;
        } catch {}
    }
}

// The live display the player is looking at (nearest to the looked-at block,
// or a point 4 blocks ahead), within its own half-size + 2 blocks.
export function displayAt(player) {
    let at;
    try {
        const hit = player.getBlockFromViewDirection({ maxDistance: LOOK_DISTANCE, includeLiquidBlocks: false, includePassableBlocks: false });
        if (hit) at = { x: hit.block.location.x + 0.5, y: hit.block.location.y + 0.5, z: hit.block.location.z + 0.5 };
    } catch {}
    if (!at) {
        const eye = player.getHeadLocation();
        const dir = player.getViewDirection();
        at = { x: eye.x + dir.x * 4, y: eye.y + dir.y * 4, z: eye.z + dir.z * 4 };
    }
    let best;
    let bestDist = Infinity;
    for (const d of live) {
        if (d.dimensionId !== player.dimension.id) continue;
        const c = d.center;
        const dist = Math.hypot(c.x - at.x, c.y - at.y, c.z - at.z);
        if (dist <= d.extent + 2 && dist < bestDist) {
            best = d;
            bestDist = dist;
        }
    }
    return best;
}

export function removeDisplay(d) {
    live.delete(d);
    for (const p of d.shapes) {
        try {
            p.shape.remove();
        } catch {}
    }
    d.shapes = [];
}

// Is any player in the display's dimension within `r` of its centre?
// Animations skip their colour pass when nobody can see them.
export function anyViewerNear(d, r = d.range) {
    const r2 = r * r;
    for (const p of world.getAllPlayers()) {
        if (p.dimension.id !== d.dimensionId) continue;
        const l = p.location;
        const dx = l.x - d.center.x;
        const dy = l.y - d.center.y;
        const dz = l.z - d.center.z;
        if (dx * dx + dy * dy + dz * dz <= r2) return true;
    }
    return false;
}

// RGBA (0..1) from { r, g, b } (0..255), the colorLib colour shape.
export const rgba = ({ r, g, b }) => ({ red: r / 255, green: g / 255, blue: b / 255, alpha: 1 });

// ── Images ──────────────────────────────────────────────────────────────────
// Glyph budget: MAX_GLYPHS (pixelOps.js) shapes per image display.

// Downsample an image to `res` and count what it would cost — without
// spawning anything. Returns { small, glyphs, pixels }.
export function planImage(img, { res = 32, merge = false, maxK, tol = 0 } = {}) {
    const small = downsample(img, res);
    const at = (x, y) => small.colors[y * small.w + x];
    const cap = merge ? (maxK ?? MERGE_UNCAPPED) : 1;
    const glyphs = countGlyphs(small.w, small.h, at, { merge, maxK: cap, key: tolKey(tol) });
    const pixels = small.colors.filter(Boolean).length;
    return { small, glyphs, pixels };
}

/**
 * Show an image (image model) as a display in one call.
 *   frame    from resolvePlacement(...) (optionally rotateFrame(...))
 *   res      longest side in pixels after downsampling (default 32)
 *   fit      longest side in blocks (default 1)
 *   merge    true / number cap — one glyph per same-colour square
 *   tol      with merge: 0..MAX_TOL, merge nearly equal colours too (lossy;
 *            pick one with sweepMerge — pixelOps.js)
 *   maxGlyphs  refuse (return { error }) above this many shapes (default MAX_GLYPHS)
 *   seconds, range, depth, meta — as createDisplay
 * Returns the display handle, or { error, glyphs }.
 */
export function showImage(img, frame, { res = 32, fit = 1, merge = false, tol = 0, maxGlyphs = MAX_GLYPHS, seconds, range = 48, depth = true, meta } = {}) {
    const plan = planImage(img, { res, merge: !!merge, maxK: typeof merge === 'number' ? merge : undefined, tol });
    if (plan.glyphs > maxGlyphs) return { error: `${plan.glyphs} glyphs is over the budget of ${maxGlyphs} — lower the resolution${merge ? '' : ' or merge'}`, glyphs: plan.glyphs };
    const { small } = plan;
    const spacing = fit / Math.max(small.w, small.h);
    return createDisplay({
        frame,
        width: small.w,
        height: small.h,
        colorAt: (x, y) => {
            const c = small.colors[y * small.w + x];
            return c ? rgba(c) : null;
        },
        spacing,
        scale: spacing * SCALE_PER_SPACING,
        seconds,
        range,
        depth,
        merge,
        tol,
        meta,
    });
}

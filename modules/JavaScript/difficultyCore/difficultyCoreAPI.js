/**
 * api/difficultyCoreAPI.js — PUBLIC Difficulty Core bridge client. Copied to unified-modules (`diffcore`);
 * NOT imported by this addon's own runtime. Consumers:
 *     import * as diffcore from "unified/diffcore/difficultyCoreAPI.js"
 *
 * Reads difficulty from a LOCAL mirror (seeded by ping/ready, kept fresh by diffcore:changed — dynamic
 * properties are per-pack so we can't read the core's directly), reacts to changes, and sets/registers over
 * the wire. Module *behavior* (your onChange) stays in YOUR runtime, keyed by a callback id; only data crosses.
 */
//version 1.0 *
import { system } from '@minecraft/server';

// wire (mirror of the core's config.js WIRE — inlined so this file stands alone for consumers)
const WIRE = {
    ping: 'diffcore:ping',
    pong: 'diffcore:pong',
    ready: 'diffcore:ready',
    register: 'diffcore:register',
    set: 'diffcore:set',
    changed: 'diffcore:changed',
    req: 'diffcore:req',
    res: 'diffcore:res',
};

function send(id, data) {
    system.sendScriptEvent(id, typeof data === 'string' ? data : JSON.stringify(data));
}

// --- local mirror of the core's GLOBAL knobs (no cross-pack DP read; refreshed from the wire) ---
let cache = {};
function applySnapshot(s) {
    if (s && typeof s === 'object') cache = { ...cache, ...s };
}

// --- handshake: resolve true if Difficulty Core is installed and answering (and seed the mirror from pong).
//     Call it before registering so the dependency stays optional. ---
export function ping(timeoutTicks = 20) {
    return new Promise((resolve) => {
        let settled = false;
        const onPong = (ev) => {
            if (ev.id !== WIRE.pong) return;
            settled = true;
            applySnapshot(JSON.parse(ev.message || '{}').snapshot);
            system.afterEvents.scriptEventReceive.unsubscribe(onPong);
            resolve(true);
        };
        system.afterEvents.scriptEventReceive.subscribe(onPong);
        send(WIRE.ping, '');
        system.runTimeout(() => {
            if (settled) return;
            system.afterEvents.scriptEventReceive.unsubscribe(onPong);
            resolve(false);
        }, timeoutTicks);
    });
}

// Fires when the core finishes boot (also seeds the mirror). Pair with ping() in case you loaded after the core.
export function onReady(fn) {
    const sub = (ev) => {
        if (ev.id !== WIRE.ready) return;
        const msg = JSON.parse(ev.message || '{}');
        applySnapshot(msg.snapshot);
        fn(msg);
    };
    system.afterEvents.scriptEventReceive.subscribe(sub);
    return () => system.afterEvents.scriptEventReceive.unsubscribe(sub);
}

// --- reads ---
export function getSnapshot() {
    return { ...cache };
}
export function getKnob(id) {
    return cache[id]; // GLOBAL knobs (sync, from the mirror). Player-scoped → getKnobAsync.
}

// Player-scoped / arbitrary read over RPC. Resolves the core's value, or `fallback` if the core is absent/slow.
let rpcSeq = 0;
const rpcPending = new Map(); // nonce → { resolve, timer }
export function getKnobAsync(id, { playerId, timeoutTicks = 20, fallback } = {}) {
    return new Promise((resolve) => {
        const nonce = ++rpcSeq;
        const timer = system.runTimeout(() => {
            if (rpcPending.delete(nonce)) resolve(fallback);
        }, timeoutTicks);
        rpcPending.set(nonce, { resolve, timer });
        send(WIRE.req, { nonce, method: 'get', data: { id, playerId } });
    });
}
system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== WIRE.res) return;
    const { nonce, ok, data } = JSON.parse(ev.message || '{}');
    const p = rpcPending.get(nonce);
    if (!p) return; // unknown / late / duplicate
    rpcPending.delete(nonce);
    system.clearRun(p.timer);
    p.resolve(ok ? data : undefined);
});

// --- writes / registration (data only) ---
export function setKnob(id, value, { playerId } = {}) {
    send(WIRE.set, { id, value, playerId });
}
export function registerKnob(def) {
    send(WIRE.register, { kind: 'knob', data: def });
}

// Register a module: metadata + knobs cross the wire; your onChange stays HERE and runs on diffcore:changed.
const moduleHooks = new Map(); // callbackId → onChange(change)
export function registerModule(descriptor) {
    const { id, onChange, ...meta } = descriptor;
    if (onChange) moduleHooks.set(id, onChange); // behavior never crosses the wire
    send(WIRE.register, { kind: 'module', data: { id, callbackId: id, ...meta } });
}

// --- change stream: the core broadcasts diffcore:changed → patch the mirror, then notify subs + module hooks ---
const changeSubs = new Set();
export function onChange(fn) {
    changeSubs.add(fn);
    return () => changeSubs.delete(fn);
}
system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== WIRE.changed) return;
    const change = JSON.parse(ev.message || '{}');
    if (change.scope === 'global') cache[change.id] = change.new; // keep the local mirror fresh
    for (const fn of changeSubs) {
        try {
            fn(change);
        } catch (e) {
            console.warn(`[diffcore] onChange: ${e}`);
        }
    }
    for (const fn of moduleHooks.values()) {
        try {
            fn(change);
        } catch (e) {
            console.warn(`[diffcore] module hook: ${e}`);
        }
    }
});
//version 1.0 *

/*
 * The markers of used one-time links and sign-in states: a file per nonce in the output directory's
 * .pivotkit-downloads, placed so that of two requests one wins (on a shared directory too), swept at
 * its expiry.
 */

import { randomBytes } from "node:crypto";
import { link as hardLink, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** How often the markers of expired one-time links are swept: ten minutes. */
export const MARKER_SWEEP_MS = 600_000;

/** A marker of a used one-time link (its nonce) or of a used sign-in state (the state). */
const MARKER_NAME = /^[A-Za-z0-9_-]{22}\.(?:used|state)$/;

/** A marker being written: its name before it is linked into place. */
const MARKER_TEMP = /^\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+\.tmp$/;

/**
 * Marks a one-time link used: the expiry is written whole to a file of its own, then linked to the
 * marker's name, which fails when the marker exists (on a shared directory too), so of two requests
 * one wins and a marker never exists without its content. Throws EEXIST for a used link.
 * @param {string} marker
 * @param {number} expiry  seconds
 */
export async function placeMarker(marker, expiry) {
    const name = marker.split(/[\\/]/).pop() ?? "";
    const temp = join(marker, "..", `.${name.replace(/\.(?:used|state)$/, "")}.${randomBytes(6).toString("base64url")}.tmp`);
    await writeFile(temp, `${expiry}\n`, { flag: "wx", mode: 0o600 });
    try {
        await hardLink(temp, marker);
    } finally {
        await unlink(temp).catch(() => undefined);
    }
}

/**
 * Deletes the markers whose link has expired. A marker whose content is not a time (another
 * writer's, damaged) is never deleted: a used link stays used. Temporary files of a write that
 * died are deleted after an hour.
 * @param {string} dir  the markers' directory
 * @param {number} [now]  seconds
 */
export async function sweepMarkers(dir, now = Math.floor(Date.now() / 1000)) {
    for (const name of await readdir(dir).catch(() => [])) {
        const path = join(dir, name);
        if (MARKER_NAME.test(name)) {
            const text = (await readFile(path, "utf8").catch(() => "")).trim();
            if (/^\d{1,12}$/.test(text) && Number(text) < now) {
                await unlink(path).catch(() => undefined);
            }
        } else if (MARKER_TEMP.test(name)) {
            const info = await stat(path).catch(() => null);
            if (info && info.mtimeMs < now * 1000 - 3_600_000) {
                await unlink(path).catch(() => undefined);
            }
        }
    }
}

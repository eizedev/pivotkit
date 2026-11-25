/*
 * The markers of used one-time links and sign-in states: a file per nonce in the output directory's
 * .pivotkit-downloads, placed so that of two requests one wins (on a shared directory too), swept at
 * its expiry.
 */

import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { link, open, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NO_HARD_LINKS } from "pivotkit-node/files";
import { EXPIRES_MINUTES } from "../options/downloads.js";

/** The calls tests replace: a file system without hard links, a write into a marker that fails. */
export const markerMeans = { link, write: (/** @type {import("node:fs/promises").FileHandle} */ handle, /** @type {string} */ text) => handle.writeFile(text) };

/**
 * The age after which a marker without a whole expiry is swept: no link outlives it. A link works
 * at most EXPIRES_MINUTES.max from when it was signed, and its marker is made after that; a sign-in
 * state much less. An hour more for clocks that differ on a shared directory.
 */
const PARTIAL_MARKER_MS = (EXPIRES_MINUTES.max * 60 + 3600) * 1000;

/** How often the markers of expired one-time links are swept: ten minutes. */
export const MARKER_SWEEP_MS = 600_000;

/** A marker of a used one-time link (its nonce) or of a used sign-in state (the state). */
const MARKER_NAME = /^[A-Za-z0-9_-]{22}\.(?:used|state)$/;

/** A marker being written: its name before it is linked into place. */
const MARKER_TEMP = /^\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+\.tmp$/;

/**
 * Marks a one-time link used: the expiry is written whole to a file of its own, then linked to the
 * marker's name, which fails when the marker exists (on a shared directory too), so of two requests
 * one wins and a marker never exists without its content. Without hard links (NO_HARD_LINKS: FAT,
 * exFAT, some SMB and object-store mounts) the marker is created exclusively in place and the expiry
 * written into it: of two requests one still wins. A write that fails in this process removes the
 * marker again, so the link is not used up. A marker left empty or without its line end (the
 * process died while it wrote, or the write is still going) counts as used until no link can
 * outlive it (PARTIAL_MARKER_MS). Throws EEXIST for a used link.
 * @param {string} marker
 * @param {number} expiry  seconds
 */
export async function placeMarker(marker, expiry) {
    const name = marker.split(/[\\/]/).pop() ?? "";
    const temp = join(marker, "..", `.${name.replace(/\.(?:used|state)$/, "")}.${randomBytes(6).toString("base64url")}.tmp`);
    await writeFile(temp, `${expiry}\n`, { flag: "wx", mode: 0o600 });
    try {
        await markerMeans.link(temp, marker);
    } catch (e) {
        if (!NO_HARD_LINKS.has(/** @type {any} */ (e)?.code)) {
            throw e;
        }
        await createMarker(marker, expiry);
    } finally {
        await unlink(temp).catch(() => undefined);
    }
}

/**
 * A marker created in place (O_EXCL, never through a symbolic link): EEXIST when it is there.
 * @param {string} marker
 * @param {number} expiry  seconds
 */
async function createMarker(marker, expiry) {
    const handle = await open(marker, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
        await markerMeans.write(handle, `${expiry}\n`);
    } catch (e) {
        // a failed write (a full disk) leaves no marker: the request fails, the link is not used up
        await handle.close().catch(() => undefined);
        await unlink(marker).catch(() => undefined);
        throw e;
    }
    await handle.close();
}

/**
 * Deletes the markers whose link has expired. A marker whose content is not a whole time (being
 * written, or its writer died) stays until no link can outlive it (PARTIAL_MARKER_MS): a used link
 * stays used. Temporary files of a write that died are deleted after an hour.
 * @param {string} dir  the markers' directory
 * @param {number} [now]  seconds
 */
export async function sweepMarkers(dir, now = Math.floor(Date.now() / 1000)) {
    for (const name of await readdir(dir).catch(() => [])) {
        const path = join(dir, name);
        if (MARKER_NAME.test(name)) {
            // only a whole expiry, with its line end: a marker written in place may be read mid-write
            const text = await readFile(path, "utf8").catch(() => "");
            const whole = /^\d{1,12}\n$/.test(text);
            if (whole ? Number(text.trim()) < now : ((await stat(path).catch(() => null))?.mtimeMs ?? Infinity) < now * 1000 - PARTIAL_MARKER_MS) {
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

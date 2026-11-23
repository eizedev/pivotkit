/*
 * A linked report's file: found by its link's nonce in the output directory, opened without
 * following a link, and sent streamed, under a sandbox, with the name a person sees.
 */

import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { OUTPUT_MARK } from "../output.js";
import { BASE_HEADERS, FILE_KINDS } from "./pages.js";

const FILE_CSP = "sandbox; default-src 'none'";

/** The media types of the files pivotkit writes, by extension. */
const MEDIA_TYPES = Object.freeze({ xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", html: "text/html; charset=utf-8", csv: "text/csv; charset=utf-8", json: "application/json", svg: "image/svg+xml" });

/** A stored name of pivotkit's (a report or a draft) with a link's prefix. */
const LINKED_NAME = new RegExp(`^([A-Za-z0-9_-]{22})-(.+)\\.${OUTPUT_MARK}\\.((?:report\\.)?(xlsx|html|csv|json|svg))$`);

/** The name a person sees for a stored name: without the link's prefix and pivotkit's mark. */
export function filenameOf(stored) {
    const linked = LINKED_NAME.exec(stored);
    const name = linked ? `${linked[2]}.${linked[3]}` : stored;
    return name.replace(`.${OUTPUT_MARK}.`, ".");
}

/**
 * Content-Disposition for a file name: an ASCII fallback and the UTF-8 name (RFC 6266, RFC 8187),
 * with line breaks, quotes and backslashes taken out.
 * @param {string} name
 */
export function dispositionOf(name) {
    // control characters (line breaks among them), quotes and backslashes out
    const clean = [...name].filter((c) => c.charCodeAt(0) > 0x1f && c.charCodeAt(0) !== 0x7f && c !== '"' && c !== "\\").join("");
    const ascii = clean.replace(/[^\x20-\x7e]/g, "_") || "report";
    const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export /**
 * The stored file of a nonce, opened without following a link, or null when it is gone.
 * @param {string | null} dir  the output directory (null: none)
 * @param {string} n  the link's nonce
 */
async function openReport(dir, n) {
    if (!dir) {
        return null;
    }
    const names = (await readdir(dir).catch(() => [])).filter((name) => name.startsWith(`${n}-`) && LINKED_NAME.exec(name)?.[1] === n);
    if (names.length !== 1) {
        return null;
    }
    const handle = await open(join(dir, names[0]), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => null);
    if (!handle) {
        return null;
    }
    const info = await handle.stat();
    if (!info.isFile()) {
        await handle.close();
        return null;
    }
    const extension = /** @type {string} */ (LINKED_NAME.exec(names[0])?.[4]);
    return { handle, size: info.size, filename: filenameOf(names[0]), mediaType: MEDIA_TYPES[/** @type {keyof typeof MEDIA_TYPES} */ (extension)], kind: FILE_KINDS[/** @type {keyof typeof FILE_KINDS} */ (extension)] };
}

/**
 * The file as an answer, streamed. `started` runs when its first bytes are handed on, `failed`
 * when it ends before any were.
 */
export function fileAnswer(report, method, { headers = {}, started = () => {}, failed = () => {} } = {}) {
    const responseHeaders = { ...BASE_HEADERS, "content-security-policy": FILE_CSP, "content-type": report.mediaType, "content-length": String(report.size), "content-disposition": dispositionOf(report.filename), ...headers };
    if (method === "HEAD") {
        void report.handle.close();
        return new Response(null, { status: 200, headers: responseHeaders });
    }
    let sent = false;
    let ended = false;
    const end = async (ok) => {
        if (!ended) {
            ended = true;
            await report.handle.close().catch(() => undefined);
            if (!ok && !sent) {
                await failed();
            }
        }
    };
    const chunk = Buffer.alloc(65_536);
    const body = new ReadableStream({
        async pull(controller) {
            try {
                const { bytesRead } = await report.handle.read(chunk, 0, chunk.length, null);
                if (bytesRead === 0) {
                    await end(true);
                    controller.close();
                    return;
                }
                if (!sent) {
                    sent = true;
                    await started();
                }
                controller.enqueue(new Uint8Array(chunk.subarray(0, bytesRead)));
            } catch (e) {
                await end(false);
                controller.error(e);
            }
        },
        async cancel() {
            await end(false);
        }
    });
    return new Response(body, { status: 200, headers: responseHeaders });
}

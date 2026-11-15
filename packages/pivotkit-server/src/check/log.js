/*
 * check-config's section for the log (log.js): its level, its format and whether lines name
 * addresses.
 *
 *   Log:
 *     level info, format auto (text on a terminal, JSON otherwise)
 *     addresses on: the socket's peer (with http.trustProxy the forwarded client, the proxy as peerAddress)
 *
 * check/index.js says what a section returns. Its "New in this version" notes: the client's address
 * on a request's lines (HTTP, log.address on) and start errors as a JSON line (HTTP, any format but
 * text; a stdio client keeps the server's stderr in its own log),
 * each with the setting that switches it off; upgrading.md has the rest of the log's changes.
 */

import { logSettingsOf } from "../log.js";
import { heading, plain } from "./format.js";

/** What each format writes. */
const FORMAT_TEXT = Object.freeze({ auto: "auto (text on a terminal, JSON otherwise)", text: "text", json: "JSON" });

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const log = logSettingsOf(options.log);
    const items = [heading("Log:"), plain(`level ${log.level}, format ${FORMAT_TEXT[log.format]}`)];
    const upgrade = [];
    if (runtime.http && log.address !== "off") {
        upgrade.push(`the client's IP address on the log's request lines (log.address: "off" leaves it out)`);
    }
    if (runtime.http && log.format !== "text") {
        upgrade.push(`a start error as a JSON line where stderr is no terminal (log.format: "text" keeps the plain line)`);
    }
    if (log.address === "off") {
        items.push(plain("addresses off (log.address)"));
    } else if (runtime.http) {
        items.push(plain(`addresses on: ${options.http?.trustProxy ? "the forwarded client, the proxy as peerAddress (http.trustProxy)" : "the socket's peer"}`));
    }
    return { items, upgrade };
}

/*
 * check-config's section for the log (log.js): its level, its format and whether lines name
 * addresses.
 *
 *   Log:
 *     level info, format auto (text on a terminal, JSON otherwise)
 *     addresses on: the socket's peer (with http.trustProxy the forwarded client, the proxy as peerAddress)
 *
 * check/index.js says what a section returns. The log has no "New in this version" note in this
 * version; the changelog of pivotkit-server has the log's changes of earlier versions.
 */

import { logSettingsOf } from "../log.js";
import { heading, plain } from "./format.js";

/** What each format writes. */
const FORMAT_TEXT = Object.freeze({ auto: "auto (text on a terminal, JSON otherwise)", text: "text", json: "JSON" });

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const log = logSettingsOf(options.log);
    const items = [heading("Log:"), plain(`level ${log.level}, format ${FORMAT_TEXT[log.format]}`)];
    if (log.address === "off") {
        items.push(plain("addresses off (log.address)"));
    } else if (runtime.http) {
        items.push(plain(`addresses on: ${options.http?.trustProxy ? "the forwarded client, the proxy as peerAddress (http.trustProxy)" : "the socket's peer"}`));
    }
    return { items, upgrade: [] };
}

/*
 * check-config's section for the log (log.js): its level, its format and whether lines name
 * addresses, each with where it was set.
 *
 *   Log: level info, format auto (text on a terminal, JSON otherwise), addresses on (the socket's peer; the forwarded client with http.trustProxy)
 *
 * check/index.js says what a section returns.
 */

import { logSettingsOf } from "../log.js";

/** What each format writes. */
const FORMAT_TEXT = Object.freeze({ auto: "auto (text on a terminal, JSON otherwise)", text: "text", json: "JSON" });

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const log = logSettingsOf(options.log);
    const address = log.address === "off" ? "addresses off" : runtime.http ? `addresses on (${options.http?.trustProxy ? "the forwarded client, the proxy as peerAddress" : "the socket's peer"})` : null;
    const lines = ["", `Log: level ${log.level}, format ${FORMAT_TEXT[log.format]}${address ? `, ${address}` : ""}`];
    // no "New in this version" note: the log changes for every server, and upgrading.md says how
    return { lines, problems: 0, upgrade: [] };
}

/*
 * check-config's section for data sent in a request (sources/inline.js): who may send data on MCP
 * and REST, and how much.
 *
 *   Data in the request (inline:):
 *     MCP: on, up to 500 rows / 5000 cells / 256 KiB
 *     REST: for profiles etl, up to 20 MiB (rest.data.maxBytes)
 *
 * check/index.js says what a section returns.
 */

import { heading, plain, warning } from "./format.js";
import { bytesText } from "../text.js";
import { MCP_DATA_CAP, capText, mcpCapOf, restDataBytesOf, restDataOffered } from "../sources/inline.js";

/** The profiles whose `data` is the given value. */
const profilesWith = (options, value) => Object.entries(options.policy?.profiles ?? {}).filter(([, p]) => p?.data === value).map(([name]) => name);

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const items = [];
    const cap = mcpCapOf(options);
    const off = profilesWith(options, false);
    const on = profilesWith(options, true);
    const restOn = restDataOffered(options);
    // MCP: on unless switched off; the server's policy or a profile can say false
    if (runtime.mcp !== false) {
        if (!cap) {
            items.push(plain("MCP: off (mcp.data: false)"));
        } else {
            const lowered = Object.keys(MCP_DATA_CAP).some((key) => cap[/** @type {keyof typeof MCP_DATA_CAP} */ (key)] !== MCP_DATA_CAP[/** @type {keyof typeof MCP_DATA_CAP} */ (key)]);
            const limit = `up to ${capText(cap)}${lowered ? " (mcp.data)" : ""}`;
            items.push(plain(options.policy?.data === false ? `MCP: off (policy.data: false)${on.length ? `; for profiles ${on.join(", ")} ${limit}` : ""}` : `MCP: on, ${limit}${off.length ? `; not for profiles ${off.join(", ")}` : ""}`));
        }
    }
    // REST: only where the server's policy or a profile says true
    if (runtime.rest && !restOn) {
        items.push(plain("REST: off (no policy or profile has data: true)"));
    }
    if (runtime.rest !== false && restOn) {
        const who = options.policy?.data === true ? `every caller${off.length ? ` but profiles ${off.join(", ")}` : ""}` : `profiles ${on.join(", ")}`;
        items.push(plain(`REST: for ${who}, up to ${bytesText(restDataBytesOf(options))}${options.rest?.data?.maxBytes !== undefined ? " (rest.data.maxBytes)" : ""}`));
    }
    if (restOn && options.policy?.data === true) {
        items.push(warning(`policy.data: true lets every REST caller send its own data, in bodies of up to ${bytesText(restDataBytesOf(options))}; give data: true to the profiles that need it instead`));
    }
    if (restOn && (options.auth?.mode ?? "none") === "none" && options.auth?.allowUnauthenticated) {
        items.push(warning(`auth is off on a network address (auth.allowUnauthenticated): anyone who reaches the server may send data, in bodies of up to ${bytesText(restDataBytesOf(options))}`));
    }
    if (!restOn && options.rest?.data?.maxBytes !== undefined) {
        items.push(warning("rest.data.maxBytes does nothing: no policy or profile has data: true"));
    }
    if (items.length) {
        items.unshift(heading("Data in the request (inline:):"));
    }
    return { items, upgrade: [] };
}

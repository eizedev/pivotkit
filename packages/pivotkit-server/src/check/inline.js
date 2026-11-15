/*
 * check-config's section for data sent in a request (sources/inline.js): who may send data on MCP
 * and REST, and how much.
 *
 *   Data in the request: MCP on, up to 500 rows / 5000 cells / 256 KiB (built-in cap); REST for profiles etl, up to 20 MiB (rest.data.maxBytes)
 *
 * check/index.js says what a section returns.
 */

import { MCP_DATA_CAP, bytesText, capText, mcpCapOf, restDataBytesOf, restDataOffered } from "../sources/inline.js";

/** The profiles whose `data` is the given value. */
const profilesWith = (options, value) => Object.entries(options.policy?.profiles ?? {}).filter(([, p]) => p?.data === value).map(([name]) => name);

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const lines = [];
    const cap = mcpCapOf(options);
    const off = profilesWith(options, false);
    const on = profilesWith(options, true);
    // MCP: on unless switched off; the server's policy or a profile can say false
    let mcp = "MCP off (mcp.data: false)";
    if (cap) {
        const lowered = Object.keys(MCP_DATA_CAP).some((key) => cap[/** @type {keyof typeof MCP_DATA_CAP} */ (key)] !== MCP_DATA_CAP[/** @type {keyof typeof MCP_DATA_CAP} */ (key)]);
        const limit = `up to ${capText(cap)} (${lowered ? "mcp.data" : "built-in cap"})`;
        mcp = options.policy?.data === false ? `MCP off (policy.data: false)${on.length ? `, for profiles ${on.join(", ")} ${limit}` : ""}` : `MCP on, ${limit}${off.length ? `, not for profiles ${off.join(", ")}` : ""}`;
    }
    // REST: only where the server's policy or a profile says true
    const restOn = restDataOffered(options);
    const restWho = options.policy?.data === true ? `for every caller${off.length ? ` but profiles ${off.join(", ")}` : ""}` : `for profiles ${on.join(", ")}`;
    const rest = runtime.rest === false ? "" : `; ${restOn ? `REST ${restWho}, up to ${bytesText(restDataBytesOf(options))} (${options.rest?.data?.maxBytes !== undefined ? "rest.data.maxBytes" : "default"})` : "REST off (no policy or profile has data: true)"}`;
    const parts = [...(runtime.mcp === false ? [] : [mcp]), ...(rest ? [rest.slice(2)] : [])];
    if (parts.length) {
        lines.push("", `Data in the request: ${parts.join("; ")}`);
    }
    if (restOn && options.policy?.data === true) {
        lines.push(`  warning: policy.data: true lets every REST caller send its own data, in bodies of up to ${bytesText(restDataBytesOf(options))}; give data: true to the profiles that need it instead`);
    }
    if (restOn && (options.auth?.mode ?? "none") === "none" && options.auth?.allowUnauthenticated) {
        lines.push(`  warning: auth is off on a network address (auth.allowUnauthenticated): anyone who reaches the server may send data, in bodies of up to ${bytesText(restDataBytesOf(options))}`);
    }
    if (!restOn && options.rest?.data?.maxBytes !== undefined) {
        lines.push("  warning: rest.data.maxBytes does nothing: no policy or profile has data: true");
    }
    const upgrade = cap && runtime.mcp !== false ? [`MCP clients may send a small table of their own with source "inline:" (up to ${capText(cap)}); no exposure policy applies to it; mcp.data: false switches it off`] : [];
    return { lines, problems: 0, upgrade };
}

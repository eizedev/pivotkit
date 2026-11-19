/*
 * check-config's section for the rows route (records.js), once a profile names a source in
 * `records`: the route's bounds, and per profile the sources it may read the rows of with the fields
 * that would leave (show) and those that stay (values, summary). A hidden field is not listed.
 *
 *   Rows (REST): POST /api/v1/sources/records
 *     at most 50,000 rows and 1,000,000 cells per answer, 2 at once, idle after 30 s
 *     profile staff: sales, vms
 *       sales: Region, Sales leave; Customer stay
 *       vms: fields known only after a load; leave by rule: name, cpu; summary by default
 *
 * A PROBLEM for a source id no source has, and for a static or signed token whose profile reads
 * rows: such a token is no person, so it gets NOT_ALLOWED. A WARNING for a source with no field at
 * show for the profile, for a profile whose default is show (a column a source gains later leaves
 * too), and for rows requests that can hold every compute worker.
 *
 * check/index.js says what a section returns; check/sources.js reads the columns (runtime.columns).
 */

import { closest } from "pivotkit-core";
import { COMPUTE_DEFAULTS, pathOf } from "../config.js";
import { recordsBoundsOf } from "../options/records.js";
import { fieldKey, levelOf, resolvePolicy } from "../policy.js";
import { signedStore } from "../signed-tokens.js";
import { heading, plain, problem, warning } from "./format.js";
import { nameText } from "./sources.js";

/** What a token that is no person gets, as a PROBLEM's effect says it. */
const NO_PERSON = "the server starts; it gets NOT_ALLOWED from POST /api/v1/sources/records";

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const profiles = Object.entries(options.policy?.profiles ?? {}).filter(([, p]) => /** @type {any} */ (p).records?.length);
    if (!profiles.length) {
        return { items: [], upgrade: [] };
    }
    const reading = new Set(profiles.map(([name]) => name));
    const bounds = recordsBoundsOf(options);
    const items = [heading("Rows (REST): POST /api/v1/sources/records", "Rows")];
    items.push(plain(`at most ${bounds.maxRows.toLocaleString("en-US")} rows and ${bounds.maxCells.toLocaleString("en-US")} cells per answer, ${bounds.concurrency} at once, idle after ${bounds.idleMs / 1000} s`));
    const workers = options.compute?.workers ?? COMPUTE_DEFAULTS.workers;
    if (bounds.concurrency >= workers) {
        items.push(warning(`rest.records.concurrency (${bounds.concurrency}) is not below compute.workers (${workers}): rows requests read by slow clients can hold every worker while reports wait`));
    }
    const ids = Object.keys(options.sources ?? {});
    for (const [name, p] of profiles) {
        const own = /** @type {string[]} */ (/** @type {any} */ (p).records);
        items.push(plain(`profile ${name}: ${own.join(", ")}`));
        if (p.default === "show") {
            items.push(warning(`policy.profiles.${name}: the default is show and the profile reads rows, so a column a source gains later leaves too`));
        }
        for (const id of own) {
            if (!ids.includes(id)) {
                const near = closest(id, ids);
                items.push(problem(`policy.profiles.${name}.records: no source "${String(id).slice(0, 80)}"${near ? `; did you mean "${near}"?` : ""}`, { effect: "the server starts; this entry grants nothing" }));
                continue;
            }
            const source = /** @type {any} */ (options.sources?.[id]);
            const policy = resolvePolicy(options.policy, source.policy, p);
            const columns = runtime.columns.get(id);
            if (columns) {
                const levels = columns.names.map((n) => /** @type {const} */ ([n, levelOf(policy, n)]));
                const leave = levels.filter(([, l]) => l === "show").map(([n]) => nameText(n));
                const stay = levels.filter(([, l]) => l === "values" || l === "summary").map(([n]) => nameText(n));
                items.push(plain(`${id}: ${leave.length ? `${leave.join(", ")} leave` : "no field leaves"}${stay.length ? `; ${stay.join(", ")} stay` : ""}`, 2));
                if (!leave.length) {
                    items.push(warning(`policy.profiles.${name}.records: the source ${id} has no field at show for this profile, so its rows answer NOT_ALLOWED`));
                }
            } else {
                // an HTTP or code source: its fields are known only after a load
                const written = new Map([options.policy?.fields, source.policy?.fields, p.fields].flatMap((f) => Object.keys(f ?? {})).map((n) => [fieldKey(n), n]));
                const shown = [...policy.fields.entries()].filter(([, l]) => l === "show").map(([k]) => written.get(k) ?? k);
                items.push(plain(`${id}: fields known only after a load; ${shown.length ? `leave by rule: ${shown.join(", ")}; ` : ""}${policy.default} by default`, 2));
                if (!shown.length && policy.default !== "show") {
                    items.push(warning(`policy.profiles.${name}.records: the source ${id} has no field at show for this profile, so its rows answer NOT_ALLOWED`));
                }
            }
        }
    }
    const auth = options.auth ?? {};
    const fallback = auth.defaultProfile ?? null;
    if ((auth.mode ?? "none") === "token") {
        for (const [i, token] of (auth.tokens ?? []).entries()) {
            const profile = token.profile ?? fallback;
            if (profile && reading.has(profile)) {
                items.push(problem(`auth.tokens[${i}] (${token.name}): its profile ${profile} reads rows (records), but a static token is no person`, { effect: NO_PERSON }));
            }
        }
        const dir = auth.signedTokens?.dir;
        if (dir) {
            const store = signedStore(pathOf(options, dir));
            const revoked = await store.revokedIds().catch(() => new Map());
            const now = Date.now();
            for (const record of await store.issued().catch(() => [])) {
                const profile = record.profile ?? fallback;
                if (!revoked.has(record.id) && Date.parse(record.expiresAt) > now && profile && reading.has(profile)) {
                    items.push(problem(`auth.signedTokens: the token ${record.id}${record.name ? ` (${nameText(record.name)})` : ""} has the profile ${profile}, which reads rows (records), but a signed token is no person`, { effect: NO_PERSON }));
                }
            }
        }
    }
    return { items, upgrade: [] };
}

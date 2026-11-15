/*
 * check-config's section for the policy profiles (policy.profiles): per profile its default and
 * rules, what it allows beyond the sources' policy, and what its callers get per source: each read
 * column's level (a profile never has the automatic values rule, so a field a plain caller sees at
 * values may be summary here), or, for an HTTP or code source, its policy, since its fields are known
 * only after a load.
 *
 *   Profile staff:
 *     policy: as each source by default; Region show
 *     sales: Region show, Product summary, Customer hide
 *     vms: fields known only after a load; hide by default, name show
 *
 * check/index.js says what a section returns; check/sources.js reads the columns (runtime.columns).
 */

import { fieldKey, levelInfo, resolvePolicy, withStats } from "../policy.js";
import { heading, plain } from "./format.js";
import { nameText } from "./sources.js";

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const items = [];
    for (const [name, p] of Object.entries(options.policy?.profiles ?? {})) {
        const fields = Object.entries(p.fields ?? {});
        items.push(heading(`Profile ${name}:`), plain(`policy: ${p.default ?? "as each source"} by default${fields.length ? `; ${fields.map(([n, l]) => `${runtime.everyColumn?.get(fieldKey(n)) ?? n} ${l}`).join(", ")}` : ""}`));
        if (p.results) {
            items.push(plain("file downloads (REST): allowed"));
        }
        if (p.data === true) {
            items.push(plain("data sent in the request (REST): allowed"));
        }
        for (const [id, source] of Object.entries(options.sources ?? {})) {
            const columns = runtime.columns.get(id);
            const policy = resolvePolicy(options.policy, source.policy, p);
            if (columns) {
                const bound = withStats(policy, columns.stats);
                items.push(plain(`${id}: ${columns.names.map((n) => `${nameText(n)} ${levelInfo(bound, n).level}`).join(", ")}`));
            } else if (!source.file) {
                const written = new Map([options.policy?.fields, source.policy?.fields, p.fields].flatMap((f) => Object.keys(f ?? {})).map((n) => [fieldKey(n), n]));
                const rules = [...policy.fields.entries()].map(([k, l]) => `${written.get(k) ?? k} ${l}`);
                items.push(plain(`${id}: fields known only after a load; ${policy.default} by default${rules.length ? `, ${rules.join(", ")}` : ""}`));
            }
        }
    }
    return { items, upgrade: [] };
}

/*
 * The sources a caller may use: the operator's (by id) and, when allowed, files inside the allowed
 * directories ("file:" and a path). A caller sees and uses only sources whose scopes it holds (and,
 * for a source only a signed-in person can use, sources/auth.js personBound, only with a subject); a
 * source it may not use is "not found", the same answer as for a source that does not exist.
 */

import { readdir, realpath, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { allowedDirs } from "pivotkit-cli/files";
import { closest } from "pivotkit-core";
import { cleanText } from "pivotkit-core/import";
import { OperationError } from "pivotkit-report/operations";
import { pathOf, serverLimitsOf } from "./config.js";
import { asOperationError } from "./data.js";
import { fieldKey, resolvePolicy } from "./policy.js";
import { isPerson, personBound } from "./sources/auth.js";
import { FILE_PREFIX, INLINE_ID, KINDS, kindOf } from "./sources/index.js";
import { resolveFilePath } from "./sources/file.js";
import { resolveInline } from "./sources/inline.js";
import { normalizeParams, paramsList } from "./sources/params.js";
import { readTemplateFile } from "./print-template.js";

export { FILE_PREFIX };

/** The most files list_sources lists per allowed directory. */
export const LISTED_FILES = 100;

/** The data file extensions. */
const DATA_EXTENSIONS = new Set([".csv", ".tsv", ".txt", ".json", ".xlsx"]);

/**
 * @typedef {object} Caller
 * @property {Set<string> | null} scopes  null: every scope (no OAuth)
 * @property {string} client  how the log names the caller (a token's name, an OAuth client id, "local")
 * @property {string | null} [profile]  the policy profile bound to the caller (policy.profiles), or none
 * @property {string | null} [subject]  OAuth: the token's auth.subjectClaim (default sub); null when missing or unusable
 * @property {string | null} [issuer]  OAuth: the token's iss
 * @property {string[]} [groups]  the person's groups; absent counts as none
 * @property {Readonly<Record<string, string | number | boolean>>} [claims]  only claims the configuration names
 */

/** The most characters of a field's description (sources.<id>.fields.<name>.description). */
export const DESCRIPTION_TEXT = 500;

/** Whether a caller holds every scope of a list. */
export const holds = (caller, scopes) => caller.scopes === null || (scopes ?? []).every((s) => caller.scopes?.has(s));

/**
 * The levels at which a report holds exactly what the caller's model was shown: a field shown whole,
 * or a field hidden (dropped when the data is read, so it reaches no report).
 */
const DELIVERY_OPEN = new Set(["show", "hide"]);

/**
 * @typedef {{ profile: string | null, level?: string, field?: string, auto?: true, others?: true, denyList?: true }} ClosedReason
 *   profile: the profile whose policy closes it (null: the policy of a caller without one); level and
 *   field: the level that closes it, of that field (a field key) or of the default; auto: the
 *   automatic "values" rule may apply; others: the level differs from another caller's; denyList: a
 *   field hidden under the default "show", where a column the data gains later would be shown
 */

/**
 * What makes reports over a policy closed for plain links, or null where they are open. A source is
 * open only where nothing new can become visible, for every caller alike (the maintainer's rule,
 * #510):
 *
 * - hidden by default, every field it names "show" or "hide" (an allow list); or
 * - every field "show", nothing hidden (open as before 0.8).
 *
 * Closed, under the server's policy with the source's or under any profile's: a field or the default
 * at "values" or "summary"; the automatic "values" rule (decided by the data at run time); a field at
 * "hide" under the default "show" (a deny list: a column the data gains later would be shown); a level
 * that differs between callers. registry.js (isClosedForDelivery) and check-config (whyClosed) share
 * it.
 * @param {import("./config.js").ServerOptions} options
 * @param {import("./config.js").PolicyOptions | undefined} sourcePolicy
 * @returns {ClosedReason | null}
 */
export function closedReason(options, sourcePolicy) {
    const policies = [[null, undefined], ...Object.entries(options.policy?.profiles ?? {})].map(([profile, p]) => /** @type {const} */ ([/** @type {string | null} */ (profile), resolvePolicy(options.policy, sourcePolicy, p)]));
    for (const [profile, p] of policies) {
        if (p.auto) {
            return { profile, auto: true };
        }
        if (!DELIVERY_OPEN.has(p.default)) {
            return { profile, level: p.default };
        }
        const field = [...p.fields].find(([, level]) => !DELIVERY_OPEN.has(level));
        if (field) {
            return { profile, field: field[0], level: field[1] };
        }
        const hidden = p.default === "show" ? [...p.fields].find(([, level]) => level === "hide") : undefined;
        if (hidden) {
            return { profile, field: hidden[0], level: "hide", denyList: true };
        }
    }
    const [, base] = policies[0];
    const keys = new Set(policies.flatMap(([, p]) => [...p.fields.keys()]));
    for (const [profile, p] of policies.slice(1)) {
        if (p.default !== base.default) {
            return { profile, level: p.default, others: true };
        }
        const field = [...keys].find((key) => (p.fields.get(key) ?? p.default) !== (base.fields.get(key) ?? base.default));
        if (field) {
            return { profile, field, level: p.fields.get(field) ?? p.default, others: true };
        }
    }
    return null;
}

/** Whether reports over a policy are closed for delivery (closedReason). */
const closedUnder = (options, sourcePolicy) => closedReason(options, sourcePolicy) !== null;

/**
 * Whether reports over a source count as closed for delivery (download links, output.baseUrl, an
 * upload target): a field at "values" or "summary", or hidden for some callers only (closedReason),
 * or the data belongs to one person:
 * data sent in the request ("inline:"), a source bound to a person (a claim parameter or a token
 * exchange, sources/auth.js personBound), a code source the operator marked perPerson. Such a report
 * gets a link bound to the person (signIn), a one-time link (once, the operator's explicit opt-in),
 * or none; never a plain link or an output.baseUrl address. A "file:" path counts by files.policy; an
 * id the options do not name counts as closed.
 * @param {import("./config.js").ServerOptions} options
 * @param {string} ref  a source id, "inline:" or "file:<path>"
 * @returns {boolean}
 */
export function isClosedForDelivery(options, ref) {
    if (ref === INLINE_ID) {
        return true;
    }
    if (ref.startsWith(FILE_PREFIX)) {
        return closedUnder(options, options.files?.policy);
    }
    const source = Object.hasOwn(options.sources ?? {}, ref) ? options.sources?.[ref] : undefined;
    if (!source) {
        return true;
    }
    return closedUnder(options, source.policy) || personBound(options, source) || /** @type {any} */ (source).perPerson === true;
}

/**
 * The registry of a server's sources.
 * @param {import("./config.js").ServerOptions} options
 */
export async function createRegistry(options, { log = null } = {}) {
    const limits = serverLimitsOf(options);
    const files = options.files ?? {};
    const allow = await allowedDirs((files.allowDirs ?? []).map((d) => pathOf(options, d)), options.baseDir ?? process.cwd());
    // httpSources.enabled: false leaves every HTTP source out, as if it were not configured
    const sources = new Map(Object.entries(options.sources ?? {}).filter(([, s]) => !(s.http && options.httpSources?.enabled === false)));
    const filePolicy = resolvePolicy(options.policy, files.policy, undefined, { file: true });
    // the sources only a signed-in person can use (a token exchange, a claim): no schedule, and not
    // there for a caller without a subject
    const bound = new Set([...sources.entries()].filter(([, s]) => personBound(options, s)).map(([id]) => id));
    /** Whether a caller may use a source: its scopes, and a person for a bound one. */
    const usable = (caller, id, source) => holds(caller, source.scopes) && (!bound.has(id) || isPerson(caller));
    /** The operator's line when a caller without a subject asks for such a source (the caller reads "not found"). */
    const hidden = (caller, id) => {
        if (bound.has(id) && holds(caller, sources.get(id)?.scopes) && !isPerson(caller)) {
            log?.info(`a source only a signed-in person can use was asked for, and the caller's token has no subject (auth.subjectClaim); it answered "not found"`, { source: id });
        }
    };
    /** The profile a caller's policy takes, if any. */
    const profileOf = (caller) => (caller.profile && Object.hasOwn(options.policy?.profiles ?? {}, caller.profile) ? options.policy?.profiles?.[caller.profile] : undefined);
    // the operator's sources by their files' real paths: a file: path to one of them is that source
    const sourceFiles = new Map();
    for (const [id, source] of sources) {
        if (source.file) {
            const real = await realpath(pathOf(options, source.file)).catch(() => null);
            if (real) {
                sourceFiles.set(real, id);
            }
        }
    }

    /** SOURCE_NOT_FOUND for an id, with the nearest id the caller may use. */
    function notFound(id, caller, how = {}) {
        const known = [...sources.entries()].filter(([k, s]) => usable(caller, k, s)).map(([k]) => k);
        const near = closest(String(id), known);
        throw new OperationError("SOURCE_NOT_FOUND", `no source "${String(id).slice(0, 80)}"${near ? `; did you mean "${near}"?` : ""}; ${how.surface === "rest" ? "GET /sources" : "list_sources"} lists them`);
    }

    /** The source of an id for a caller, or SOURCE_NOT_FOUND (also for one it may not use). */
    function sourceOf(id, caller, how = {}) {
        const source = sources.get(id);
        if (!source || !usable(caller, id, source)) {
            hidden(caller, id);
            notFound(id, caller, how);
        }
        return source;
    }

    const closedSources = new Map([...sources.keys()].map((id) => [id, isClosedForDelivery(options, id)]));

    /** A source's field descriptions by field key, cleaned (no control or direction characters) and capped. */
    const descriptionsOf = (source) => {
        const entries = Object.entries(source.fields ?? {}).filter(([, f]) => typeof f?.description === "string" && f.description);
        return entries.length ? new Map(entries.map(([name, f]) => [fieldKey(name), cleanText(f.description).slice(0, DESCRIPTION_TEXT)])) : null;
    };

    /** What the kinds of source share of the registry. */
    const reg = {
        options,
        files,
        allow,
        limits,
        sources,
        sourceFiles,
        holds,
        notFound,
        levelsOf,
        fileClosed: closedUnder(options, files.policy),
        filePolicyOf: (caller) => (profileOf(caller) ? resolvePolicy(options.policy, files.policy, profileOf(caller), { file: true }) : filePolicy)
    };

    return {
        allow,
        limits,

        /**
         * What a worker needs to read a source, and the policy that applies to it.
         * @param {string} ref  a source id or "file:<path>"
         * @param {Caller} caller
         * @param {{ files?: boolean, surface?: "mcp" | "rest", data?: unknown, upload?: any }} [how]  files: false refuses a file: source whatever files.allowDirs says (REST); surface: whose words a message uses (and, for "inline:", whose rules); data, upload: the table or file "inline:" stands for (sources/inline.js)
         * @param {unknown} [params]  the caller's values for the source's parameters
         */
        async resolve(ref, caller, how = {}, params = undefined) {
            if (typeof ref !== "string" || !ref) {
                throw new OperationError("INVALID_INPUT", "source is a source id or file:<path>");
            }
            if (ref.startsWith(FILE_PREFIX) && how.files === false) {
                throw new OperationError("FILES_NOT_ALLOWED", "this service reads no files by path: use a source id from GET /sources");
            }
            if (ref.startsWith(FILE_PREFIX)) {
                return resolveFilePath(reg, ref, caller, how, params, (id) => this.resolve(id, caller, how, params));
            }
            if (ref === INLINE_ID) {
                return resolveInline(reg, ref, caller, how, params);
            }
            const source = sourceOf(ref, caller, how);
            const kind = kindOf(source);
            const values = normalizeParams(source.params, params, caller, ref);
            const policy = resolvePolicy(options.policy, source.policy, profileOf(caller));
            const template = source.template ? await readTemplate(pathOf(options, source.template)) : undefined;
            return {
                sourceKind: kind,
                policy,
                source: source.load || source.http ? source : null,
                link: source.link ? { url: source.link, key: source.linkKey ?? null } : null,
                template,
                params: values,
                descriptions: descriptionsOf(source),
                sourceClosed: closedSources.get(ref) ?? true,
                personBound: bound.has(ref),
                spec: { id: ref, kind: "source", ...(await KINDS[kind].specOf(reg, ref, source)), name: source.title ?? ref, levels: levelsOf(policy), limits, timeZone: options.timeZone, schedulable: !bound.has(ref) }
            };
        },

        /**
         * The sources a caller may use, for list_sources.
         * @param {Caller} caller
         * @param {{ files?: boolean }} [how]  files: false lists no file: sources (REST)
         */
        async list(caller, how = {}) {
            /** @type {Array<{ id: string, title: string, description?: string, kind: "source" | "file", link: boolean, schedulable: boolean, params?: ReturnType<typeof paramsList> }>} */
            const out = [...sources.entries()]
                .filter(([id, s]) => usable(caller, id, s))
                .map(([id, s]) => ({ id, title: s.title ?? id, ...(s.description ? { description: s.description } : {}), kind: /** @type {const} */ ("source"), link: Boolean(s.link), schedulable: !bound.has(id), ...(s.params && paramsList(s.params).length ? { params: paramsList(s.params) } : {}) }));
            if (files.list && allow.length && holds(caller, files.scopes) && how.files !== false) {
                for (const dir of allow) {
                    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
                    const data = entries.filter((e) => e.isFile() && DATA_EXTENSIONS.has(extname(e.name).toLowerCase()) && !e.name.startsWith(".")).slice(0, LISTED_FILES);
                    for (const e of data) {
                        // a file of the first directory by its name, of another by its full path
                        out.push({ id: `${FILE_PREFIX}${dir === allow[0] ? e.name : resolve(dir, e.name)}`, title: e.name.slice(0, 120), kind: /** @type {const} */ ("file"), link: false, schedulable: false });
                    }
                }
            }
            return out;
        },

        /** The ids of every source (the quick-start page, --check-config). */
        ids: () => [...sources.keys()],

        /**
         * A call's source as a log line names it: a configured id or "inline:" as it is, a file by its
         * kind only ("file:"; its name can be a person's), anything else "unknown", so no text a caller
         * or a model typed reaches the log.
         * @param {unknown} ref  the call's `source`
         * @returns {string | undefined}
         */
        logName(ref) {
            if (typeof ref !== "string") {
                return undefined;
            }
            if (ref === INLINE_ID || sources.has(ref)) {
                return ref;
            }
            return ref.startsWith(FILE_PREFIX) ? FILE_PREFIX : "unknown";
        },
        // the quick-start page has no caller: a source only a signed-in person can use is not there
        titles: () => [...sources.entries()].filter(([id]) => !bound.has(id)).map(([id, s]) => ({ id, title: s.title ?? id, scopes: s.scopes ?? [] })),

        /** For --check-config: each source's file, whether it exists, its fields by level, and whether it is closed for links (isClosedForDelivery). */
        async check() {
            const out = [];
            for (const [id, s] of sources) {
                const policy = resolvePolicy(options.policy, s.policy);
                const file = s.file ? pathOf(options, s.file) : null;
                const exists = file ? await stat(file).then((i) => i.isFile()).catch(() => false) : true;
                out.push({ id, file, exists, policy: { default: policy.default, fields: Object.fromEntries(policy.fields), items: policy.items, inline: policy.inline }, resolved: policy, scopes: s.scopes ?? [], link: s.link ?? null, closed: closedSources.get(id) ?? true });
            }
            return out;
        }
    };

    /** The policy's levels as plain data for a worker (data.js drops the hidden columns). */
    function levelsOf(policy) {
        return { default: policy.default, fields: Object.fromEntries(policy.fields), counts: policy.counts, rows: policy.rows };
    }

    /** An operator's template file, read the safe way (print-template.js, as at start and in check-config). */
    async function readTemplate(path) {
        try {
            return await readTemplateFile(path);
        } catch (e) {
            throw asOperationError(e, path);
        }
    }
}


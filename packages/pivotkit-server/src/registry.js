/*
 * The sources a caller may use: the operator's (by id) and, when allowed, files inside the allowed
 * directories ("file:" and a path). A caller sees and uses only sources whose scopes it holds; a
 * source it may not use is "not found", the same answer as for a source that does not exist.
 */

import { readdir, realpath, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { allowedDirs, readSafe } from "pivotkit-cli/files";
import { closest } from "pivotkit-core";
import { cleanText } from "pivotkit-core/import";
import { OperationError } from "pivotkit-report/operations";
import { SERVER_LIMITS, pathOf } from "./config.js";
import { asOperationError } from "./data.js";
import { fieldKey, resolvePolicy } from "./policy.js";
import { FILE_PREFIX, INLINE_ID, KINDS, kindOf } from "./sources/index.js";
import { resolveFilePath } from "./sources/file.js";
import { resolveInline } from "./sources/inline.js";
import { normalizeParams, paramsList } from "./sources/params.js";

export { FILE_PREFIX };

/** The most files list_sources lists per allowed directory. */
export const LISTED_FILES = 100;

/** The data file extensions. */
const DATA_EXTENSIONS = new Set([".csv", ".tsv", ".txt", ".json", ".xlsx"]);

/** The most characters of a template file. */
const TEMPLATE_BYTES = 1_048_576;

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
 * The registry of a server's sources.
 * @param {import("./config.js").ServerOptions} options
 */
export async function createRegistry(options) {
    const limits = { ...SERVER_LIMITS, ...(options.limits ?? {}) };
    const files = options.files ?? {};
    const allow = await allowedDirs((files.allowDirs ?? []).map((d) => pathOf(options, d)), options.baseDir ?? process.cwd());
    const sources = new Map(Object.entries(options.sources ?? {}));
    const filePolicy = resolvePolicy(options.policy, files.policy, undefined, { file: true });
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
        const known = [...sources.entries()].filter(([, s]) => holds(caller, s.scopes)).map(([k]) => k);
        const near = closest(String(id), known);
        throw new OperationError("SOURCE_NOT_FOUND", `no source "${String(id).slice(0, 80)}"${near ? `; did you mean "${near}"?` : ""}; ${how.surface === "rest" ? "GET /sources" : "list_sources"} lists them`);
    }

    /** The source of an id for a caller, or SOURCE_NOT_FOUND (also for one it may not use). */
    function sourceOf(id, caller, how = {}) {
        const source = sources.get(id);
        if (!source || !holds(caller, source.scopes)) {
            notFound(id, caller, how);
        }
        return source;
    }

    /**
     * Whether a field of a source, under the server's, the source's or any profile's policy, is not
     * "show". A policy the automatic "values" rule may apply to (`auto`, decided by the data at run
     * time) counts as closed, whatever its written levels say.
     */
    const closedUnder = (sourcePolicy) => [undefined, ...Object.values(options.policy?.profiles ?? {})].some((profile) => {
        const p = resolvePolicy(options.policy, sourcePolicy, profile);
        return p.default !== "show" || [...p.fields.values()].some((l) => l !== "show") || Boolean(p.auto);
    });
    const closedSources = new Map([...sources.entries()].map(([id, s]) => [id, closedUnder(s.policy)]));

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
        fileClosed: closedUnder(files.policy),
        filePolicyOf: (caller) => (profileOf(caller) ? resolvePolicy(options.policy, files.policy, profileOf(caller), { file: true }) : filePolicy)
    };

    return {
        allow,
        limits,

        /**
         * What a worker needs to read a source, and the policy that applies to it.
         * @param {string} ref  a source id or "file:<path>"
         * @param {Caller} caller
         * @param {{ files?: boolean, surface?: "mcp" | "rest" }} [how]  files: false refuses a file: source whatever files.allowDirs says (REST); surface: whose words a message uses
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
                return resolveInline(reg, ref, caller, how);
            }
            const source = sourceOf(ref, caller, how);
            const kind = kindOf(source);
            const values = normalizeParams(source.params, params, caller, ref);
            const policy = resolvePolicy(options.policy, source.policy, profileOf(caller));
            const template = source.template ? await readTemplate(pathOf(options, source.template)) : undefined;
            return {
                sourceKind: kind,
                policy,
                source: source.load ? source : null,
                link: source.link ? { url: source.link, key: source.linkKey ?? null } : null,
                template,
                params: values,
                descriptions: descriptionsOf(source),
                sourceClosed: closedSources.get(ref) ?? true,
                spec: { id: ref, kind: "source", ...(await KINDS[kind].specOf(reg, ref, source)), name: source.title ?? ref, levels: levelsOf(policy), limits, timeZone: options.timeZone, schedulable: true }
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
                .filter(([, s]) => holds(caller, s.scopes))
                .map(([id, s]) => ({ id, title: s.title ?? id, ...(s.description ? { description: s.description } : {}), kind: /** @type {const} */ ("source"), link: Boolean(s.link), schedulable: true, ...(s.params && paramsList(s.params).length ? { params: paramsList(s.params) } : {}) }));
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
        titles: () => [...sources.entries()].map(([id, s]) => ({ id, title: s.title ?? id, scopes: s.scopes ?? [] })),

        /** For --check-config: each source's file, whether it exists, its fields by level, and whether it is closed (a field not "show" for someone). */
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

    /** An operator's template file, read the safe way. */
    async function readTemplate(path) {
        try {
            return new TextDecoder().decode(await readSafe(path, { cwd: "/", allow: [], maxBytes: TEMPLATE_BYTES, limit: "template" }));
        } catch (e) {
            throw asOperationError(e, path);
        }
    }
}


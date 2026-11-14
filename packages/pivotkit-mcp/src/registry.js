/*
 * The sources a caller may use: the operator's (by id) and, when allowed, files inside the allowed
 * directories ("file:" and a path). A caller sees and uses only sources whose scopes it holds; a
 * source it may not use is "not found", the same answer as for a source that does not exist.
 */

import { readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, resolve, sep } from "node:path";
import { allowedDirs, isInside, readSafe } from "pivotkit-cli/files";
import { closest } from "pivotkit-core";
import { OperationError } from "pivotkit-report/operations";
import { SERVER_LIMITS, pathOf } from "./config.js";
import { asOperationError } from "./data.js";
import { resolvePolicy } from "./policy.js";

/** The prefix of a file source. */
export const FILE_PREFIX = "file:";

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
 */

/** Whether a caller holds every scope of a list. */
export const holds = (caller, scopes) => caller.scopes === null || (scopes ?? []).every((s) => caller.scopes?.has(s));

/**
 * The registry of a server's sources.
 * @param {import("./config.js").McpOptions} options
 */
export async function createRegistry(options) {
    const limits = { ...SERVER_LIMITS, ...(options.limits ?? {}) };
    const files = options.files ?? {};
    const allow = await allowedDirs((files.allowDirs ?? []).map((d) => pathOf(options, d)), options.baseDir ?? process.cwd());
    const sources = new Map(Object.entries(options.sources ?? {}));
    const filePolicy = resolvePolicy(options.policy, files.policy);

    /** The source of an id for a caller, or SOURCE_NOT_FOUND (also for one it may not use). */
    function sourceOf(id, caller) {
        const source = sources.get(id);
        if (!source || !holds(caller, source.scopes)) {
            const known = [...sources.entries()].filter(([, s]) => holds(caller, s.scopes)).map(([k]) => k);
            const near = closest(String(id), known);
            throw new OperationError("SOURCE_NOT_FOUND", `no source "${String(id).slice(0, 80)}"${near ? `; did you mean "${near}"?` : ""}; list_sources lists them`);
        }
        return source;
    }

    /** The real path of a file source's path, inside an allowed directory. */
    async function filePath(path) {
        if (!allow.length) {
            throw new OperationError("FILES_NOT_ALLOWED", "this server reads no files by path: use a source id from list_sources");
        }
        if (!path || path.includes("\0")) {
            throw new OperationError("INVALID_INPUT", 'a file source is "file:" and a path');
        }
        const candidates = isAbsolute(path) ? [path] : allow.map((dir) => resolve(dir, path));
        for (const candidate of candidates) {
            const real = await realpath(candidate).catch(() => null);
            if (real && allow.some((dir) => isInside(real, dir))) {
                return real;
            }
        }
        throw new OperationError("FILE_NOT_AVAILABLE", `${path.split(/[\\/]/).pop()?.slice(0, 80)}: not available (no such file in the allowed directories)`);
    }

    return {
        allow,
        limits,

        /**
         * What a worker needs to read a source, and the policy that applies to it.
         * @param {string} ref  a source id or "file:<path>"
         * @param {Caller} caller
         */
        async resolve(ref, caller) {
            if (typeof ref !== "string" || !ref) {
                throw new OperationError("INVALID_INPUT", "source is a source id or file:<path>");
            }
            if (ref.startsWith(FILE_PREFIX)) {
                if (!holds(caller, files.scopes)) {
                    throw new OperationError("FILES_NOT_ALLOWED", "you may not read files by path: use a source id from list_sources");
                }
                const real = await filePath(ref.slice(FILE_PREFIX.length));
                const name = real.split(sep).pop() ?? "file";
                return {
                    policy: filePolicy,
                    source: null,
                    link: null,
                    template: undefined,
                    spec: { id: ref, kind: "file", path: real, allow, hardLinks: files.hardLinks ?? false, name, levels: levelsOf(filePolicy), limits, timeZone: options.timeZone, schedulable: false }
                };
            }
            const source = sourceOf(ref, caller);
            const policy = resolvePolicy(options.policy, source.policy);
            const template = source.template ? await readTemplate(pathOf(options, source.template)) : undefined;
            return {
                policy,
                source: source.load ? source : null,
                link: source.link ? { url: source.link, key: source.linkKey ?? null } : null,
                template,
                spec: { id: ref, kind: "source", ...(source.file ? { path: await realpath(pathOf(options, source.file)).catch(() => pathOf(options, source.file)) } : {}), allow: [], hardLinks: true, ...(source.sheet ? { sheet: source.sheet } : {}), name: source.title ?? ref, levels: levelsOf(policy), limits, timeZone: options.timeZone, schedulable: true }
            };
        },

        /**
         * The sources a caller may use, for list_sources.
         * @param {Caller} caller
         */
        async list(caller) {
            /** @type {Array<{ id: string, title: string, description?: string, kind: "source" | "file", link: boolean, schedulable: boolean }>} */
            const out = [...sources.entries()]
                .filter(([, s]) => holds(caller, s.scopes))
                .map(([id, s]) => ({ id, title: s.title ?? id, ...(s.description ? { description: s.description } : {}), kind: /** @type {const} */ ("source"), link: Boolean(s.link), schedulable: true }));
            if (files.list && allow.length && holds(caller, files.scopes)) {
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

        /** For --check-config: each source's file, whether it exists, and its fields by level. */
        async check() {
            const out = [];
            for (const [id, s] of sources) {
                const policy = resolvePolicy(options.policy, s.policy);
                const file = s.file ? pathOf(options, s.file) : null;
                const exists = file ? await stat(file).then((i) => i.isFile()).catch(() => false) : true;
                out.push({ id, file, exists, policy: { default: policy.default, fields: Object.fromEntries(policy.fields), items: policy.items, inline: policy.inline }, scopes: s.scopes ?? [], link: s.link ?? null });
            }
            return out;
        }
    };

    /** The policy's levels as plain data for a worker (data.js drops the hidden columns). */
    function levelsOf(policy) {
        return { default: policy.default, fields: Object.fromEntries(policy.fields) };
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


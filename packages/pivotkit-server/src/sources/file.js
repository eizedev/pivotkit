/*
 * File sources: an operator's source with a file (sources.<id>.file) and a file a caller names by
 * path ("file:" and a path inside files.allowDirs). A compute worker reads the file (data.js
 * fileData), so the main thread never parses it.
 */

import { realpath } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { isInside } from "pivotkit-cli/files";
import { OperationError } from "pivotkit-report/operations";
import { pathOf } from "../config.js";

/** The prefix of a file source. */
export const FILE_PREFIX = "file:";

/** The real path of a file source's path, inside an allowed directory. */
async function filePath(allow, path) {
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

/**
 * A "file:" source for a caller: the operator's source when the path is one of its files (its scopes
 * and policy hold), else the file with files.policy.
 * @param {any} reg  the registry's internals (registry.js)
 * @param {string} ref
 * @param {import("../registry.js").Caller} caller
 * @param {any} how
 * @param {unknown} params
 * @param {(id: string) => Promise<any>} resolveId  resolves an operator's source id for the same caller
 */
export async function resolveFilePath(reg, ref, caller, how, params, resolveId) {
    if (!reg.holds(caller, reg.files.scopes)) {
        throw new OperationError("FILES_NOT_ALLOWED", "you may not read files by path: use a source id from list_sources");
    }
    const real = await filePath(reg.allow, ref.slice(FILE_PREFIX.length));
    const name = real.split(sep).pop() ?? "file";
    if (reg.sourceFiles.has(real)) {
        const id = reg.sourceFiles.get(real);
        // its scopes and its policy hold: a caller without them gets what a missing file gets
        if (!reg.holds(caller, reg.sources.get(id)?.scopes)) {
            throw new OperationError("FILE_NOT_AVAILABLE", `${name.slice(0, 80)}: not available (no such file in the allowed directories)`);
        }
        return resolveId(id);
    }
    if (params !== undefined && params !== null && Object.keys(params).length) {
        throw new OperationError("INVALID_INPUT", "a file: source takes no params");
    }
    const policy = reg.filePolicyOf(caller);
    return {
        sourceKind: "file",
        policy,
        source: null,
        link: null,
        template: reg.templateOf(null),
        params: null,
        descriptions: null,
        sourceClosed: reg.fileClosed,
        spec: { id: ref, kind: "file", path: real, allow: reg.allow, hardLinks: reg.files.hardLinks ?? false, name, levels: reg.levelsOf(policy), limits: reg.limits, timeZone: reg.options.timeZone, schedulable: false }
    };
}

/** An operator's file source: what a worker needs to read it. */
export const fileKind = Object.freeze({
    /**
     * @param {any} reg
     * @param {string} id
     * @param {any} source
     */
    async specOf(reg, id, source) {
        return { path: await realpath(pathOf(reg.options, source.file)).catch(() => pathOf(reg.options, source.file)), allow: [], hardLinks: true, ...(source.sheet ? { sheet: source.sheet } : {}) };
    },

    /**
     * Runs an operation over the file in a worker.
     * @param {any} computer
     * @param {string} op
     * @param {any} input
     * @param {any} resolved
     * @param {any} base  link, template, locale, time zone
     */
    run(computer, op, input, resolved, base) {
        return computer.run(op, input, { ...base, spec: resolved.spec });
    }
});

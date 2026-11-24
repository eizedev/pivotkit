/*
 * render, validate and describe run pivotkit-report's operations: the environment an operation runs
 * in for one command (the data, the limits, the locale, the time zone and --now), and the run with
 * its errors as the CLI's.
 */

import { encode } from "pivotkit-core";
import { OPERATIONS } from "pivotkit-report/operations";
import { asCliError } from "pivotkit-node/files";
import { limitsOption } from "./options.js";

/**
 * The environment of pivotkit-report's operations for one command: the data of --data (encoded), or
 * the fields a view file lists when there is no data.
 * @param {any} ctx
 * @param {{ table: any, name: string, notes: any[] } | null} data
 * @param {Array<{ name: string, type: string }> | null} [fields]
 * @returns {import("pivotkit-report/operations").OperationEnv}
 */
export function operationEnv(ctx, data, fields = null) {
    const encoded = data ? encode(data.table, { timeZone: ctx.timeZone ?? "UTC", ...limitsOption(ctx.limits) }) : null;
    return {
        data: async () => (encoded ? { data: encoded, name: data.name, notes: data.notes } : { data: fields ?? [], name: "", notes: [] }),
        ...limitsOption(ctx.limits),
        ...(ctx.locale ? { locale: ctx.locale } : {}),
        ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}),
        ...(ctx.now ? { now: ctx.now } : {})
    };
}

/** Runs an operation of pivotkit-report's table, its errors as the CLI's. */
export async function runOperation(name, input, env, path) {
    try {
        return await OPERATIONS[name].run(input, env);
    } catch (e) {
        throw asCliError(e, path);
    }
}

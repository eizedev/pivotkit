/*
 * The options of a command: parsed with the table of commands.js, defaults from the environment, and
 * the checks every command makes the same way. A wrong option or value is a usage error (exit 2) that
 * names it, with "did you mean" where a known one is close.
 */

import { parseArgs } from "node:util";
import { LIMITS, closest } from "pivotkit-core";
import { CliError, printable } from "pivotkit-node/files";
import { DOCS, WHERE, optionsOf } from "./commands.js";

/** "; did you mean --x?" or "" (pivotkit-core's closest(), as the view's and the template's hints). */
export const didYouMean = (word, known, prefix = "") => {
    const near = closest(word, known);
    return near ? `; did you mean ${prefix}${near}?` : "";
};

/** Parses a command's arguments with the table's options; unknown ones are a usage error with a hint. */
export function parse(command, args) {
    const specs = optionsOf(command);
    /** @type {Record<string, any>} */
    const options = Object.fromEntries(Object.entries(specs).map(([name, s]) => [name, { type: s.type, ...(s.short ? { short: s.short } : {}), ...(s.multiple ? { multiple: true } : {}) }]));
    try {
        return parseArgs({ args, options, allowPositionals: true, strict: true });
    } catch (e) {
        const flag = /'(-{1,2}[^'\s]+)'/.exec(String(e.message))?.[1] ?? "";
        if (e.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
            throw new CliError("usage", "UNKNOWN_OPTION", `unknown option ${printable(JSON.stringify(flag))}${didYouMean(flag.replace(/^-+/, ""), Object.keys(specs), "--")}`);
        }
        // Node's message ends a sentence: the full stop goes, as pivotkit's own messages have none
        throw new CliError("usage", "BAD_OPTION", printable(String(e.message).split("\n")[0].replace(/\.$/, "")));
    }
}

/** Checks the values of options that take one of a list. */
export function checkChoices(command, values) {
    for (const [name, spec] of Object.entries(optionsOf(command))) {
        if (spec.choices && values[name] !== undefined && !spec.choices.includes(values[name])) {
            throw new CliError("usage", "BAD_VALUE", `--${name} takes ${spec.choices.join(", ")}, not ${printable(JSON.stringify(values[name]))}${didYouMean(String(values[name]), spec.choices)}`);
        }
    }
}

/**
 * The options of --limit for pivotkit-core: none when none is given.
 * @param {Record<string, number>} limits
 */
export const limitsOption = (limits) => (Object.keys(limits).length ? { limits } : {});

/** --limit key=n, checked against pivotkit-core's LIMITS. */
export function limitsOf(list) {
    /** @type {Record<string, number>} */
    const limits = {};
    for (const entry of list ?? []) {
        const m = /^([A-Za-z]+)=(\d+)$/.exec(entry);
        if (!m) {
            throw new CliError("usage", "BAD_LIMIT", `--limit takes key=number, not ${printable(JSON.stringify(entry))}`);
        }
        if (!Object.hasOwn(LIMITS, m[1])) {
            throw new CliError("usage", "UNKNOWN_LIMIT", `unknown limit "${printable(m[1])}"${didYouMean(m[1], Object.keys(LIMITS))} (the limits: ${DOCS}concepts/limits/)`);
        }
        const value = Number(m[2]);
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new CliError("usage", "BAD_LIMIT", `--limit ${m[1]} must be a whole number of 1 or more`);
        }
        limits[m[1]] = value;
    }
    return limits;
}

/** A whole number option within bounds. */
export function intOption(name, value, min, max) {
    if (value === undefined) {
        return undefined;
    }
    const n = Number(value);
    if (!/^\d+$/.test(value) || n < min || n > max) {
        throw new CliError("usage", "BAD_VALUE", `--${name} takes a whole number from ${min} to ${max}`);
    }
    return n;
}

/**
 * An option given where it does not act (the table's `where`) is a usage error that names it, never
 * silently ignored: a local one with a server (--data with --source), a server's one without.
 * @param {string} command
 * @param {Record<string, any>} values  as given on the command line
 * @param {boolean} remote
 */
export function checkWhere(command, values, remote) {
    if (!["render", "validate", "describe", "sources"].includes(command)) {
        return;
    }
    for (const [name, spec] of Object.entries(optionsOf(command))) {
        if (values[name] === undefined) {
            continue;
        }
        if (remote && spec.where === "local") {
            throw new CliError("usage", "NOT_REMOTE", `--${name} is not available with --source or --url (${WHERE.local}: it acts on local data and files)`);
        }
        if (!remote && spec.where === "remote") {
            throw new CliError("usage", "NEEDS_SERVER", `--${name} acts ${WHERE.remote} only: give --url (or PIVOTKIT_URL) and --source`);
        }
    }
}

/**
 * Defaults from the environment, set into `values`: an option given wins; a variable of an option
 * that does not act in this mode is not used.
 * @param {string} command
 * @param {Record<string, any>} values  as given on the command line; the defaults are added
 * @param {Record<string, string | undefined>} env
 * @param {boolean} remote
 * @returns {{ fromEnv: Record<string, string>, unused: string[] }}  the options whose value came from a variable, and the variables not used with a server
 */
export function envDefaults(command, values, env, remote) {
    /** @type {Record<string, string>} */
    const fromEnv = {};
    const unused = [];
    for (const [name, spec] of Object.entries(optionsOf(command))) {
        if (spec.env && values[name] === undefined && env[spec.env]) {
            if ((remote && spec.where === "local") || (!remote && spec.where === "remote")) {
                if (remote) unused.push(spec.env);
                continue;
            }
            values[name] = env[spec.env];
            fromEnv[name] = spec.env;
        }
    }
    return { fromEnv, unused };
}

/**
 * Checks the options every command takes the same way, so a wrong one (or a wrong environment
 * variable) is an error in every command, not only in the one that uses it.
 * @param {Record<string, any>} values
 * @param {Record<string, string>} fromEnv
 */
export function checkValues(values, fromEnv) {
    const bad = (name, what) => new CliError("usage", "BAD_VALUE", `--${name} ${printable(JSON.stringify(values[name]))} is not ${what}${fromEnv[name] ? ` (from ${fromEnv[name]})` : ""}`);
    if (values.locale !== undefined && !knownLocale(values.locale)) {
        throw bad("locale", "a locale tag such as en-US or de-DE");
    }
    if (values["time-zone"] !== undefined && !knownTimeZone(values["time-zone"])) {
        throw bad("time-zone", "a time zone such as UTC or Europe/Berlin");
    }
    if (values.now !== undefined && Number.isNaN(new Date(values.now).getTime())) {
        throw bad("now", "a date or an ISO time such as 2026-11-13 or 2026-11-13T09:00:00Z");
    }
}

/**
 * Whether this runtime formats numbers in a locale: a tag it has no number format for would format in
 * the machine's locale.
 * @param {string} tag
 */
function knownLocale(tag) {
    try {
        return Intl.NumberFormat.supportedLocalesOf(Intl.getCanonicalLocales(tag)).length > 0;
    } catch {
        // no language tag
        return false;
    }
}

/**
 * Whether this runtime knows a time zone.
 * @param {string} zone
 */
export function knownTimeZone(zone) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

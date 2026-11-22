// Growth guards: the code and the docs may not grow by appending. Four checks:
//
//   functions    ESLint's max-lines-per-function and complexity over packages/*/src
//   unused       exports and files nobody imports (knip, knip.json)
//   duplication  copied code over packages/*/src (jscpd, a fixed threshold in .jscpd.json)
//   docs         lines per docs page, by kind of page, and the size of all docs together
//
//   node scripts/growth.js [guard...]                    check (all four without a name)
//   node scripts/growth.js --update                      lower the baseline to what is measured now
//   node scripts/growth.js --update --accept-growth      write the baseline even where it grew
//
// functions, unused and docs are ratchets: the offenders of the day they came in are in
// scripts/growth-baseline.json with their numbers. A check fails when an offender grows or a new
// one appears. It also fails when an offender shrank or went: the baseline must follow in the same
// pull request (--update), or the room it left could be filled again unseen.
//
// --update never raises an entry by itself. Raising one is --accept-growth, and the pull request
// says why. A function is known by its file and name, so a renamed or moved offender counts as a new
// one and needs --accept-growth too. ESLint's own bulk suppressions count violations per file and
// rule, so a function that grows from 300 to 400 lines would pass them: this script keeps the numbers.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { isMain } from "./is-main.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const BASELINE = new URL("growth-baseline.json", import.meta.url);
const UPDATE = "node scripts/growth.js --update";

/** The baseline before the first one is written: everything found counts as grown. */
const EMPTY = Object.freeze({ functions: { lines: {}, complexity: {} }, unused: [], docs: { pages: {}, totalLines: 0 } });

/**
 * The limits for a function in packages/*\/src. ESLint's defaults are 50 lines and a complexity of
 * 20. A ratchet starts where the outliers begin, so its baseline names the outliers, not half of the
 * code. Blank lines and comments do not count: the why-comments this repository asks for should cost
 * nothing.
 */
export const FUNCTION_LIMITS = Object.freeze({ lines: 120, complexity: 25 });

/**
 * The most lines a docs page of each kind may have, by its folder under docs/ ("" is a page directly
 * in docs/). Each limit sits at the upper end of that kind's ordinary pages, so the outliers are the
 * ones listed. A use/ page is one task; a getting-started page is read from top to bottom in one go;
 * a reference page is looked things up in and may be longer; a decision record is one decision.
 */
export const DOCS_LIMITS = Object.freeze({ "": 400, use: 300, concepts: 300, embed: 300, "getting-started": 400, reference: 600, decisions: 150 });

/**
 * How far the lines of all docs together may drift from the baseline, in percent, before it is
 * updated. Not zero: every docs change would then edit the same line of the baseline, and parallel
 * pull requests would conflict on it. One percent is about 250 lines.
 */
export const DOCS_TOTAL_MARGIN = 1;

/** The folders under docs/ that hold build output, not pages. */
const DOCS_BUILD_OUTPUT = new Set(["playground", "schema", "assets"]);

/** What to do when a guard fails, said once per guard. */
const ADVICE = {
    functions: `Split the function into smaller ones, one job each (AGENTS.md, "How we build"). Limits: ${FUNCTION_LIMITS.lines} lines without blank lines and comments, complexity ${FUNCTION_LIMITS.complexity}.`,
    unused: "Delete the export or the file nobody uses. If it is public API, export it from the package's entry point (its package.json \"exports\"). If knip is wrong, say so in knip.json.",
    duplication: "Move the copied code into one function or module that both places import (AGENTS.md, \"One place per fact\"). The threshold is in .jscpd.json.",
    docs: "Shorten the page, or split it into pages with one topic each; rewrite instead of appending (AGENTS.md, \"Docs and changelogs\").",
};

const posix = (path, base = root) => relative(base, path).split(sep).join("/");

/**
 * The name and number of an ESLint message of max-lines-per-function or complexity, as
 * "Arrow function 'onClick'" and 140. Throws on any other wording: a guard that reads nothing
 * must not report nothing.
 * @param {{ ruleId: string | null, message: string }} message
 * @returns {{ metric: "lines" | "complexity", name: string, value: number }}
 */
export function parseFunctionMessage({ ruleId, message }) {
    const pattern = ruleId === "max-lines-per-function" ? /^(.+) has too many lines \((\d+)\)\./ : ruleId === "complexity" ? /^(.+) has a complexity of (\d+)\./ : null;
    const match = pattern?.exec(message);
    if (!match) throw new Error(`growth: unexpected ESLint message (${ruleId}): ${message}`);
    return { metric: ruleId === "complexity" ? "complexity" : "lines", name: match[1], value: Number(match[2]) };
}

/**
 * Adds `value` to the list under `key`, kept in descending order. Several anonymous functions of a
 * file share a name; a sorted list of their numbers compares without knowing which one is which.
 * @param {Record<string, number[]>} map
 * @param {string} key
 * @param {number} value
 */
function addSorted(map, key, value) {
    (map[key] ??= []).push(value);
    map[key].sort((a, b) => b - a);
}

/**
 * The functions in packages/*\/src over FUNCTION_LIMITS, as "<file> <name>" -> numbers per metric.
 * @param {string} [cwd]
 * @returns {Promise<{ lines: Record<string, number[]>, complexity: Record<string, number[]> }>}
 */
export async function measureFunctions(cwd = root) {
    const rules = {
        "max-lines-per-function": ["error", { max: FUNCTION_LIMITS.lines, skipBlankLines: true, skipComments: true }],
        complexity: ["error", { max: FUNCTION_LIMITS.complexity }],
    };
    // allowInlineConfig: an eslint-disable comment does not hide a function from the guard
    const eslint = new ESLint({ cwd, allowInlineConfig: false, overrideConfig: { files: ["packages/*/src/**"], rules }, ruleFilter: ({ ruleId }) => ruleId in rules });
    const results = await eslint.lintFiles(["packages/*/src/**/*.{js,jsx}"]);
    if (results.length === 0) throw new Error("growth: ESLint found no files in packages/*/src");
    const found = { lines: {}, complexity: {} };
    for (const result of results) {
        for (const message of result.messages) {
            if (message.fatal) throw new Error(`growth: ${posix(result.filePath, cwd)}: ${message.message}`);
            const { metric, name, value } = parseFunctionMessage(message);
            addSorted(found[metric], `${posix(result.filePath, cwd)} ${name}`, value);
        }
    }
    return found;
}

/**
 * Runs a tool's script from node_modules in the repository's root and returns what it printed.
 * @param {string} script  path below node_modules
 * @param {string[]} args
 */
function run(script, args) {
    const result = spawnSync(process.execPath, [join(root, "node_modules", script), ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (result.error) throw result.error;
    return result;
}

/**
 * knip's JSON report as a sorted list of "<file> <type> <name>" lines; an unused file is
 * "<file> files". Throws when the report does not have the shape this reads.
 * @param {string} json
 * @returns {string[]}
 */
export function parseKnipReport(json) {
    const { issues } = JSON.parse(json);
    if (!Array.isArray(issues)) throw new Error("growth: knip's report has no issues list");
    const lines = [];
    for (const issue of issues) {
        for (const [type, found] of Object.entries(issue)) {
            if (!Array.isArray(found) || type === "owners") continue;
            for (const item of found) {
                // a duplicate is a list of the names one value is exported under
                const name = Array.isArray(item) ? item.map((i) => i.name).join("=") : item.name;
                lines.push(type === "files" ? `${issue.file} files` : `${issue.file} ${type} ${name}`);
            }
        }
    }
    return [...new Set(lines)].sort();
}

/** The unused exports and files knip finds with knip.json. */
export function measureUnused() {
    const result = run("knip/bin/knip.js", ["--reporter", "json", "--no-exit-code", "--no-progress"]);
    if (result.status !== 0) throw new Error(`growth: knip failed (${result.status}):\n${result.stderr}`);
    return parseKnipReport(result.stdout);
}

/**
 * Lines of every docs page (docs/**\/*.md outside build output), as path -> lines.
 * @param {string} [dir]
 * @returns {Record<string, number>}
 */
export function docsPages(dir = `${root}docs`) {
    const pages = {};
    for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const path = relative(dir, `${entry.parentPath}${sep}${entry.name}`).split(sep).join("/");
        if (DOCS_BUILD_OUTPUT.has(path.split("/")[0])) continue;
        const text = readFileSync(`${entry.parentPath}${sep}${entry.name}`, "utf8");
        pages[`docs/${path}`] = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    }
    return pages;
}

/**
 * The limit of a docs page by its folder. Throws for a folder without one, so a new kind of page
 * gets a limit when it comes.
 * @param {string} page  "docs/<kind>/<name>.md" or "docs/<name>.md"
 */
export function docsLimit(page) {
    const parts = page.split("/");
    const kind = parts.length > 2 ? parts[1] : "";
    if (!(kind in DOCS_LIMITS)) throw new Error(`growth: docs/${kind}/ has no line limit: add one to DOCS_LIMITS in scripts/growth.js`);
    return DOCS_LIMITS[kind];
}

/**
 * The docs pages over their limit and the lines of all pages together.
 * @param {Record<string, number>} pages
 * @returns {{ pages: Record<string, number[]>, totalLines: number }}
 */
export function measureDocs(pages = docsPages()) {
    const over = {};
    let totalLines = 0;
    for (const [page, lines] of Object.entries(pages)) {
        totalLines += lines;
        if (lines > docsLimit(page)) over[page] = [lines];
    }
    return { pages: over, totalLines };
}

/**
 * Compares numbers per key with the baseline's. Returns what grew or is new, and what shrank or
 * went (the baseline is then stale). Under one key (several anonymous functions of a file) each
 * number is matched to the smallest baseline number that still covers it, so a new offender
 * between two old ones counts once and the old ones stay matched.
 * @param {Record<string, number[]>} baseline
 * @param {Record<string, number[]>} current
 * @param {string} unit  e.g. "lines"
 * @returns {{ grew: string[], stale: string[] }}
 */
export function compareCounts(baseline, current, unit) {
    const grew = [];
    const stale = [];
    for (const key of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
        const was = [...(baseline[key] ?? [])].sort((a, b) => a - b);
        const unmatched = [];
        for (const value of [...(current[key] ?? [])].sort((a, b) => b - a)) {
            const fit = was.findIndex((w) => w >= value);
            if (fit === -1) {
                unmatched.push(value);
                continue;
            }
            const [old] = was.splice(fit, 1);
            if (old > value) stale.push(`${key}: ${value} ${unit}, baseline ${old}`);
        }
        // what is left on both sides: an old offender that grew, a new one, or one that went
        was.reverse();
        unmatched.forEach((value, i) => grew.push(i < was.length ? `${key}: ${value} ${unit}, baseline ${was[i]}` : `${key}: ${value} ${unit}, new`));
        for (const old of was.slice(unmatched.length)) stale.push(`${key}: ${old} ${unit} in the baseline, now within the limit`);
    }
    return { grew, stale };
}

/**
 * Compares a list of findings with the baseline's.
 * @param {string[]} baseline
 * @param {string[]} current
 */
export function compareLists(baseline, current) {
    const was = new Set(baseline);
    const now = new Set(current);
    return { grew: current.filter((f) => !was.has(f)), stale: baseline.filter((f) => !now.has(f)).map((f) => `${f}: gone`) };
}

/**
 * Compares the lines of all docs with the baseline's, within DOCS_TOTAL_MARGIN.
 * @param {number} baseline
 * @param {number} current
 */
export function compareTotal(baseline, current) {
    const margin = (baseline * DOCS_TOTAL_MARGIN) / 100;
    const text = `all docs pages: ${current} lines, baseline ${baseline} (margin ${DOCS_TOTAL_MARGIN} %)`;
    if (current > baseline + margin) return { grew: [text], stale: [] };
    if (current < baseline - margin) return { grew: [], stale: [text] };
    return { grew: [], stale: [] };
}

/** The duplication check: jscpd with .jscpd.json, which fails above its threshold. */
function checkDuplication() {
    const result = run("jscpd/run-jscpd.js", ["--no-colors"]);
    if (result.status === 0) return { grew: [], stale: [] };
    const reason = /ERROR: .*/.exec(result.stdout + result.stderr)?.[0];
    if (!reason) throw new Error(`growth: jscpd failed (${result.status}):\n${result.stderr || result.stdout}`);
    // the console reporter has listed each clone above the error
    return { grew: [`${result.stdout.trim()}\n${reason}`], stale: [] };
}

/** Each guard: what it measures now (for the baseline) and how that compares. */
const GUARDS = {
    functions: {
        measure: async () => ({ functions: await measureFunctions() }),
        compare: (base, now) => merge(compareCounts(base.functions.lines, now.functions.lines, "lines"), compareCounts(base.functions.complexity, now.functions.complexity, "complexity")),
    },
    unused: {
        measure: async () => ({ unused: measureUnused() }),
        compare: (base, now) => compareLists(base.unused, now.unused),
    },
    duplication: {
        // no baseline: its threshold is in .jscpd.json, and --accept-growth does not raise it
        fixed: true,
        measure: async () => ({}),
        compare: () => checkDuplication(),
    },
    docs: {
        measure: async () => ({ docs: measureDocs() }),
        compare: (base, now) => merge(compareCounts(base.docs.pages, now.docs.pages, "lines"), compareTotal(base.docs.totalLines, now.docs.totalLines)),
    },
};

/** The guards' names, as CI's steps and the command line call them. */
export const GUARD_NAMES = Object.freeze(Object.keys(GUARDS));

function merge(...results) {
    return { grew: results.flatMap((r) => r.grew), stale: results.flatMap((r) => r.stale) };
}

/**
 * The baseline as JSON with one entry per line, sorted, so a pull request's diff shows each change
 * on its own line and two pull requests rarely touch the same one.
 * @param {object} baseline
 */
export function formatBaseline(baseline) {
    const sortKeys = (value) => (Array.isArray(value) || typeof value !== "object" || value === null ? value : Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])])));
    return `${JSON.stringify(sortKeys(baseline), null, 4).replace(/\[\s+([\d,\s]+?)\s+\]/g, (_, numbers) => `[${numbers.split(/,\s*/).join(", ")}]`)}\n`;
}

async function main(argv) {
    const update = argv.includes("--update");
    const acceptGrowth = argv.includes("--accept-growth");
    const unknown = argv.filter((a) => a.startsWith("--") && a !== "--update" && a !== "--accept-growth");
    if (unknown.length > 0) throw new Error(`growth: unknown option ${unknown.join(" ")}; the options are --update and --accept-growth`);
    const names = argv.filter((a) => !a.startsWith("--"));
    for (const name of names) if (!(name in GUARDS)) throw new Error(`growth: no guard "${name}"; the guards are ${Object.keys(GUARDS).join(", ")}`);
    const chosen = names.length > 0 ? names : Object.keys(GUARDS);
    const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : EMPTY;
    for (const key of Object.keys(EMPTY)) if (!(key in baseline)) throw new Error(`growth: scripts/growth-baseline.json has no "${key}": write it with ${UPDATE} --accept-growth`);
    const next = { ...baseline };
    let failed = false;
    for (const name of chosen) {
        const now = await GUARDS[name].measure();
        const { grew, stale } = GUARDS[name].compare(baseline, now);
        Object.assign(next, now);
        if (grew.length > 0) {
            if (!(update && acceptGrowth) || GUARDS[name].fixed) failed = true;
            console.error(`\n${name}: grew\n  ${grew.join("\n  ")}\n${ADVICE[name]}`);
        }
        if (stale.length > 0 && !update) {
            failed = true;
            console.error(`\n${name}: smaller than the baseline\n  ${stale.join("\n  ")}\nLower the baseline in this pull request: ${UPDATE}`);
        }
        if (grew.length === 0 && stale.length === 0) console.log(`${name}: ok`);
    }
    if (update && !failed) {
        writeFileSync(BASELINE, formatBaseline(next));
        console.log(`wrote ${posix(fileURLToPath(BASELINE))}`);
    } else if (update) {
        console.error(`\nThe baseline was not written: something grew. Fix that, or raise the baseline with ${UPDATE} --accept-growth and say why in the pull request.`);
    }
    process.exitCode = failed ? 1 : 0;
}

if (isMain(import.meta.url)) await main(process.argv.slice(2));

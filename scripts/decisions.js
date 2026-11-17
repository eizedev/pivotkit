// The index of the decision records in docs/decisions/ (#493), and the checks every record passes.
//
//   node scripts/decisions.js      writes docs/decisions/index.md from the records
//
// A record is docs/decisions/NNNN-<slug>.md in MADR's minimal template, with front matter that
// holds its title, description, status and date. tests/decisions.test.js fails when a record breaks
// a rule below or when the committed index differs from what this script builds.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isMain } from "./is-main.js";

const root = new URL("../", import.meta.url);
const DIR = new URL("docs/decisions/", root);

// the repository's web address, from a package.json ("git+https://github.com/<owner>/<repo>.git")
const REPOSITORY = JSON.parse(readFileSync(new URL("packages/pivotkit-core/package.json", root), "utf8")).repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

/** What each status means. The index and AGENTS.md say the same. */
export const STATUSES = Object.freeze({
    accepted: "binding",
    proposed: "context",
    superseded: "history",
});

/** A record's file name: four digits, a dash, a lowercase slug. */
const FILE = /^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

/**
 * The front matter of a Markdown text as plain key/value strings, quotes taken off.
 * @param {string} text
 * @returns {Record<string, string> | null}
 */
function frontMatter(text) {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!match) return null;
    /** @type {Record<string, string>} */
    const fields = {};
    for (const line of match[1].split("\n")) {
        const pair = /^([a-z_]+):\s*(.*)$/.exec(line);
        if (pair) fields[pair[1]] = pair[2].replace(/^"(.*)"$/, "$1");
    }
    return fields;
}

/**
 * @typedef {{ file: string, number: number, title: string, description: string, status: string, date: string, supersededBy: string, text: string }} DecisionRecord
 */

/**
 * The records of a directory, sorted by number. Files that do not look like a record are returned
 * too, as problems from checkRecords.
 * @param {Record<string, string>} files  file name to text
 * @returns {DecisionRecord[]}
 */
export function parseRecords(files) {
    return Object.entries(files)
        .filter(([file]) => file !== "index.md")
        .map(([file, text]) => {
            const fields = frontMatter(text) ?? {};
            return {
                file,
                number: Number(FILE.exec(file)?.[1] ?? NaN),
                title: fields.title ?? "",
                description: fields.description ?? "",
                status: fields.status ?? "",
                date: fields.date ?? "",
                supersededBy: fields.superseded_by ?? "",
                text,
            };
        })
        .sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));
}

/**
 * What is wrong with the records, one message each. An empty list means every record passes.
 * @param {DecisionRecord[]} records
 * @returns {string[]}
 */
export function checkRecords(records) {
    const problems = [];
    const byFile = new Map(records.map((r) => [r.file, r]));
    records.forEach((record, i) => {
        const { file } = record;
        if (!FILE.test(file)) {
            problems.push(`${file}: name it NNNN-<slug>.md, lowercase`);
            return;
        }
        if (record.number !== i + 1) problems.push(`${file}: expected number ${String(i + 1).padStart(4, "0")}; numbers start at 0001 and leave no gap`);
        for (const key of ["title", "description", "status", "date"]) {
            if (!record[/** @type {"title"} */ (key)]) problems.push(`${file}: the front matter has no ${key}`);
        }
        if (record.status && !Object.hasOwn(STATUSES, record.status)) problems.push(`${file}: status "${record.status}" is none of ${Object.keys(STATUSES).join(", ")}`);
        if (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) problems.push(`${file}: date "${record.date}" is not YYYY-MM-DD`);
        const heading = /^# (.+)$/m.exec(record.text.replace(/^---\n[\s\S]*?\n---\n/, ""))?.[1].replace(/`/g, "");
        const wanted = `${file.slice(0, 4)} ${record.title}`;
        if (heading !== wanted) problems.push(`${file}: the heading is "${heading ?? ""}", expected "# ${wanted}"`);
        if (!new RegExp(`${REPOSITORY.replace(/[.]/g, "\\.")}/(issues|pull)/\\d+`).test(record.text)) problems.push(`${file}: links no issue or pull request of ${REPOSITORY}`);
        if (record.status === "superseded") {
            const next = byFile.get(record.supersededBy);
            if (!next) problems.push(`${file}: superseded, but superseded_by names no record ("${record.supersededBy}")`);
            else {
                if (!record.text.includes(`(${next.file})`)) problems.push(`${file}: superseded by ${next.file}, but does not link it`);
                if (!next.text.includes(`(${file})`)) problems.push(`${next.file}: supersedes ${file}, but does not link it`);
            }
        } else if (record.supersededBy) {
            problems.push(`${file}: superseded_by is set, but the status is "${record.status}"`);
        }
    });
    return problems;
}

/**
 * The text of docs/decisions/index.md.
 * @param {DecisionRecord[]} records
 */
export function indexText(records) {
    const rows = records.map((r) => `| [${r.file.slice(0, 4)}](${r.file}) | ${r.title.replace(/\|/g, "\\|")} | ${r.status} | ${r.date} |`);
    const statuses = Object.entries(STATUSES).map(([status, meaning]) => `- **${status}**: ${meaning}`);
    return `---
title: Decisions
description: The decision records of pivotkit - each decision with its reason, and what is binding.
---

<!-- Generated by scripts/decisions.js from the records in this folder. Do not edit by hand. -->

# Decisions

Each record states a decision and its reason, and links its issue or pull request. It follows the
minimal template of [MADR](https://adr.github.io/madr/). This folder also holds the decisions that
span pivotkit and its host integrations.

A record's status says how far it binds:

${statuses.join("\n")}

An accepted record is not edited. A change is a new record that supersedes the old one, and both
link each other. [0001](0001-record-decisions.md) has the rules.

| Number | Decision | Status | Date |
| --- | --- | --- | --- |
${rows.join("\n")}
`;
}

/** The records of docs/decisions/ as file name to text. */
export function readRecords() {
    /** @type {Record<string, string>} */
    const files = {};
    for (const name of readdirSync(DIR)) {
        if (name.endsWith(".md")) files[name] = readFileSync(new URL(name, DIR), "utf8");
    }
    return files;
}

if (isMain(import.meta.url)) {
    const records = parseRecords(readRecords());
    const problems = checkRecords(records);
    if (problems.length > 0) {
        console.error(problems.join("\n"));
        process.exit(1);
    }
    writeFileSync(new URL("index.md", DIR), indexText(records));
    console.log(`docs/decisions/index.md: ${records.length} records`);
}

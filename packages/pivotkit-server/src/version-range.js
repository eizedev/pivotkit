/*
 * Whether a version is in a range as npm writes ranges in package.json: caret (^0.2.0), tilde
 * (~0.2.1), exact (0.2.0, =0.2.0), x ranges (0.2.x, *), comparisons joined by spaces
 * (>=0.2.0 <0.3.0) and alternatives joined by ||. A pre-release version is in a range only where a
 * comparator of the range names a pre-release of the same major, minor and patch, as npm reads it.
 * For a range it cannot read (a path, a tag, a URL) it says null: the caller decides.
 */

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const PARTIAL = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/;

/** @typedef {{ major: number, minor: number, patch: number, pre: string[] }} Version */

/** @param {string} text @returns {Version | null} */
function parse(text) {
    const m = VERSION.exec(text.trim());
    return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split(".") : [] } : null;
}

/** Compares two versions as SemVer orders them: -1, 0 or 1. */
function compare(a, b) {
    for (const key of /** @type {const} */ (["major", "minor", "patch"])) {
        if (a[key] !== b[key]) {
            return a[key] < b[key] ? -1 : 1;
        }
    }
    if (!a.pre.length || !b.pre.length) {
        return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
    }
    for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
        const x = a.pre[i];
        const y = b.pre[i];
        if (x === undefined || y === undefined) {
            return x === undefined ? -1 : 1;
        }
        if (x !== y) {
            const nx = /^\d+$/.test(x);
            const ny = /^\d+$/.test(y);
            return nx && ny ? (Number(x) < Number(y) ? -1 : 1) : nx ? -1 : ny ? 1 : x < y ? -1 : 1;
        }
    }
    return 0;
}

/**
 * One comparator of a range as the comparisons it stands for, or null when it cannot be read.
 * @param {string} part
 * @returns {Array<{ op: string, version: Version }> | null}
 */
function comparators(part) {
    const m = /^(\^|~|>=|<=|>|<|=)?\s*(.*)$/.exec(part);
    const op = m?.[1] ?? "";
    const p = PARTIAL.exec(m?.[2] ?? "");
    if (!p) {
        return null;
    }
    const num = (s) => (s === undefined || /^[xX*]$/.test(s) ? null : Number(s));
    const [major, minor, patch] = [num(p[1]), num(p[2]), num(p[3])];
    const pre = p[4] ? p[4].split(".") : [];
    const at = (a, b, c, withPre = []) => ({ major: a, minor: b, patch: c, pre: withPre });
    if (major === null) {
        return [];
    }
    const low = at(major, minor ?? 0, patch ?? 0, pre);
    if (op === "^") {
        const high = major > 0 || minor === null ? at(major + 1, 0, 0) : minor > 0 || patch === null ? at(0, minor + 1, 0) : at(0, 0, patch + 1);
        return [{ op: ">=", version: low }, { op: "<", version: { ...high, pre: ["0"] } }];
    }
    if (op === "~" || ((op === "" || op === "=") && (minor === null || patch === null))) {
        const high = minor === null ? at(major + 1, 0, 0) : at(major, minor + 1, 0);
        return [{ op: ">=", version: low }, { op: "<", version: { ...high, pre: ["0"] } }];
    }
    return [{ op: op || "=", version: low }];
}

/** Whether a version passes one comparison. */
function passes(version, { op, version: bound }) {
    const c = compare(version, bound);
    return op === ">=" ? c >= 0 : op === ">" ? c > 0 : op === "<=" ? c <= 0 : op === "<" ? c < 0 : c === 0;
}

/**
 * Whether `version` is in `range`; null when either cannot be read.
 * @param {string} range
 * @param {string} version
 * @returns {boolean | null}
 */
export function fitsRange(range, version) {
    const v = parse(String(version));
    if (!v || typeof range !== "string" || !range.trim()) {
        return null;
    }
    let fits = false;
    for (const alternative of range.split("||")) {
        const parts = alternative.trim().replace(/(\^|~|>=|<=|>|<|=)\s+/g, "$1").split(/\s+/).filter(Boolean);
        const set = parts.map(comparators);
        if (!parts.length || set.some((c) => c === null)) {
            return null;
        }
        const all = /** @type {Array<{ op: string, version: Version }>} */ (set.flat());
        // a pre-release only where a comparator names one of the same version (npm's rule)
        const preAllowed = !v.pre.length || all.some((c) => c.version.pre.length && c.version.pre[0] !== "0" && c.version.major === v.major && c.version.minor === v.minor && c.version.patch === v.patch);
        if (preAllowed && all.every((c) => passes(v, c))) {
            fits = true;
        }
    }
    return fits;
}

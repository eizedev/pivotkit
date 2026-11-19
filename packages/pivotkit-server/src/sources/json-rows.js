/*
 * An HTTP source's JSON answer read while it streams: the rows at the source's pointer go out one by
 * one as they arrive, so the server never holds the whole body, its whole parsed value and the table
 * at once. What it gives is what JSON.parse of the whole body and the pointer give
 * (test/json-rows.test.js reads every answer in pieces down to one byte):
 *
 * - Each row's bytes are decoded (strict UTF-8) and parsed with JSON.parse on their own.
 * - The rest of the body (everything outside the rows' list) is kept as bytes, with the list left
 *   empty, and parsed with JSON.parse at the end: the asOf and next pointers and check-source's keys
 *   read it as they read the whole body. A body that is no JSON fails there or in a row.
 * - Between the rows only whitespace and one comma may stand. A byte order mark is skipped at the
 *   start of the body only.
 * - Nesting is counted over the whole body, strings left out, as jsonDepth counts it.
 * - The rows' list is the value at the pointer's own keys (a list's index written as JSON Pointer
 *   writes it). A body that has a list there twice (a name repeated on the way to it) is refused:
 *   JSON.parse would take the last one, which is only known after the first was read.
 *
 * The scan works on bytes: every byte JSON gives a meaning to is ASCII, and in UTF-8 no byte of a
 * longer character is, so a piece may end anywhere, also inside a character.
 */

/** A body the reader refuses: no JSON, no UTF-8, nested too deeply. Its message is for the debug log. */
export class AnswerShapeError extends Error {
    name = "AnswerShapeError";
}

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const COLON = 0x3a;
const OPEN_LIST = 0x5b;
const CLOSE_LIST = 0x5d;
const OPEN_OBJECT = 0x7b;
const CLOSE_OBJECT = 0x7d;
const BOM = [0xef, 0xbb, 0xbf];

/** JSON's whitespace. */
const isSpace = (b) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09;

/** A list index as JSON Pointer writes it (pointerValue's rule). */
const INDEX = /^(?:0|[1-9]\d{0,8})$/;

/**
 * Where the reader is: outside the rows (the body's own structure), in the rows' list between rows,
 * or inside a row.
 * @typedef {"outside" | "between" | "row"} Place
 */

/**
 * A level of the body outside the rows. `onPath`: the pointer's keys so far lead here. In an object
 * `state` is what comes next: a key, its colon, its value or a comma; `key` is the last key read
 * (only on the pointer's path). In a list `index` counts the values.
 * @typedef {{ list: boolean, onPath: boolean, state: "key" | "colon" | "value" | "after", key: string | null, index: number }} Level
 */

/**
 * A reader of one JSON answer: push its pieces, then end. `onRow` gets each row's parsed value.
 * @param {string[]} keys  the rows' JSON Pointer as keys ([] for the whole body)
 * @param {{ maxDepth: number, onRow: (row: unknown) => void }} how
 */
export function rowsReader(keys, how) {
    // ignoreBOM: a byte order mark inside the body is a character, which JSON.parse refuses; the
    // one at the start is skipped below
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    /** The body outside the rows, as copies of its pieces. */
    const outside = [];
    /** @type {Level[]} */
    const levels = [];
    /** @type {Place} */
    let place = "outside";
    let rootSeen = false;
    let inString = false;
    let escaped = false;
    /** The key being read, as pieces (only on the pointer's path), and where it starts in this piece. */
    let keyParts = null;
    let keyStart = 0;
    /** The row being read, as pieces, and its nesting below the rows' list. */
    let rowParts = [];
    let rowDepth = 0;
    /** Between rows: a row must come next (after "[" a row or "]", after "," a row). */
    let needRow = false;
    let first = true;
    let rowsSeen = false;
    /** How much of a byte order mark the body started with (3: done looking). */
    let bomAt = 0;
    let rows = 0;

    const fail = (what) => {
        throw new AnswerShapeError(what);
    };
    const decode = (parts) => {
        try {
            return decoder.decode(parts.length === 1 ? parts[0] : concat(parts));
        } catch {
            return fail("the answer is no UTF-8 text");
        }
    };
    const depthCheck = (depth) => {
        if (depth > how.maxDepth) {
            fail(`the answer is nested deeper than ${how.maxDepth} levels`);
        }
    };

    /** Whether a value starting now is on the pointer's path, and whether it is at the rows' place. */
    const valueAt = () => {
        const top = levels.at(-1);
        if (!top) {
            return { onPath: true, atRows: keys.length === 0 };
        }
        const depth = levels.length;
        const step = keys[depth - 1];
        const matches = top.onPath && step !== undefined && (top.list ? INDEX.test(step) && Number(step) === top.index : top.key === step);
        return { onPath: matches, atRows: matches && depth === keys.length };
    };

    /** A value starts outside the rows: its level's state moves on. */
    const started = () => {
        const top = levels.at(-1);
        if (top) {
            top.state = "after";
        } else {
            rootSeen = true;
        }
    };

    /** The row read so far, parsed and handed on. */
    const endRow = () => {
        const text = decode(rowParts);
        rowParts = [];
        let value;
        try {
            value = JSON.parse(text);
        } catch {
            fail("the answer is no JSON");
        }
        rows++;
        how.onRow(value);
    };

    /**
     * One piece of the body.
     * @param {Uint8Array} piece
     */
    function push(piece) {
        // where the current run of bytes outside the rows (or of a row) started in this piece
        let from = 0;
        let i = 0;
        keyStart = 0;
        // a byte order mark at the start is skipped; a start that only looks like one is kept
        while (bomAt < BOM.length && i < piece.length) {
            if (piece[i] !== BOM[bomAt]) {
                if (bomAt > 0) {
                    outside.push(Uint8Array.from(BOM.slice(0, bomAt)));
                }
                bomAt = BOM.length;
                break;
            }
            bomAt++;
            i++;
            from = i;
        }
        for (; i < piece.length; i++) {
            const b = piece[i];
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (b === BACKSLASH) {
                    escaped = true;
                } else if (b === QUOTE) {
                    inString = false;
                    if (keyParts) {
                        keyParts.push(piece.subarray(keyStart, i));
                        levels.at(-1).key = keyOf(keyParts);
                        keyParts = null;
                    }
                }
                continue;
            }
            if (place === "row") {
                if (b === QUOTE) {
                    inString = true;
                } else if (b === OPEN_LIST || b === OPEN_OBJECT) {
                    rowDepth++;
                    depthCheck(levels.length + 1 + rowDepth);
                } else if (rowDepth > 0 && (b === CLOSE_LIST || b === CLOSE_OBJECT)) {
                    rowDepth--;
                } else if (rowDepth === 0 && (b === COMMA || b === CLOSE_LIST)) {
                    rowParts.push(piece.subarray(from, i));
                    endRow();
                    if (b === COMMA) {
                        place = "between";
                        needRow = true;
                    } else {
                        closeRows();
                    }
                    from = i + 1;
                } else if (rowDepth === 0 && b === CLOSE_OBJECT) {
                    fail("the answer is no JSON");
                }
                continue;
            }
            if (place === "between") {
                if (isSpace(b)) {
                    continue;
                }
                if (b === CLOSE_LIST) {
                    if (needRow && !first) {
                        fail("the answer is no JSON");
                    }
                    closeRows();
                    from = i + 1;
                } else if (b === COMMA) {
                    fail("the answer is no JSON");
                } else {
                    place = "row";
                    first = false;
                    needRow = false;
                    rowDepth = 0;
                    from = i;
                    i--;
                }
                continue;
            }
            // outside the rows: the body's own structure, kept as it is
            const top = levels.at(-1);
            if (isSpace(b)) {
                continue;
            }
            if (b === QUOTE) {
                inString = true;
                if (top && !top.list && top.state === "key") {
                    top.state = "colon";
                    if (top.onPath) {
                        keyParts = [];
                        keyStart = i + 1;
                    }
                } else {
                    started();
                }
            } else if (b === OPEN_LIST || b === OPEN_OBJECT) {
                const { onPath, atRows } = valueAt();
                started();
                if (atRows && b === OPEN_LIST) {
                    if (rowsSeen) {
                        fail("the answer has its rows twice (a repeated name)");
                    }
                    rowsSeen = true;
                    depthCheck(levels.length + 1);
                    // the "[" stays outside; the rows do not
                    outside.push(Uint8Array.from(piece.subarray(from, i + 1)));
                    from = i + 1;
                    place = "between";
                    first = true;
                    needRow = true;
                    continue;
                }
                levels.push({ list: b === OPEN_LIST, onPath: onPath && levels.length < keys.length, state: b === OPEN_LIST ? "value" : "key", key: null, index: 0 });
                depthCheck(levels.length);
            } else if (b === CLOSE_LIST || b === CLOSE_OBJECT) {
                levels.pop();
            } else if (b === COMMA) {
                if (top?.list) {
                    top.index++;
                    top.state = "value";
                } else if (top) {
                    top.state = "key";
                }
            } else if (b === COLON) {
                if (top && !top.list && top.state === "colon") {
                    top.state = "value";
                }
            } else if (top ? top.state === "value" : !rootSeen) {
                // a number, true, false or null
                started();
            }
        }
        // the rest of this piece: outside bytes copied (a piece may be large), a row's or key's kept
        if (inString && keyParts) {
            keyParts.push(Uint8Array.from(piece.subarray(keyStart)));
        }
        if (place === "outside" && from < piece.length) {
            outside.push(Uint8Array.from(piece.subarray(from)));
        } else if (place === "row" && from < piece.length) {
            rowParts.push(piece.subarray(from));
        }
    }

    /** A key's text from its bytes (the quotes left out), or null when it is no JSON text. */
    function keyOf(parts) {
        try {
            return JSON.parse(`"${decode(parts)}"`);
        } catch {
            // no JSON: the body's own parse at the end refuses it
            return null;
        }
    }

    /** The rows' list ends: its "]" goes outside, with what follows. */
    function closeRows() {
        place = "outside";
        outside.push(Uint8Array.of(CLOSE_LIST));
    }

    /**
     * The answer is complete: the body outside the rows parsed (the rows' list empty in it).
     * @returns {unknown}
     */
    function end() {
        if (place !== "outside" || inString) {
            fail("the answer is no JSON");
        }
        // a second byte order mark at the start is dropped too, as parsed() in http.js drops it
        const text = decode(outside.length ? outside : [new Uint8Array(0)]).replace(/^\uFEFF/, "");
        outside.length = 0;
        try {
            return JSON.parse(text);
        } catch {
            return fail("the answer is no JSON");
        }
    }

    return {
        push,
        end,
        /** The rows read so far. */
        get rows() {
            return rows;
        }
    };
}

/** Pieces of bytes as one. */
function concat(parts) {
    let size = 0;
    for (const p of parts) {
        size += p.length;
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const p of parts) {
        all.set(p, at);
        at += p.length;
    }
    return all;
}

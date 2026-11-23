// Facts a docs page states, checked without pinning its wording: a test names the parts of a fact
// (the subject and its numbers) and the page passes when one of its sentences, table rows or list
// items holds all of them. The page may say it in other words and another order; a number that
// changes, or a subject that moves to another sentence, fails the check with the parts it looked for.
// A number is matched whole: "75" is not found in "175" or "75.5". Where two subjects share a sentence
// and their numbers could be swapped, a part binds each to its number ("Cairo (11.1"). What the check
// cannot see: a sentence that negates its fact ("Reykjavik is not the coldest").

/**
 * The sentences of a Markdown text. A paragraph or a list item stays one text over its wrapped lines;
 * a blank line, a list item, a heading and a table row start a new one. A numbered item starts at a
 * line's start, so an indented wrapped line that begins with a number ("  63. A phone") stays in its
 * text. A text is split at a full stop, a question or an exclamation mark before a space, but not after
 * "e.g." or "i.e." or a list item's number; a table row is one sentence. Every run of white space is
 * one space.
 * @param {string} text
 */
function sentencesOf(text) {
    return text
        .replace(/‑/g, "-")
        .split(/\n\s*\n|\n(?=\s*(?:[-*] |\||#)|\d+\. )/)
        .flatMap((block) =>
            block
                .replace(/\s+/g, " ")
                .trim()
                .replace(/^(?:[-*]|\d+\.) /, "")
                .replace(/\b(e\.g|i\.e)\. /g, "$1\u00a0")
                .split(/[.!?](?= )/)
        )
        .map((part) => part.replace(/\u00a0/g, ". ").trim())
        .filter(Boolean);
}

/**
 * Whether `sentence` holds `part`. A part that starts or ends with a digit is a whole number there:
 * "75" is not found in "175" or "75.5", so a fact cannot pass on a longer number.
 * @param {string} sentence
 * @param {string} part
 */
function holds(sentence, part) {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const before = /^\d/.test(part) ? "(?<![\\d.,])" : "";
    const after = /\d$/.test(part) ? "(?![\\d]|[.,]\\d)" : "";
    return new RegExp(`${before}${escaped}${after}`).test(sentence);
}

/**
 * Fails unless one sentence of `text` holds every one of `parts`.
 * @param {string} text
 * @param {string} name  the page, for the message
 * @param {...string} parts
 */
export function assertStates(text, name, ...parts) {
    const found = sentencesOf(text).some((sentence) => parts.every((part) => holds(sentence, part)));
    if (!found) throw new Error(`${name} should state in one sentence: ${parts.map((p) => JSON.stringify(p)).join(", ")}`);
}

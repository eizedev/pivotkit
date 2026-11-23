// Facts a docs page states, checked without pinning its wording: a test names the parts of a fact
// (the subject and its numbers) and the page passes when one of its sentences, table rows or list
// items holds all of them. The page may say it in any words and any order; a number that changes, or
// a subject that moves to another sentence, fails the check with the parts it looked for.

/**
 * The sentences of a Markdown text. A paragraph or a list item wraps over lines and stays one text; a
 * blank line, a list item, a heading and a table row start a new one. A numbered item starts at the
 * line's start, so a wrapped line that begins with a number ("63. A phone") stays in its sentence. A
 * text is split at a full stop, a question or an exclamation mark before a space; a table row is one
 * sentence. Every run of white space is one space.
 * @param {string} text
 */
function sentencesOf(text) {
    return text
        .replace(/‑/g, "-")
        .split(/\n\s*\n|\n(?=\s*(?:[-*] |\||#)|\d+\. )/)
        .flatMap((block) => block.replace(/\s+/g, " ").split(/[.!?](?= )/))
        .map((part) => part.trim())
        .filter(Boolean);
}

/**
 * Fails unless one sentence of `text` holds every one of `parts`.
 * @param {string} text
 * @param {string} name  the page, for the message
 * @param {...string} parts
 */
export function assertStates(text, name, ...parts) {
    const found = sentencesOf(text).some((sentence) => parts.every((part) => sentence.includes(part)));
    if (!found) throw new Error(`${name} should state in one sentence: ${parts.map((p) => JSON.stringify(p)).join(", ")}`);
}

/*
 * Files the report gives to the browser: a safe file name and a download of a Blob. No fetch() of
 * data: URLs, so a Content-Security-Policy without data: in connect-src does not stop the PNG export.
 */

/** Characters no file system takes, path separators and control characters. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[<>:"/\\|?*\u0000-\u001F\u007F]+/g;
/** Names Windows reserves for devices, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * A file name without extension from the host's `fileName`: no path, no characters a file system
 * refuses, no leading dots, at most 120 characters; "pivot" when nothing is left.
 * @param {unknown} name
 */
export function safeFileName(name) {
    const text = typeof name === "string" ? name : "";
    // cut first, then trim, so the name never ends in a dot or a space (Windows drops them)
    const cleaned = trimEnd(text.replace(UNSAFE, "-").replace(/^[\s.-]+/, "").slice(0, 120));
    return cleaned && !RESERVED.test(cleaned) ? cleaned : "pivot";
}

/** The text without trailing dots and white space; a loop, since /[\s.]+$/ backtracks quadratically. */
function trimEnd(text) {
    let end = text.length;
    while (end > 0 && (text[end - 1] === "." || /\s/.test(text[end - 1]))) {
        end--;
    }
    return text.slice(0, end);
}

/**
 * A Blob from a data: URL (base64 or percent-encoded), as ECharts' getDataURL() gives it.
 * @param {string} url
 */
export function dataUrlToBlob(url) {
    const match = /^data:([^,;]*)((?:;[^,;]*)*?)(;base64)?,(.*)$/s.exec(url);
    if (!match) {
        throw new TypeError("not a data: URL");
    }
    const type = match[1] || "application/octet-stream";
    if (match[3]) {
        const bin = atob(match[4]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i);
        }
        return new Blob([bytes], { type });
    }
    return new Blob([decodeURIComponent(match[4])], { type });
}

/**
 * Starts the download of a Blob under a name, from the document the report is in.
 * @param {Blob} blob
 * @param {string} name
 * @param {Document} [doc]
 */
export function saveBlob(blob, name, doc = document) {
    const url = URL.createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

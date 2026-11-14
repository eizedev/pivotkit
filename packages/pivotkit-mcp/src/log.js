/*
 * The log: one JSON line per event on stderr (stdout is the protocol on stdio). A tool call logs its
 * tool, the source (an id, or a file by its base name), the client (a token's name or an OAuth
 * client id; never a person's id), whether it worked, its error code and its time. Never a view, a
 * value, a token or a full path.
 */

/**
 * @param {"info" | "debug" | "off"} level
 * @param {{ write(text: string): unknown }} stream
 */
export function createLog(level, stream) {
    const write = (entry) => {
        if (level !== "off") {
            stream.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
        }
    };
    return {
        level,
        /** A tool call. */
        call: (entry) => write({ event: "call", ...entry }),
        /** An HTTP request refused before it reached a tool (Host, Origin, token). */
        refused: (entry) => write({ event: "refused", ...entry }),
        info: (message, extra = {}) => write({ event: "info", message, ...extra }),
        warn: (message, extra = {}) => write({ event: "warning", message, ...extra }),
        /** An unexpected error: its name and message only with --log debug, its stack never. */
        error: (error, extra = {}) => write({ event: "error", ...extra, ...(level === "debug" ? { error: String(error?.message ?? error).slice(0, 500) } : { error: error?.name ?? "Error" }) })
    };
}

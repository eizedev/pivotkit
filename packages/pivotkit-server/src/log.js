/*
 * The log: one JSON line per event on stderr (stdout is the protocol on stdio). A tool call (MCP) or
 * a request (REST) logs its operation, the source (an id, or a file by its base name), the client (a
 * token's name or an OAuth client id; never a person's id), whether it worked (REST: the status), its
 * error code and its time; a downloaded file is an event of its own. Never a view, a value, a token
 * or a full path, and a client's address only where the operator trusts a proxy to name it
 * (http.trustProxy).
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
        /** A REST request that reached an operation. */
        request: (entry) => write({ event: "request", ...entry }),
        /** A file handed to a REST caller (POST /api/v1/views/render/file). */
        download: (entry) => write({ event: "download", ...entry }),
        /** An HTTP request refused before it reached a tool (Host, Origin, token). */
        refused: (entry) => write({ event: "refused", ...entry }),
        info: (message, extra = {}) => write({ event: "info", message, ...extra }),
        warn: (message, extra = {}) => write({ event: "warning", message, ...extra }),
        /** Only with --log debug: details an operator needs to set up (why a token was refused). */
        debug: (message, extra = {}) => level === "debug" && write({ event: "debug", message, ...extra }),
        /** An unexpected error: its name and message only with --log debug, its stack never. */
        error: (error, extra = {}) => write({ event: "error", ...extra, ...(level === "debug" ? { error: String(error?.message ?? error).slice(0, 500) } : { error: error?.name ?? "Error" }) })
    };
}

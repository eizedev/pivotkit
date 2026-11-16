/*
 * How a server process ends on SIGINT or SIGTERM, for both runners (pivotkit-server serve and
 * pivotkit-mcp --http): the server closes (running requests may finish), the log is written out,
 * and the process exits 0, or 1 when closing failed (with an error line).
 */

import { flushed } from "./log.js";

/**
 * Stops `server` on the first SIGINT or SIGTERM.
 * @param {{ close(): Promise<void> }} server
 * @param {{ log: { error(error: unknown, extra?: Record<string, unknown>): void }, stderr: { write(text: string, done?: () => void): unknown }, before?: () => void, signals?: { once(signal: string, fn: () => void): unknown, off(signal: string, fn: () => void): unknown }, exit?: (code: number) => void }} how  before: a line to write first; signals and exit: the process's (tests replace them)
 * @returns {() => Promise<void>}  the stop, as the signals run it
 */
export function stopOnSignals(server, { log, stderr, before, signals = process, exit = (code) => process.exit(code) }) {
    const stop = async () => {
        signals.off("SIGINT", stop);
        signals.off("SIGTERM", stop);
        before?.();
        let code = 0;
        try {
            await server.close();
        } catch (e) {
            code = 1;
            log.error(e, { where: "stop" });
        }
        // the last lines out before the process ends (a pipe's writes are asynchronous on some systems)
        await flushed(stderr);
        exit(code);
    };
    signals.once("SIGINT", stop);
    signals.once("SIGTERM", stop);
    return stop;
}

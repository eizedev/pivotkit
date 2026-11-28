/*
 * The rows of a report with a `server` (record 0021): read from pivotkit-server with the page's
 * getToken(), again when the request changes (source, the query's parameters, the link's access
 * level, `refreshKey`) or the person asks to try again. The report keeps showing the rows it has
 * while it reads new ones, and when reading them fails (the banner says from when they are).
 *
 * - The page's address is read after the first render, so a server render and its hydration match.
 * - `server` is often a new object on every render: the request is compared as text (server.js
 *   key), and getToken is read from a ref, so neither reads the rows again.
 * - A request that is no longer wanted is aborted, and its answer is dropped.
 * - Each state goes to `onServerState` (pivotkit-element: the event pivot-server-state): what
 *   happened, the server's code and request id, the rows and when. Never the token.
 * - The token is kept in a ref of this report only: in memory, for its next request.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { keptQuery, loadServer, serverRequestOf } from "./server.js";
import { warnOnce } from "./warn-once.js";

/** How long the report loads before it says so in words over the skeleton. */
const SLOW_MS = 3000;

/**
 * @typedef {object} ServerState  what onServerState gets
 * @property {"loading" | "ready" | import("./server-rows.js").FailedState} state
 * @property {string} source
 * @property {string} [code]  the server's error code
 * @property {number} [status]
 * @property {string} [requestId]
 * @property {number} [rows]  "ready": the rows read
 * @property {string} [dataAsOf]  "ready": as the server says
 * @property {boolean} shown  the report shows rows (from an earlier read) while in this state
 */

/**
 * @typedef {object} LiveRows  what the report shows of its server
 * @property {boolean} active  the report has a server
 * @property {import("pivotkit-core").ColumnarData | undefined} data  the rows shown
 * @property {string | undefined} dataKey  changes with every read
 * @property {boolean} loading
 * @property {boolean} slow  loading for longer than SLOW_MS
 * @property {import("./server-rows.js").ServerFailure | null} failure
 * @property {number | null} loadedAt  when the rows shown were read (ms)
 * @property {any} mod  server-module.js once loaded, else null
 * @property {() => void} retry
 * @property {Array<[string, string]>} kept  the query entries a copied link keeps (server.js keptQuery)
 */

/**
 * @typedef {object} Rows  the hook's state: the last answer, and the read it belongs to
 * @property {import("pivotkit-core").ColumnarData | undefined} data  the rows shown
 * @property {string | undefined} dataKey
 * @property {number | null} loadedAt
 * @property {import("./server-rows.js").ServerFailure | null} failure  of the read `done`
 * @property {string | null} done  the read that answered last (`readId`)
 */

/** The page's address does not change under the report: a store nobody needs to subscribe to. */
const never = () => () => {};

/** The page's query string; null on a server render and in its hydration, so both match. */
const searchHere = () => (typeof location !== "undefined" ? location.search : null);

/**
 * The latest value in a ref, set after each render (filter-level.jsx useLatest): an effect reads the
 * page's current getToken and onServerState without running again for a new function.
 * @template T
 * @param {T} value
 */
function useLatest(value) {
    const ref = useRef(value);
    useEffect(() => {
        ref.current = value;
    });
    return ref;
}

/**
 * @param {import("./index.js").PivotReportProps} props
 * @returns {LiveRows}
 */
export function useServerRows(props) {
    const server = props.server;
    const search = useSyncExternalStore(never, searchHere, () => null);
    const read = search === null ? null : serverRequestOf(server, search);
    const request = read && "request" in read ? read.request : null;
    const problem = read && "problem" in read ? read.problem : null;
    if (problem) {
        warnOnce(`pivotkit: the report reads no rows: ${problem}`);
    }
    if (request && props.data !== undefined) {
        warnOnce("pivotkit: the report has a server and data; it shows the server's rows");
    }
    const key = request?.key ?? null;
    const [state, setState] = useState(() => /** @type {Rows} */ ({ data: undefined, dataKey: undefined, loadedAt: null, failure: null, done: null }));
    // the network code with the states' parts, once loaded: the slow line needs it before an answer
    const [mod, setMod] = useState(/** @type {typeof import("./server-module.js") | null} */ (null));
    const latest = useLatest({ getToken: server?.getToken, onState: props.onServerState, request, shown: state.data !== undefined });
    const held = useRef(/** @type {import("./server-rows.js").HeldToken | null} */ (null));
    const [tries, setTries] = useState(0);
    // one read: the request as text and the number of tries; a new one reads the rows again
    const readId = key === null ? null : `${tries}:${key}`;
    const [slowFor, setSlowFor] = useState(/** @type {string | null} */ (null));

    useEffect(() => {
        const asked = latest.current.request;
        if (readId === null || !asked) {
            return undefined;
        }
        const controller = new AbortController();
        /**
         * @param {Omit<ServerState, "source" | "shown">} detail
         * @param {boolean} [shown]  the report shows rows; by default as it did when this read began
         */
        const tell = (detail, shown = latest.current.shown) => latest.current.onState?.({ source: asked.source, shown, ...detail });
        tell({ state: "loading" });
        const slow = setTimeout(() => setSlowFor(readId), SLOW_MS);
        (async () => {
            const loaded = await loadServer();
            setMod(loaded);
            const getToken = () => /** @type {import("./server.js").ServerConnection["getToken"]} */ (latest.current.getToken);
            const got = await loaded.fetchRows(asked, { getToken, held, signal: controller.signal });
            if (controller.signal.aborted) {
                return;
            }
            if (got.ok) {
                const { rows } = got;
                setState({ data: rows.data, dataKey: readId, loadedAt: Date.now(), failure: null, done: readId });
                tell({ state: "ready", rows: rows.rowCount, ...(rows.dataAsOf ? { dataAsOf: rows.dataAsOf } : {}), ...(rows.requestId ? { requestId: rows.requestId } : {}) }, true);
                return;
            }
            const f = got.failure;
            setState((s) => ({ ...s, failure: f, done: readId }));
            tell({ state: f.state, ...(f.code ? { code: f.code } : {}), ...(f.status ? { status: f.status } : {}), ...(f.requestId ? { requestId: f.requestId } : {}) });
        })()
            .catch((error) => {
                if (controller.signal.aborted) {
                    return;
                }
                // the module did not load (offline, or the host did not deploy the chunks)
                warnOnce(`pivotkit: the server's code did not load: ${error instanceof Error ? error.message : String(error)}`);
                setState((s) => ({ ...s, failure: { state: "unreachable", host: hostOf(asked.base) }, done: readId }));
                tell({ state: "unreachable" });
            })
            .finally(() => clearTimeout(slow));
        return () => {
            clearTimeout(slow);
            controller.abort();
        };
    }, [readId, latest]);

    useEffect(() => {
        if (!problem) {
            return undefined;
        }
        // a mistake of the page: the report says it cannot reach its server (the console says why)
        let live = true;
        loadServer().then(
            (loaded) => live && setMod(loaded),
            () => {}
        );
        return () => {
            live = false;
        };
    }, [problem]);

    const retry = useCallback(() => setTries((n) => n + 1), []);
    const kept = keptQuery(request);
    const loading = Boolean(server) && !problem && state.done !== readId;
    return {
        active: Boolean(server),
        data: state.data,
        dataKey: state.dataKey,
        loading,
        slow: loading && slowFor === readId,
        failure: problem ? { state: "unreachable", host: "" } : !loading ? state.failure : null,
        loadedAt: state.loadedAt,
        mod,
        retry,
        kept
    };
}

/** The host of an address, for the support line. */
function hostOf(base) {
    try {
        return new URL(base).host;
    } catch {
        return base;
    }
}

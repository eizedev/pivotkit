/*
 * The rows route, POST /api/v1/sources/records (record 0015): the rows of one source for a signed-in
 * person whose profile names the source in `records`. It stores nothing; MCP has no tool for it.
 *
 * In this order:
 *
 * 1. the person: an OAuth token with a subject of the configured issuer, or a token of an external
 *    issuer with a subject (sources/auth.js isPerson). Static and signed tokens and a server without
 *    sign-in get NOT_ALLOWED;
 * 2. the right: the caller's profile names the source in `records`. A source that is not there gets
 *    the same NOT_ALLOWED, so the answer says nothing about which sources exist;
 * 3. a place: at most rest.records.concurrency rows requests at once, one per person. A person without
 *    one waits for it up to rest.records.waitMs, first come first, else 503 BUSY;
 * 4. the source for the caller (its scopes, its parameters) and its data, read in a compute worker,
 *    which posts the head: the columns, their types, the row count and a view's fields;
 * 5. what leaves, decided here, never in the worker: only fields at `show` for the caller. A hidden
 *    field answers as an unknown one; a field at values or summary is NOT_ALLOWED with `notShown`.
 *    A view's filters are no permission: every row leaves;
 * 6. the limits: rest.records.maxRows (or the source's lower records.maxRows) and .maxCells, 413
 *    LIMIT_EXCEEDED before the first byte;
 * 7. the answer, written in pieces: { columns, types, rowCount, dataAsOf, withheld, requestId, data }.
 *    The worker writes `data` one piece per read of the answer; a reader idle for rest.records.idleMs
 *    loses its place and its answer is cut, and so does one that has not read it all within
 *    rest.records.writeMs. The whole job is bounded by compute.timeMs.
 *
 * A `records` log line closes every answer that started: source, row and column counts, profile and
 * the person as audit.subject says. Never a value.
 */

import { OperationError, checkInput, findingText } from "pivotkit-report/operations";
import { REST_BASE } from "pivotkit-node/rest";
import { identityBasisOf, identityKey } from "./auth.js";
import { RECORDS_JOB } from "./data.js";
import { createPlaces } from "./limits.js";
import { callerFields, refusalReason } from "./log.js";
import { recordsBoundsOf, recordsOfProfile, sourceMaxRowsOf } from "./options/records.js";
import { fieldKey, levelOf } from "./policy.js";
import { checkDepth } from "./input-depth.js";
import { PIECE_CHARS } from "./records-writer.js";
import { requestId } from "./request-id.js";
import { SAFE_HEADERS, problemOf as plainProblemOf, problemsFor } from "./rest/problem.js";
import { brandingOfContext } from "./branding.js";
import { browserBindingOf, sameParams } from "./browser-tokens.js";
import { asOfMembers } from "./sources/as-of.js";
import { isPerson } from "./sources/auth.js";
import { runResolved } from "./sources/index.js";
import { PARAMS_INPUT } from "./sources/input.js";
import { checkViewText, findNamedView, isViewName } from "./views.js";

/** The most fields a request may name. */
export const RECORDS_FIELDS = 1000;

/** What a caller sends. */
export const RECORDS_INPUT = Object.freeze({
    type: "object",
    required: ["source"],
    additionalProperties: false,
    properties: {
        source: { type: "string", minLength: 1, maxLength: 1024, pattern: "^(?!file:)", description: "A source id from GET /sources whose records is true." },
        params: PARAMS_INPUT,
        fields: { type: "array", minItems: 1, maxItems: RECORDS_FIELDS, items: { type: "string", minLength: 1, maxLength: 1024 }, description: "The fields to answer, in this order (names match case-insensitively). Each must be at show for you. Without fields or view: every field at show." },
        view: { type: ["object", "string"], description: "A view, its JSON text, or the name of one of the source's views (GET /sources lists them) that says which fields are needed: the fields it uses. Its filters are not applied: every row of the source leaves." }
    }
});

/** What a caller gets: the columnar shape pivotkit-core's encode() reads, and what it says about it. */
export const RECORDS_OUTPUT = Object.freeze({
    type: "object",
    required: ["columns", "types", "rowCount", "withheld", "data"],
    properties: {
        columns: { type: "array", items: { type: "string" }, description: "The fields, as the data spells them." },
        types: { type: "array", items: { type: ["string", "null"], enum: ["string", "number", "boolean", "date", null] }, description: "Each column's type; null for a column without any value." },
        rowCount: { type: "integer", description: "The rows: every row of the source." },
        dataAsOf: { type: "string", description: "When the data is from: ISO 8601 in UTC, to the second." },
        stale: { type: "object", properties: { since: { type: "string" } }, required: ["since"], description: "The source could not be refreshed: this is the last good data, kept since then." },
        withheld: { type: "array", items: { type: "string" }, description: "The fields at values or summary for you: they are left out. A hidden field is never named." },
        requestId: { type: "string", description: "This answer's request id: give it to the operator to find the answer in the log." },
        data: { type: "array", items: { type: "array" }, description: "One array per column, in the order of columns: texts, numbers, true/false, dates as ISO text without an offset, null for a blank." }
    },
    additionalProperties: true
});

/** How long a caller refused for want of a place waits before it tries again, in seconds. */
const BUSY_RETRY = "5";

/** The most rows requests that wait for a place at once (rest.records.waitMs); more get BUSY at once. */
const RECORDS_WAITING = 32;

/**
 * Whether a caller may read the rows of a source: a person whose profile names it.
 * @param {import("./config.js").ServerOptions} options
 * @param {import("./registry.js").Caller} caller
 * @param {string} id
 */
export const mayReadRecords = (options, caller, id) => isPerson(caller) && recordsOfProfile(options, caller.profile).includes(id);

/**
 * Why a caller may not read the rows of a source, or null: no person, or a profile that does not
 * name the source. A source that is not there answers alike, so nobody probes for ids. The exchange
 * route (browser.js) refuses with the same words.
 * @param {import("./config.js").ServerOptions} options
 * @param {import("./registry.js").Caller} caller
 * @param {string} id
 * @returns {OperationError | null}
 */
export function recordsRefusal(options, caller, id) {
    if (!isPerson(caller)) {
        return new OperationError("NOT_ALLOWED", identityBasisOf(caller)?.[0] === "local" ? "this server has no sign-in, and rows go only to a person who signed in (auth.mode oauth, or auth.externalIssuers)" : "rows go only to a person who signed in: an OAuth token with a subject, or a host application's token for its person (auth.externalIssuers); static and signed tokens get none");
    }
    if (!Object.hasOwn(options.sources ?? {}, id) || !recordsOfProfile(options, caller.profile).includes(id)) {
        // the caller's own profile by name: a placeholder in angle brackets would reach a caller as "policy.profiles..records"
        const where = caller.profile ? `in your profile (policy.profiles.${caller.profile}.records)` : "per profile (policy.profiles), and your sign-in has no profile";
        return new OperationError("NOT_ALLOWED", `your sign-in may not read the rows of this source; the operator grants it ${where}`);
    }
    return null;
}

/**
 * A rows request as a browser token lets it through: the token's source only, and its parameters
 * (the token's where the request names none). A caller without a browser token sends what it likes.
 * @param {import("./registry.js").Caller} caller
 * @param {Record<string, any>} input
 */
function boundInput(caller, input) {
    const bound = browserBindingOf(caller);
    if (!bound) {
        return input;
    }
    if (input.source !== bound.source) {
        throw new OperationError("NOT_ALLOWED", "this browser token reads the rows of another source; get a token for this one");
    }
    if (input.params === undefined) {
        return { ...input, params: { ...bound.params } };
    }
    if (!sameParams(input.params, bound.params)) {
        throw new OperationError("NOT_ALLOWED", "this browser token was made for other params; get a token for these");
    }
    return input;
}

/** A field's name in a message: cleaned and capped, as other messages name fields. */
const nameText = (name) => findingText(String(name)).slice(0, 80);

/** A count in words: "120,000". */
const count = (n) => n.toLocaleString("en-US");

/**
 * The rows route of one REST handler: its places, and the route's work.
 * @param {any} context  createContext's
 */
export function createRecords(context) {
    const options = context.options;
    const { problem, problemOf } = problemsFor(brandingOfContext(context).docs);
    const bounds = recordsBoundsOf(options);
    const places = createPlaces(bounds.concurrency, RECORDS_WAITING);

    /**
     * A place for a person: at once, or after waiting up to rest.records.waitMs (a debug line says
     * it waits); null: BUSY. A caller that left while it waited gets its signal's reason thrown: no
     * refusal of a full route, as for a load it left (sources/run.js).
     * @param {string} person
     * @param {AbortSignal} [signal]
     */
    async function placeFor(person, signal) {
        const onWait = () => context.log.debug("rows: a request waits for a place", { held: places.held(), waiting: places.waiting() });
        const release = await places.wait(person, bounds.waitMs, { signal, onWait });
        if (!release && signal?.aborted) {
            throw signal.reason instanceof Error ? signal.reason : new DOMException("the caller went away", "AbortError");
        }
        return release;
    }

    /**
     * The answer to a rows request (the body read and parsed; the caller signed in).
     * @param {Record<string, any>} input
     * @param {import("./registry.js").Caller} caller
     * @param {{ signal?: AbortSignal, entry: Record<string, unknown> }} how  entry: the request's log line (its fields)
     * @returns {Promise<Response>}
     */
    async function answer(input, caller, how) {
        checkDepth(input);
        checkInput(RECORDS_INPUT, input);
        if (input.fields !== undefined && input.view !== undefined) {
            throw new OperationError("INVALID_INPUT", "give fields or a view, not both");
        }
        const refused = recordsRefusal(options, caller, input.source);
        if (refused) {
            throw refused;
        }
        input = boundInput(caller, input);
        const person = /** @type {string} */ (identityKey(caller));
        const release = await placeFor(person, how.signal);
        if (!release) {
            context.log.refused({ status: 503, path: REST_BASE, reason: refusalReason("BUSY"), limit: bounds.concurrency, ...callerFields(caller) });
            return problem("BUSY", "", { reason: "records", headers: { "retry-after": BUSY_RETRY }, extra: { requestId: requestId(), retryable: true } });
        }
        /** @type {import("./compute.js").RecordsWriter | null} */
        let writer = null;
        try {
            const resolved = await context.registry.resolve(input.source, caller, { files: false, surface: "rest" }, input.params);
            // a view by name: the operator's view, decided before the load (views.js)
            const view = isViewName(input.view) ? await namedViewFor(context, input.source, input.view, resolved.policy, problemOf) : checkViewText(input.view, { surface: "rest" });
            if (view instanceof Response) {
                release();
                return view;
            }
            const ran = /** @type {any} */ (await runResolved(context, RECORDS_JOB, view !== undefined ? { view } : {}, resolved, caller, { signal: how.signal }));
            writer = ran.writer;
            /** @type {import("./compute.js").RecordsHead} */
            const head = ran.outcome.head;
            // the row count and dataAsOf list_sources gives (registry.js noteRead)
            context.registry.noteRead(resolved.spec, { stats: { rows: head.rows }, asOf: ran.asOf });
            const chosen = choose(head, resolved.policy, input, problemOf);
            if ("refused" in chosen) {
                await writer.stop();
                return chosen.refused;
            }
            const maxRows = sourceMaxRowsOf(options, input.source);
            const rowsShown = resolved.policy.rows !== false;
            // a parameter is a way out only where the source takes one the caller sends (not bound to a claim)
            const sendsParams = Object.values(options.sources?.[input.source]?.params ?? {}).some((p) => p?.claim === undefined);
            // the limit goes into the problem too (maxRows, maxCells), so a page can say it in its own words
            if (head.rows > maxRows) {
                await writer.stop();
                return problemOf(new OperationError("LIMIT_EXCEEDED", `this source has too many rows to open here (${rowsShown ? `${count(head.rows)}, ` : ""}the limit is ${count(maxRows)}); ${sendsParams ? "filter it with a parameter or " : ""}ask the operator`), { extra: { maxRows } });
            }
            const cells = head.rows * chosen.columns.length;
            if (cells > bounds.maxCells) {
                await writer.stop();
                return problemOf(new OperationError("LIMIT_EXCEEDED", `this answer has too many values to open here (${rowsShown ? `${count(cells)} cells, ` : ""}the limit is ${count(bounds.maxCells)}); ask for fewer fields${sendsParams ? ", filter with a parameter" : ""} or ask the operator`), { extra: { maxCells: bounds.maxCells } });
            }
            const id = requestId();
            const columns = chosen.columns.map((i) => head.columns[i]);
            const members = { columns: columns.map((c) => c.name), types: columns.map((c) => c.type), rowCount: head.rows, ...asOfMembers(ran), withheld: chosen.withheld, ...(id ? { requestId: id } : {}) };
            const prefix = `${JSON.stringify(members).slice(0, -1)},"data":[`;
            writer.write(chosen.columns, PIECE_CHARS);
            const started = Date.now();
            const token = browserBindingOf(caller)?.id;
            const line = { ...callerFields(caller), ...(id ? { requestId: id } : {}), ...(token ? { token } : {}), source: input.source, profile: caller.profile, rows: head.rows, columns: columns.length };
            const stream = answerStream(prefix, writer, bounds, (outcome) => {
                release();
                // a cut answer went out as 200 already: its line has no status, so it is a warning
                context.log.records({ ...line, ms: Date.now() - started, ...(outcome.ok ? { status: 200 } : { ok: false, reason: outcome.reason }) });
            });
            writer = null;
            return new Response(stream, { status: 200, headers: { ...SAFE_HEADERS, "content-type": "application/json" } });
        } catch (e) {
            await writer?.stop();
            release();
            throw e;
        } finally {
            if (writer) {
                release();
            }
        }
    }

    return { answer, held: () => places.held() };
}

/**
 * A named view of the source for a rows request: the view to read the fields from, or the refusal
 * to send. A view that needs a hidden field is not found (findNamedView answers as for a name that
 * is not there). One that needs a field at values or summary is NOT_ALLOWED: its detail and
 * `notShown` name only those fields, which the caller may know of.
 * @param {any} context
 * @param {string} id
 * @param {string} name
 * @param {import("./policy.js").Policy} policy
 * @param {typeof plainProblemOf} problemOf
 * @returns {Promise<Record<string, unknown> | Response>}
 */
async function namedViewFor(context, id, name, policy, problemOf) {
    const named = await findNamedView(context, id, name, policy, { surface: "rest" });
    const notShown = named.needs.filter((f) => !["show", "hide"].includes(levelOf(policy, f)));
    if (notShown.length) {
        const one = notShown.length === 1;
        const detail = `the view ${named.name} needs ${notShown.map(nameText).join(", ")}, which ${one ? "is" : "are"} not at show for you, so its rows cannot leave; ask for the fields at show, or ask the operator`;
        return problemOf(new OperationError("NOT_ALLOWED", detail), { extra: { notShown } });
    }
    return named.doc;
}

/**
 * What leaves of a head under a policy, or the refusal to send: the columns' places in the head (the
 * fields asked for, a view's fields, or every field at show), and the fields at values or summary
 * (`withheld`). A hidden field is never named: one asked for answers as an unknown one.
 * @param {import("./compute.js").RecordsHead} head
 * @param {import("./policy.js").Policy} policy
 * @param {Record<string, any>} input
 * @param {typeof plainProblemOf} [problemOf]  the handler's, bound to its documentation links (problemsFor)
 * @returns {{ columns: number[], withheld: string[] } | { refused: Response }}
 */
export function choose(head, policy, input, problemOf = plainProblemOf) {
    const levels = head.columns.map((c) => levelOf(policy, c.name));
    const visible = (i) => levels[i] !== "hide";
    const withheld = head.columns.filter((_, i) => visible(i) && levels[i] !== "show").map((c) => c.name);
    /** The place of a field by name (case-insensitive), among the fields the caller may know of. */
    // the policy's own match of a field's name (case, Unicode form and spaces)
    const placeOf = (name) => head.columns.findIndex((c, i) => visible(i) && fieldKey(c.name) === fieldKey(String(name)));
    /** @type {number[]} */
    let wanted;
    if (input.view !== undefined) {
        if (head.viewErrors) {
            throw new OperationError("INVALID_INPUT", "the view has errors or names a field you may not read: check it with POST /api/v1/views/validate");
        }
        wanted = (head.uses ?? []).map(placeOf);
        if (wanted.some((i) => i < 0)) {
            throw new OperationError("INVALID_INPUT", "the view has errors or names a field you may not read: check it with POST /api/v1/views/validate");
        }
    } else if (input.fields !== undefined) {
        wanted = input.fields.map((name, i) => {
            const at = placeOf(name);
            if (at < 0) {
                // the caller's own text is not repeated: a hidden field and one that is not there read alike
                throw new OperationError("INVALID_INPUT", `fields[${i}] is no field of this source you may read; GET /api/v1/sources/{id} lists the fields`);
            }
            return at;
        });
    } else {
        wanted = head.columns.map((_, i) => i).filter((i) => levels[i] === "show");
        if (!wanted.length) {
            throw new OperationError("NOT_ALLOWED", "no field of this source is at show for you, so no rows can leave; the operator sets the fields that may leave to show");
        }
    }
    wanted = [...new Set(wanted)];
    const notShown = wanted.filter((i) => levels[i] !== "show").map((i) => head.columns[i].name);
    if (notShown.length) {
        const one = notShown.length === 1;
        const detail = `${notShown.map(nameText).join(", ")} ${one ? "is" : "are"} not at show for you, so ${one ? "its" : "their"} values cannot leave: leave ${one ? "it" : "them"} out, or ask the operator to show ${one ? "it" : "them"}`;
        return { refused: problemOf(new OperationError("NOT_ALLOWED", detail), { extra: { notShown } }) };
    }
    return { columns: wanted, withheld };
}

/**
 * The answer's body: the members before `data`, the worker's pieces (one per read), then the end.
 * A reader that reads nothing for `idleMs`, or has not read it all within `writeMs`, gets an error
 * and the job stops, so a slow reader cannot hold its place for compute.timeMs; a reader that leaves
 * (cancel) stops it too. `onEnd` is told once how it ended: ok, or why not (idle, slow, client,
 * timeout, error).
 * @param {string} prefix
 * @param {import("./compute.js").RecordsWriter} writer
 * @param {{ idleMs: number, writeMs: number }} bounds
 * @param {(outcome: { ok: boolean, reason?: string }) => void} onEnd
 * @returns {ReadableStream<Uint8Array>}
 */
function answerStream(prefix, writer, { idleMs, writeMs }, onEnd) {
    const encoder = new TextEncoder();
    let started = false;
    let ended = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let idle;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let whole;
    const finish = (outcome) => {
        if (!ended) {
            ended = true;
            clearTimeout(idle);
            clearTimeout(whole);
            onEnd(outcome);
        }
    };
    /** Cuts the answer: the reader gets an error, the job stops, the place is free. */
    const cut = (controller, setting, reason) => {
        controller.error(new OperationError("TIMEOUT", `the answer was not read in time (rest.records.${setting})`));
        void writer.stop();
        finish({ ok: false, reason });
    };
    /** Waits for the next read; a reader idle too long loses its place. */
    const arm = (controller) => {
        clearTimeout(idle);
        idle = setTimeout(() => cut(controller, "idleMs", "idle"), idleMs);
    };
    return new ReadableStream(
        {
            start(controller) {
                arm(controller);
                whole = setTimeout(() => cut(controller, "writeMs", "slow"), writeMs);
            },
            async pull(controller) {
                clearTimeout(idle);
                if (ended) {
                    return;
                }
                try {
                    if (!started) {
                        started = true;
                        controller.enqueue(encoder.encode(prefix));
                    } else {
                        const piece = await writer.next();
                        if (ended) {
                            return;
                        }
                        if (!piece) {
                            controller.enqueue(encoder.encode("]}\n"));
                            controller.close();
                            finish({ ok: true });
                            return;
                        }
                        controller.enqueue(piece);
                    }
                    arm(controller);
                } catch (e) {
                    controller.error(e);
                    finish({ ok: false, reason: /** @type {any} */ (e)?.code === "TIMEOUT" ? "timeout" : "error" });
                }
            },
            async cancel() {
                finish({ ok: false, reason: "client" });
                await writer.stop();
            }
        },
        { highWaterMark: 0 }
    );
}

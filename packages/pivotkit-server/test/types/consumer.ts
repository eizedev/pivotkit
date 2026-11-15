// Compiled by `npm run test:types` against the generated declarations, through the package's exports.
import { createContext, present, callerOf, validateOptions, type ServerOptions } from "pivotkit-server";
import { createRestHandler, openApiDocument, REST_ROUTES } from "pivotkit-server/rest";
import { resolvePolicy, levelOf } from "pivotkit-server/policy";

export async function start(): Promise<Response> {
    const options: ServerOptions = validateOptions({ sources: { sales: { file: "sales.csv", policy: { fields: { Region: "show" } } } }, policy: { profiles: { export: { results: true } } }, rest: { cors: { origins: ["https://app.example.com"] } }, output: { dir: "out" } });
    const context = await createContext(options);
    const { result } = await present(context, "list_sources", {}, callerOf("none", undefined));
    const level: string = levelOf(resolvePolicy({}, { default: "show" }), "Region");
    const rest = await createRestHandler(context);
    const doc = openApiDocument({ auth: { mode: "token" } });
    return rest.fetch(new Request(`http://localhost/api/v1${REST_ROUTES[0].path}?${level}${String(doc.openapi)}${Object.keys(result).length}`));
}

// the request's seams: an id inside the work, the caller fields a log line holds, a body cap decided
// after the sign-in, the metadata's scopes and a secret read on every use
import { bodyBytesOf, bodyCapOf, callerFields, errorDetails, offeredScopes, peekSignIn, readSecret, requestId, serveFetch, withRequestId, BODY_BYTES, MAX_BODY_BYTES, type Caller } from "pivotkit-server";

export async function seams(caller: Caller): Promise<number> {
    const fields: { client?: string } = callerFields(caller);
    const id: string | null = await withRequestId("AAAAAAAAAAA", async () => requestId());
    const details = errorDetails({ retryable: true, retryAfter: 30 });
    const scopes: string[] | null = offeredScopes({ auth: { requiredScopes: ["pivotkit"] } }, "rest");
    const secret: string = await readSecret({ env: "PIVOTKIT_KEY" }, {}, { PIVOTKIT_KEY: "x" });
    const cap = (request: Request, info: Record<string | symbol, any>): number => (peekSignIn(info)?.caller.client === "etl" ? 20_971_520 : BODY_BYTES);
    const server = await serveFetch({ fetch: async () => new Response("ok") }, { host: "127.0.0.1", port: 0, bodyBytes: cap });
    await server.close();
    return bodyCapOf(bodyBytesOf({}), new Request("http://localhost/"), {}) + MAX_BODY_BYTES + String(fields.client ?? id ?? details.requestId ?? scopes ?? secret).length;
}

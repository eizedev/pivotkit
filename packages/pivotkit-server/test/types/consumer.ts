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

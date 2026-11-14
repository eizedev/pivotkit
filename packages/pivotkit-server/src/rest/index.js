/*
 * pivotkit-server/rest: the REST service over pivotkit-report's operations. A fetch handler for any
 * server (node:http through pivotkit-server's serveFetch, or a framework that speaks Request and
 * Response) and the OpenAPI 3.1 document made from the same table.
 *
 *   import { createContext } from "pivotkit-server";
 *   import { createRestHandler } from "pivotkit-server/rest";
 *   const context = await createContext({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" } });
 *   const rest = await createRestHandler(context);
 *   const response = await rest.fetch(new Request("http://localhost/api/v1/sources"));
 */

export { createRestHandler, REST_BODY_BYTES } from "./handler.js";
export { openApiDocument } from "./openapi.js";

/**
 * @typedef {import("./openapi.js").OpenApiOptions} OpenApiOptions
 * @typedef {import("./routes.js").RestRoute} RestRoute
 * @typedef {Awaited<ReturnType<typeof import("./handler.js").createRestHandler>>} RestHandler
 */
export { REST_ROUTES, REST_BASE } from "./routes.js";
export { REST_ERRORS, PROBLEM_CODES } from "./problem.js";
export { REST_LIMITS } from "./limits.js";

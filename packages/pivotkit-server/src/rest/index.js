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

export { createRestHandler } from "./handler.js";
/** The most bytes of a request body (the server's, MCP's too); larger only for a caller that may send data. */
export { BODY_BYTES as REST_BODY_BYTES } from "../listen.js";
export { openApiDocument } from "./openapi.js";

/**
 * @typedef {import("./openapi.js").OpenApiOptions} OpenApiOptions
 * @typedef {import("./routes.js").RestRoute} RestRoute
 * @typedef {Awaited<ReturnType<typeof import("./handler.js").createRestHandler>>} RestHandler
 */
export { REST_ROUTES } from "./routes.js";
export { REST_BASE } from "pivotkit-node/rest";
export { REST_ERRORS, PROBLEM_CODES } from "./problem.js";
export { REQUEST_LIMITS as REST_LIMITS } from "../limits.js";

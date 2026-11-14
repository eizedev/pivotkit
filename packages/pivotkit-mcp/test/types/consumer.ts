// Compiled by `npm run test:types` against the generated declarations, through the package's exports.
import { createMcpContext, createHttpHandler, validateOptions, POLICY_LEVELS, type McpOptions } from "pivotkit-mcp";

export async function start(): Promise<Response> {
    const options: McpOptions = validateOptions({ sources: { sales: { file: "sales.csv", policy: { fields: { Region: "show" } } } }, output: { dir: "out" } });
    const context = await createMcpContext(options);
    const handler = await createHttpHandler(context);
    const level: string = POLICY_LEVELS[0];
    return handler.fetch(new Request(`http://localhost/${level}`));
}

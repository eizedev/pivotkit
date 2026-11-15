// `node --import` this file: "pivotkit-mcp" then resolves to the stub of another release beside it,
// as in a global install where only one of the two packages was updated. MCP_STUB names another
// entry of the stub (default index.js).
import { registerHooks } from "node:module";

const STUB = new URL(`./${process.env.MCP_STUB ?? "index.js"}`, import.meta.url).href;

registerHooks({
    resolve: (specifier, context, next) => (specifier === "pivotkit-mcp" ? { url: STUB, shortCircuit: true } : next(specifier, context))
});

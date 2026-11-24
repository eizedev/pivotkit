// A pivotkit-mcp of another release whose imports all resolve: only the range it declares
// (package.json) tells it does not fit.
import { ConfigError } from "pivotkit-server";

export const run = () => (ConfigError ? 0 : 1);
export const createMcpContext = () => {
    throw new Error("the old release's code ran");
};
export const createHttpHandler = createMcpContext;

// A pivotkit-mcp of another release: it imports a name this pivotkit-server does not export, as an
// older pivotkit-mcp did beside an older pivotkit-server.
import { EXPORT_OF_ANOTHER_RELEASE } from "pivotkit-server";

export const run = () => EXPORT_OF_ANOTHER_RELEASE;
export const createMcpContext = () => EXPORT_OF_ANOTHER_RELEASE;

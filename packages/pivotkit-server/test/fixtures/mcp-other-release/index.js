// A pivotkit-mcp of another release: it imports a name this pivotkit-server does not export, as
// pivotkit-mcp 0.1.1 did beside pivotkit-server 0.1.0 (BODY_BYTES).
import { EXPORT_OF_ANOTHER_RELEASE } from "pivotkit-server";

export const run = () => EXPORT_OF_ANOTHER_RELEASE;
export const createMcpContext = () => EXPORT_OF_ANOTHER_RELEASE;

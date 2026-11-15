// A pivotkit-mcp whose import of another package (not pivotkit-server) fails: no release mismatch
// between the two, so its own error stays.
import { EXPORT_OF_ANOTHER_RELEASE } from "pivotkit-core";

export const run = () => EXPORT_OF_ANOTHER_RELEASE;
export const createMcpContext = () => EXPORT_OF_ANOTHER_RELEASE;

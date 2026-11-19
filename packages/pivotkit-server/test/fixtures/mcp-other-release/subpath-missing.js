// A pivotkit-mcp of a later release that imports an entry point this pivotkit-server does not have.
import { EXPORT_OF_ANOTHER_RELEASE } from "pivotkit-server/entry-of-another-release";

export const run = () => EXPORT_OF_ANOTHER_RELEASE;
export const createMcpContext = () => EXPORT_OF_ANOTHER_RELEASE;

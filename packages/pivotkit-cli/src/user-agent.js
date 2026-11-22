/**
 * The user agent of pivotkit-cli's requests, "pivotkit-cli/<version>": the REST calls of remote mode
 * and the sign-in requests to the server and its issuer send the same one.
 */
import { createRequire } from "node:module";

/** pivotkit-cli's version, from its package.json. */
export const CLI_VERSION = /** @type {string} */ (createRequire(import.meta.url)("../package.json").version);

/** The user-agent header of every request pivotkit-cli sends. */
export const USER_AGENT = `pivotkit-cli/${CLI_VERSION}`;

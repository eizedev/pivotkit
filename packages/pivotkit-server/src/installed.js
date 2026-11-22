/*
 * A package of pivotkit that pivotkit-server loads by name when it is installed beside it, not as a
 * dependency: pivotkit-mcp for serve and mcp, pivotkit-cli for `pivotkit-server cli`.
 */

/**
 * The package's module, or null when the package itself is not installed. Any other failure is
 * thrown: a package whose own dependency is missing, or one of another release (serve.js loadMcp).
 * @param {string} name
 * @returns {Promise<any>}
 */
export async function importInstalled(name) {
    try {
        return await import(name);
    } catch (e) {
        if (e?.code === "ERR_MODULE_NOT_FOUND" && String(e.message).includes(`Cannot find package '${name}'`)) {
            return null;
        }
        throw e;
    }
}

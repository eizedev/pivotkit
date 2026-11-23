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

/**
 * What to say when a command needs a package that is not installed beside pivotkit-server: both npm
 * commands, since a global pivotkit-server finds only a global package (node_modules beside it) and a
 * project's finds the project's. Which of the two this process is cannot be told reliably (a prefix,
 * nvm, Volta and Windows each place global packages elsewhere).
 * @param {string} what  the command or setting that needs it
 * @param {string} name  the package
 */
export const missingPackageText = (what, name) =>
    `${what} needs the package ${name} beside pivotkit-server (npm install ${name}; for a global pivotkit-server: npm install --global ${name})`;

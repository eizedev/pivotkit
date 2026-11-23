// `node --import` this file: the package MISSING_PACKAGE names (default pivotkit-cli) then cannot be
// found, as in an npm install of pivotkit-server without it beside it. The error is the one Node
// throws for a missing package.
import { registerHooks } from "node:module";

const MISSING = process.env.MISSING_PACKAGE ?? "pivotkit-cli";

registerHooks({
    resolve: (specifier, context, next) => {
        if (specifier === MISSING) {
            throw Object.assign(new Error(`Cannot find package '${specifier}' imported from ${context.parentURL}`), { code: "ERR_MODULE_NOT_FOUND" });
        }
        return next(specifier, context);
    }
});

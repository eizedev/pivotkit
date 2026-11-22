// `node --import` this file: "pivotkit-cli" then cannot be found, as in an npm install of
// pivotkit-server without pivotkit-cli beside it. The error is the one Node throws for a missing package.
import { registerHooks } from "node:module";

registerHooks({
    resolve: (specifier, context, next) => {
        if (specifier === "pivotkit-cli") {
            throw Object.assign(new Error(`Cannot find package '${specifier}' imported from ${context.parentURL}`), { code: "ERR_MODULE_NOT_FOUND" });
        }
        return next(specifier, context);
    }
});

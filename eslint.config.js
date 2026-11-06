// Only the recommended rules: they find real errors (undefined names, unreachable code, unused
// variables). Formatting is left to .editorconfig.
import js from "@eslint/js";
import globals from "globals";

export default [
    { ignores: ["**/node_modules/", "**/dist/", "**/coverage/", "packages/*/types/"] },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: "module"
        },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
        }
    },
    {
        // tests, benchmarks and tooling run in Node
        ignores: ["packages/*/src/**"],
        languageOptions: { globals: { ...globals.node } }
    },
    {
        // the engine runs in browsers and Node: only globals both have (no process, Buffer, window)
        files: ["packages/*/src/**/*.js"],
        languageOptions: { globals: { ...globals["shared-node-browser"] } }
    }
];

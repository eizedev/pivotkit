// Only the recommended rules: they find real errors (undefined names, unreachable code, unused
// variables). Formatting is left to .editorconfig.
import js from "@eslint/js";
import globals from "globals";

export default [
    { ignores: ["**/node_modules/", "**/dist/", "**/coverage/", "packages/*/types/", "test-results/", "playwright-report/"] },
    js.configs.recommended,
    {
        files: ["**/*.js", "**/*.jsx"],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: "module",
            parserOptions: { ecmaFeatures: { jsx: true } }
        },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^React$" }]
        }
    },
    {
        // tests, benchmarks and tooling run in Node
        ignores: ["packages/*/src/**", "examples/*/src/**"],
        languageOptions: { globals: { ...globals.node } }
    },
    {
        // the engine runs in browsers and Node: only globals both have (no process, Buffer, window)
        files: ["packages/pivotkit-core/src/**/*.js"],
        languageOptions: { globals: { ...globals["shared-node-browser"] } }
    },
    {
        // the UI and the playground run in browsers
        files: ["packages/pivotkit-react/src/**", "examples/*/src/**"],
        languageOptions: { globals: { ...globals.browser } }
    },
    {
        // browser tests: Node code that also hands functions to the page
        files: ["tests/browser/**"],
        languageOptions: { globals: { ...globals.node, ...globals.browser } }
    }
];

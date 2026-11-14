// Only the recommended rules: they find real errors (undefined names, unreachable code, unused
// variables), and for the React code the rules of hooks with React's own checks (eslint-plugin-react-hooks).
// Formatting is left to .editorconfig.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
    { ignores: ["**/node_modules/", "**/dist/", "**/coverage/", "packages/*/types/", "test-results/", "playwright-report/", "site/", "docs/playground/"] },
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
        ignores: ["packages/*/src/**", "examples/*/src/**", "examples/element/**"],
        languageOptions: { globals: { ...globals.node } }
    },
    {
        // the engine runs in browsers and Node: only globals both have (no process, Buffer, window)
        files: ["packages/pivotkit-core/src/**/*.js"],
        languageOptions: { globals: { ...globals["shared-node-browser"] } }
    },
    {
        // the reader plugins and the report run in browsers and Node, as the engine
        files: ["packages/pivotkit-xlsx/src/**/*.js", "packages/pivotkit-report/src/**/*.js"],
        languageOptions: { globals: { ...globals["shared-node-browser"] } }
    },
    {
        // the command line, the REST service and the MCP server run in Node only
        files: ["packages/pivotkit-cli/src/**/*.js", "packages/pivotkit-cli/bin/**/*.js", "packages/pivotkit-server/src/**/*.js", "packages/pivotkit-server/bin/**/*.js", "packages/pivotkit-mcp/src/**/*.js", "packages/pivotkit-mcp/bin/**/*.js"],
        languageOptions: { globals: { ...globals.node } }
    },
    {
        // the UI, the web component, the playground and the element example run in browsers
        files: ["packages/pivotkit-react/src/**", "packages/pivotkit-element/src/**", "examples/*/src/**", "examples/element/**"],
        languageOptions: { globals: { ...globals.browser } }
    },
    {
        // the package's version, replaced by build.js (esbuild define)
        files: ["packages/pivotkit-element/src/**"],
        languageOptions: { globals: { __PIVOTKIT_ELEMENT_VERSION__: "readonly", __PIVOTKIT_IMPORT_WORKER__: "readonly" } }
    },
    {
        // the package's version, replaced by build.js (esbuild define)
        files: ["packages/pivotkit-react/src/**"],
        languageOptions: { globals: { __PIVOTKIT_REACT_VERSION__: "readonly" } }
    },
    {
        files: ["packages/pivotkit-react/src/**", "examples/*/src/**", "tests/browser/pages/**", "bench/browser/**"],
        ...reactHooks.configs.flat["recommended-latest"],
        rules: { ...reactHooks.configs.flat["recommended-latest"].rules, "react-hooks/exhaustive-deps": "error" }
    },
    {
        // browser tests: Node code that also hands functions to the page
        files: ["tests/browser/**", "examples/angular/test/**", "bench/browser/**"],
        languageOptions: { globals: { ...globals.node, ...globals.browser } }
    }
];

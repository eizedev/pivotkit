// Only the recommended rules: they find real errors (undefined names, unreachable code, unused
// variables), and for the React code the rules of hooks with React's own checks (eslint-plugin-react-hooks).
// Formatting is left to .editorconfig. Function length and complexity are a ratchet in
// scripts/growth.js (npm run growth), not rules here: today's long functions would fail them.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// pivotkit-server never imports its command line: shared code lives in pivotkit-node. The runner's
// `cli` command loads it by name with import(), when it is installed; this rule does not see that.
const NO_CLI_IN_SERVER = { regex: "^pivotkit-cli(/|$)", message: "shared code goes into pivotkit-node; pivotkit-server does not import its command line" };

// pivotkit-cli's compatibility entries: published names that re-export pivotkit-node
const COMPAT_ENTRIES = { regex: "^pivotkit-cli/(files|rest)$", message: "pivotkit-cli/files and pivotkit-cli/rest stay for compatibility: import pivotkit-node/files or pivotkit-node/rest" };

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
        // the command line, the REST service, the MCP server and what they share run in Node only
        files: ["packages/pivotkit-node/src/**/*.js", "packages/pivotkit-cli/src/**/*.js", "packages/pivotkit-cli/bin/**/*.js", "packages/pivotkit-server/src/**/*.js", "packages/pivotkit-server/bin/**/*.js", "packages/pivotkit-mcp/src/**/*.js", "packages/pivotkit-mcp/bin/**/*.js"],
        languageOptions: { globals: { ...globals.node } }
    },
    {
        // pivotkit-cli/files and pivotkit-cli/rest stay for their published names only: code here
        // imports pivotkit-node, where they live. The server and pivotkit-node refuse pivotkit-cli
        // altogether (below); the test of the published entries imports them on purpose.
        files: ["**/*.js", "**/*.jsx"],
        ignores: ["packages/pivotkit-cli/test/inprocess.test.js"],
        rules: { "no-restricted-imports": ["error", { patterns: [COMPAT_ENTRIES] }] }
    },
    {
        files: ["packages/pivotkit-cli/src/**/*.js", "packages/pivotkit-cli/bin/**/*.js"],
        rules: { "no-restricted-imports": ["error", { patterns: [COMPAT_ENTRIES, { regex: "^\\./(files|rest-contract)\\.js$", message: "files.js and rest-contract.js only re-export pivotkit-node for published names: import pivotkit-node/files or pivotkit-node/rest" }] }] }
    },
    {
        // the layering: pivotkit-node is shared by the command line and the server and imports neither
        files: ["packages/pivotkit-node/src/**/*.js"],
        rules: { "no-restricted-imports": ["error", { patterns: [{ regex: "^pivotkit-(cli|server|mcp)(/|$)", message: "pivotkit-node is below the command line and the services; it imports neither" }] }] }
    },
    {
        // a caller's access token leaves auth.js only through exchangeTokenFor, and only the token
        // exchange of HTTP sources (sources/auth.js) may call it
        files: ["packages/pivotkit-server/src/**/*.js"],
        ignores: ["packages/pivotkit-server/src/auth.js", "packages/pivotkit-server/src/sources/auth.js"],
        rules: {
            "no-restricted-imports": ["error", { patterns: [{ regex: "(^|/)auth\\.js$", importNames: ["exchangeTokenFor"], message: "only sources/auth.js may use exchangeTokenFor (the caller's token goes to a token endpoint and nowhere else)" }, NO_CLI_IN_SERVER] }]
        }
    },
    {
        // auth.js and sources/auth.js may use exchangeTokenFor, but they do not import the command line either
        files: ["packages/pivotkit-server/src/auth.js", "packages/pivotkit-server/src/sources/auth.js"],
        rules: { "no-restricted-imports": ["error", { patterns: [NO_CLI_IN_SERVER] }] }
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

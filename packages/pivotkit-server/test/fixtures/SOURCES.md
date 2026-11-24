# Test fixtures

These tests' authors wrote all files here, except the first one. They hold no third-party content.

- `openapi-3.1-schema.json`: the JSON Schema of OpenAPI 3.1 documents, version 2022-10-07, from
  https://spec.openapis.org/oas/3.1/schema/2022-10-07, kept byte for byte.
  Its SHA-256 is `da01ba28852cac0de53893797cb8d1942bc3b05084f526dcc216717dec314ed0`.
  Copyright The Linux Foundation, OpenAPI Initiative. Its licence is the Apache License 2.0:
  https://github.com/OAI/OpenAPI-Specification/blob/main/LICENSE.
- `openapi/platform.json`: an OpenAPI document of a made-up platform API, for
  `test/openapi-source.test.js`.
- `openapi/hostile.json`: an OpenAPI document that attacks whoever reads it, for
  `test/openapi-source.test.js`. No script made it. It holds these traps:
  - servers and a token URL with a user name, a password, a query and a fragment, on the attacker's hosts.
  - a server variable.
  - a scope with a quote and a line break.
  - remote, `file:` and circular references: `LoopA`, `LoopB` and `/cycle`.
  - `__proto__` and `constructor` as property names.
  - catastrophic patterns, and descriptions with bidi and escape characters.
  - a property name of 600 characters and a description of 900 characters.
  - an expansion bomb. `L0` to `L11` are each an `allOf` of four references to the next level.
    The object `L12` ends it. `/fan` reaches `L0` three times. Change one level and keep the others alike.
- `need-worker.js`: a compute worker for `test/code-sources.test.js`.
- `probe-worker.js`: a compute worker for the pool's failure paths in `test/compute.test.js`.
- `check-config.txt` and `option-keys.json`: golden files for `test/options.test.js`.
  They hold the expected output of `check-config` and the options table.
  `PIVOTKIT_UPDATE_GOLDEN=1` writes them.
- `mcp-other-release/`: a stand-in pivotkit-mcp of another release with its loader hook, for
  `test/runner.test.js`.
- `package-missing/hook.js`: a loader hook that hides an installed package, for `test/runner.test.js`.

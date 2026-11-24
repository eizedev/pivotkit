# Test fixtures

- `openapi-3.1-schema.json`: the JSON Schema of OpenAPI 3.1 documents, version 2022-10-07, from
  https://spec.openapis.org/oas/3.1/schema/2022-10-07, kept byte for byte. Copyright The Linux
  Foundation (OpenAPI Initiative), licensed under the Apache License 2.0
  (https://github.com/OAI/OpenAPI-Specification/blob/main/LICENSE).
- `openapi/platform.json` and `openapi/hostile.json`: OpenAPI documents written for
  `test/openapi-source.test.js` (a made-up platform API, and a document built to attack whoever
  reads it); no third-party content.
- `need-worker.js` and `probe-worker.js`: compute workers written for the pool's tests
  (`test/code-sources.test.js`, `test/compute.test.js`); no third-party content.
- `check-config.txt` and `option-keys.json`: the expected output of `check-config` and the options
  table for `test/options.test.js` (golden files, written by `PIVOTKIT_UPDATE_GOLDEN=1`); no
  third-party content.
- `mcp-other-release/`: a stand-in pivotkit-mcp of another release with its loader hook, for
  `test/runner.test.js`; no third-party content.

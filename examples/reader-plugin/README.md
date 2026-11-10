# An example reader plugin

A complete reader plugin for [pivotkit](https://pivotkit.eize.dev/), to copy: JSON Lines (`.jsonl`,
`.ndjson`), one JSON object per line. `src/index.js` is the plugin's descriptor, `src/reader.js` the
reader it loads on demand. Its test is `tests/reader-plugin.test.js` in this repository.

How plugins work, the contract and the rules a reader follows: [Write a plugin](https://pivotkit.eize.dev/reference/write-a-plugin/).

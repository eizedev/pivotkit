// An example reader plugin for pivotkit, to copy: JSON Lines (.jsonl, .ndjson), one JSON object per
// line, as logs and data exports write them. This module is the plugin's descriptor only; it imports
// nothing, so a page that never reads such a file loads nothing more. See
// https://pivotkit.eize.dev/reference/write-a-plugin/

/** @type {import("pivotkit-core/import").ReaderPlugin} */
const jsonLinesReader = Object.freeze({
    apiVersion: 1,
    kind: "reader",
    name: "jsonl",
    label: "JSON Lines",
    accept: Object.freeze([".jsonl", ".ndjson", "application/x-ndjson", "application/jsonl"]),
    load: () => import("./reader.js")
});

export default jsonLinesReader;

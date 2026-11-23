// The import limits a server uses unless the operator sets them: lower than a command line's. A module
// of its own, so the compute worker's data.js reads the same numbers without loading the config.

export const SERVER_LIMITS = Object.freeze({ fileBytes: 52_428_800, unpackedBytes: 52_428_800 });

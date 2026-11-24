/*
 * The defaults of the compute pool, in a module that imports nothing: config.js re-exports them, and
 * an options fragment (options/records.js) reads them without importing config.js, which imports the
 * fragments.
 */

/** The defaults of the compute pool. */
export const COMPUTE_DEFAULTS = Object.freeze({ workers: 2, timeMs: 30_000, memoryMb: 1024, queueMs: 10_000 });

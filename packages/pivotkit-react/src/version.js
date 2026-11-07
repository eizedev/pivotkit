/*
 * The version of pivotkit-react, for the `generator` of the view files it writes: build.js replaces
 * __PIVOTKIT_REACT_VERSION__ with the version in package.json (esbuild define), as pivotkit-element
 * does for its own; the sources run as they are (the tests) say "0.0.0-source".
 */

/** @type {string} */
export const VERSION = typeof __PIVOTKIT_REACT_VERSION__ === "string" ? __PIVOTKIT_REACT_VERSION__ : "0.0.0-source";

// The stylesheet of pivotkit-react as text: build.js loads it, moves its tokens to :host
// (host-css.js) and inlines it as a string.
/** The package's version, set by build.js. */
declare const __PIVOTKIT_ELEMENT_VERSION__: string | undefined;

declare module "pivotkit-react/styles.css" {
    const css: string;
    export default css;
}

// The stylesheet of pivotkit-react as text: build.js loads it, moves its tokens to :host
// (host-css.js) and inlines the first load's runs of rules (css-split.js).
/** The package's version, set by build.js. */
declare const __PIVOTKIT_ELEMENT_VERSION__: string | undefined;
declare const __PIVOTKIT_IMPORT_WORKER__: string | undefined;

declare module "pivotkit-react/styles.css" {
    /** The first load's runs of rules; the menus' runs go between them (src/css-split.js). */
    export const first: string[];
}

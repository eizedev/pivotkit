// The stylesheet of pivotkit-react as text: build.js loads it, moves its tokens to :host
// (host-css.js) and inlines it as a string.
declare module "pivotkit-react/styles.css" {
    const css: string;
    export default css;
}

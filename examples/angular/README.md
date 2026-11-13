# pivotkit in Angular

A minimal Angular app with the web component `<pivot-report>` of `pivotkit-element`: a standalone,
zoneless component (`src/ticket-report.component.ts`) that binds data and the start view as properties
and handles `pivot-view-change`, with `allow-import`: `angular.json` copies the element's
`dist/import-worker.js` as an asset, so a file is read in the element's worker. CI builds it and runs `test/angular.spec.js` in Chromium, Firefox and
WebKit. The walkthrough is on the documentation site:
[Getting started with the web component, Angular](https://pivotkit.eize.dev/getting-started/web-component/#angular).

From the repository root, after `npm ci`:

```bash
npm run types && node packages/pivotkit-element/build.js   # pivotkit-element's dist/ and types/
npm ci --prefix examples/angular --ignore-scripts          # Angular, from this example's lock file
npm run build --prefix examples/angular                    # into examples/angular/dist/browser/
npx playwright test -c examples/angular/playwright.config.js
```

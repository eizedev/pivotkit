# pivotkit in Angular

A minimal Angular app with the web component `<pivot-report>` of `pivotkit-element`.

- A standalone, zoneless component (`src/ticket-report.component.ts`) binds the data and the start view as properties.
  It handles `pivot-view-change`.
- The report has `allow-import`. `angular.json` copies the element's `dist/import-worker.js` as an asset,
  so the element's worker reads a picked file.
- CI builds the app and runs `test/angular.spec.js` in Chromium, Firefox and WebKit.

The walkthrough is on the documentation site:
[Getting started with the web component, Angular](https://pivotkit.eize.dev/getting-started/web-component/#angular).

From the repository root, after `npm ci`:

```bash
npm run types && node packages/pivotkit-element/build.js   # pivotkit-element's dist/ and types/
npm ci --prefix examples/angular --ignore-scripts          # Angular, from this example's lock file
npm run build --prefix examples/angular                    # into examples/angular/dist/browser/
npx playwright test -c examples/angular/playwright.config.js
```

`.npmrc` sets `ignore-scripts`: the install runs no install scripts, as in CI.
The build needs none of them, and a script of a build tool's dependency cannot run on your machine.

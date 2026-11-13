---
title: Recipes
description: Tasks developers solve when they embed pivotkit - keep and store the view, save views on a server or in the browser, share links, describe fields, adjust the chart, match the design, server-rendered pages, several reports on one page - each with a link to its worked example.
---

# Recipes

Each recipe names a task and the page with its worked example, for React (`<PivotReport>`) and the
web component (`<pivot-report>`).

## The view

| Task | React | Web component |
| --- | --- | --- |
| Start the report with a view | [`defaultView`](../getting-started/react.md#the-first-report) | [`default-view`](../getting-started/web-component.md#the-first-report) |
| Keep the view in your app, store it, start from a stored one | [controlled `view` with `onViewChange`](../getting-started/react.md#keep-the-view-in-your-app) | [controlled and uncontrolled](../reference/element.md#controlled-and-uncontrolled) |
| Keep the view across reloads of a tab | [`persistView="session"`](../concepts/sharing.md#keeping-the-view-per-tab) | [`persist-view="session"`](../concepts/sharing.md#keeping-the-view-per-tab) |
| Check a view from outside (a file, a database) | [`normalize`](../concepts/views.md#a-view-is-user-input) | [`normalize`](../concepts/views.md#a-view-is-user-input) |

## Saved and shared views

| Task | React | Web component |
| --- | --- | --- |
| Offer shared views (presets) | [`templates`](../concepts/templates.md#what-a-template-is) | [`templates` property](../concepts/templates.md#what-a-template-is) |
| Save the user's views on your server | [`onSaveTemplate`, `onDeleteTemplate`](../concepts/templates.md#your-application-keeps-them-callbacks) | [`pivot-template-save` with `respondWith()`](../getting-started/web-component.md#save-views-on-a-server) |
| Keep the user's views in the browser, no server | [`templateStore="browser"`](../concepts/templates.md#the-browser-keeps-my-views-templatestorebrowser) | [`template-store="browser"`](../concepts/templates.md#the-browser-keeps-my-views-templatestorebrowser) |
| Let admins publish a view for everyone | [`canPublish`, `onPublishTemplate`](../concepts/templates.md#your-application-keeps-them-callbacks) | [`can-publish`, `pivot-template-publish`](../concepts/templates.md#your-application-keeps-them-callbacks) |
| Ship views inside an OpenAPI document | [`x-pivotkit-views`](../concepts/templates.md#templates-in-an-openapi-document-x-pivotkit-views) | [`x-pivotkit-views`](../concepts/templates.md#templates-in-an-openapi-document-x-pivotkit-views) |
| Share a report as a link | [`shareLink`](../concepts/sharing.md#links-for-developers) | [`share-link`](../concepts/sharing.md#links-for-developers) |
| Name the data a view is made for, switch to it | [`source`, `sources`, `onSourceSwitch`](../concepts/sharing.md#the-source-of-a-view-for-developers) | [`source-id`, `pivot-source-switch`](../concepts/sharing.md#the-source-of-a-view-for-developers) |
| Read and write view files on a server | [`toViewFile`, `fromViewFile`](../reference/view-file.md#writing-a-view-file) | [`toViewFile`, `fromViewFile`](../reference/view-file.md#writing-a-view-file) |

## Data and fields

| Task | Where |
| --- | --- |
| Pass rows the app rebuilds on every render | [`dataKey`](../getting-started/react.md#data-key) |
| Show the skeleton while the data loads | [`loading`](../reference/react.md#prop-loading) |
| Give fields clear names, descriptions and links | [Field descriptions and names](../concepts/fields.md) |
| Take labels and descriptions from a JSON Schema or OpenAPI document | [`fieldDefaultsFromSchema`](../concepts/fields.md#from-a-json-schema-or-an-openapi-document) |
| Set how a field is summarized and formatted, its order of items | [`fieldDefaults`](../getting-started/react.md#field-defaults) |
| Columnar data (`{ columns, types, data }`, or `{ columns, rows }`) | [FAQ](../faq.md#my-data-is-columnar-columns-rows-can-i-pass-it) |
| Let people load a CSV, JSON or Excel file into the report | [`allowImport`](../reference/react.md#prop-allowimport), [plugins](../reference/plugins.md#pivotkit-xlsx), [what they see](../use/load-data.md) |
| Dates a day off | [time zones](../concepts/limits.md#time-zones), [FAQ](../faq.md#my-dates-are-a-day-off) |
| Pivots on a server, without UI | [engine on a server](../getting-started/engine.md#on-a-server) |

## Look and language

| Task | Where |
| --- | --- |
| Match your design, light and dark | [Theming](../reference/theming.md) |
| Change a text, add a language | [Localisation](../reference/localisation.md) |
| Adjust the chart beyond its menus (font sizes, axis names) | [`chartOptions`](../concepts/charts.md#chartoptions-for-developers) |
| A taller report on phones | [web component](../getting-started/web-component.md#a-taller-report-on-phones), [layout](../reference/react.md#layout) |
| Keep, log or block every export and copy | [`onExport`](../reference/react.md#prop-onexport) |

## Pages and hosts

| Task | Where |
| --- | --- |
| PHP and other server-rendered pages | [web component](../getting-started/web-component.md#php-and-other-server-rendered-pages) |
| Angular | [web component](../getting-started/web-component.md#angular), [zone.js](../reference/element.md#angular-and-zonejs) |
| PowerShell Universal | [React](../getting-started/react.md#powershell-universal) |
| A page without a bundler (import map) | [bundlers and import maps](../getting-started/react.md#bundlers-and-import-maps) |
| Some viewers may see only some rows | [pivotkit is not access control](../security.md#pivotkit-is-not-access-control) |
| A strict Content-Security-Policy | [security](../security.md#content-security-policy), [element](../reference/element.md#content-security-policy) |
| Several reports on one page | [FAQ](../faq.md#several-reports-on-one-page) |
| The report inside a dialog of your page | [Escape and the host page](../reference/react.md#escape-and-the-host-page) |

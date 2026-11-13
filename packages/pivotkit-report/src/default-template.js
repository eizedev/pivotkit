/*
 * The default print template: a document without script, its Content-Security-Policy first in <head>
 * (nothing it shows can load or run anything: styles inline, images as data: addresses only), the
 * title, the chart (an image), the table and the details below it. A host or `--template` replaces it
 * with its own; docs/reference/print-template.md lists the placeholders.
 */

export const REPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

export const DEFAULT_TEMPLATE = `<!doctype html>
<html lang="{{lang}}" dir="{{dir}}">
<head>
<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="pivotkit">
<meta name="description" content="{{summary}}">
<title>{{title}}</title>
{{style}}
</head>
<body>
<main class="pk-report">
<header>
<h1>{{title}}</h1>
<p class="pk-report-description">{{description}}</p>
</header>
{{chart}}
{{table}}
{{details}}
</main>
</body>
</html>
`;

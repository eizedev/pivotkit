# pivotkit-server

[pivotkit](https://pivotkit.eize.dev/)'s reports for programs over HTTP. pivotkit-server is a REST
service under `/api/v1`. It lists data sources, checks pivot views, renders reports into Excel, HTML,
CSV, JSON or SVG files and makes links.
An operator can publish [named views](https://pivotkit.eize.dev/reference/sources/#views) per source,
such as view files saved in the browser.

## Install

```bash
npm install --global pivotkit-server pivotkit-mcp
pivotkit-server serve --source sales=/path/to/sales.csv --output /path/to/reports   # http://127.0.0.1:3333/api/v1
```

Node 24 or later. It brings pivotkit-report, pivotkit-cli's file handling, pivotkit-xlsx, ECharts
6.1.0 and jose. It does not bring the MCP SDK.

## Example

```bash
curl -s -H "Content-Type: application/json" \
  -d '{"source":"sales","view":{"rows":["Region"],"values":[{"field":"Sales","agg":"sum"}]},"format":"xlsx"}' \
  http://127.0.0.1:3333/api/v1/views/render
```

## What it does

- Serves an OpenAPI 3.1 document, made from the same operations as the routes.
- Lets the operator decide per field what a caller may see. Profiles give one token, OAuth client or
  group more access to values and downloads.
- Signs callers in with static tokens, tokens it issues itself that expire, or OAuth 2.1.
- Hands the rows of a source to a person who signed in, where a profile allows it, so a host
  application's page can show a live report. It is off by default and sends only fields at `show`.
- Is the shared core of [pivotkit-mcp](https://www.npmjs.com/package/pivotkit-mcp).
  `pivotkit-server serve` runs the REST service. With pivotkit-mcp installed, the command also runs
  the MCP endpoint on the same port.
- Runs in a container image, together with pivotkit-mcp and the command line.

## Where in the docs

| Topic | Page |
| --- | --- |
| Run it and call it with curl and PowerShell | [Getting started: REST service](https://pivotkit.eize.dev/getting-started/rest/) |
| Routes, profiles, downloads, sign-in, CORS, limits, errors, OpenAPI, embedding | [pivotkit-server reference](https://pivotkit.eize.dev/reference/rest/) |
| Every name the package exports, for your own server | [JavaScript exports](https://pivotkit.eize.dev/reference/service-exports/) |
| Download links that expire, bound to the person's sign-in, or an upload to your own store | [Download links](https://pivotkit.eize.dev/reference/delivery/) |
| The container image | [Container image](https://pivotkit.eize.dev/reference/container/) |
| Kubernetes | [Kubernetes](https://pivotkit.eize.dev/getting-started/kubernetes/) |
| Update it together with pivotkit-mcp, and what changes between releases | [Upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#update) |
| What it protects against and what not | [Security: the REST service](https://pivotkit.eize.dev/security/#rest) |
| Changes | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-server/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)

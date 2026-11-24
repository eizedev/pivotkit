# Security policy

## Scope

These are in scope:

- the packages in this repository: `pivotkit-core`, `pivotkit-react`, `pivotkit-element`,
  `pivotkit-xlsx`, `pivotkit-report`, `pivotkit-node`, `pivotkit-cli`, `pivotkit-server` and
  `pivotkit-mcp`
- the container image built from it

pivotkit treats these as untrusted: a view, also called a report template, the data, a loaded CSV,
JSON or workbook file, a print template and a host's theme tokens. For the REST service and the MCP
server also the callers, their views, parameters and data, and an AI model.

Report a way to:

- run code from any of them
- load or read what a user should not, such as a file outside the directories
  `pivotkit-cli --allow-dir` names, or a resource from an HTML report
- make an exported CSV, XLSX, HTML report or SVG dangerous to open
- make the server send a request it should not, known as SSRF, past the address rules in
  [Security](https://pivotkit.eize.dev/security/#http-sources): through an HTTP source, a parameter,
  an upload store or the issuer's metadata
- leak a token, a backend's secret or a download link into a result, a log line, an error or a page
- open a download link as someone other than the person it belongs to, after it expired, or a second
  time
- get a field's values or rows above the level the policy gives a caller or a model
- exhaust memory or CPU around the limits, or far beyond what the
  [Limits](https://pivotkit.eize.dev/concepts/limits/#limits) page says the defaults allow

A view cannot run code, but it decides how much work the engine does. The limits in `LIMITS` count
that work before the memory it guards is allocated. The defaults suit a browser tab: a pivot can still
take seconds and up to about 1.5 GB. The data itself, rows times columns, is the host's to bound. A host
that takes views or data from untrusted users lowers the limits to what its reports need and catches
`PivotkitError`.

A vulnerability in a dependency, such as Apache ECharts or fflate, belongs to that project. Tell us
too if a package ships an affected version.

## Reporting a vulnerability

Please report privately through GitHub's
[Report a vulnerability](https://github.com/eizedev/pivotkit/security/advisories/new)
(Security tab, Advisories), not in a public issue. If you cannot use GitHub, email `oss@eize.dev`.

Include the package and version, the host (browser, framework), steps to reproduce and what you
expected.

## Supported versions

The latest released version of each package.

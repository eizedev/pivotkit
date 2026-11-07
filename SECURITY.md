# Security policy

## Scope

The packages in this repository (`pivotkit-core`, `pivotkit-react`, `pivotkit-element`). A view
(report template) and the data can come from users; anything that lets a view run code, read data it
should not, or makes an exported CSV or XLSX file dangerous to open is in scope.

A view cannot run code, but it decides how much work the engine does. The limits in `LIMITS`
(pivotkit-core README, "Limits") bound it: the size of a view (fields per axis, values), the rows
`encode` accepts, the cell updates `computePivot` does (rows x subtotal levels x values, heavier for
medians and unique counts), the nodes of its key trees and the cells it aggregates, and the cells of
the dense grid and chart. Each is counted before the memory it guards is allocated, or while it grows. The defaults are sized
for a browser tab: a pivot at the defaults can still take seconds and up to about 1.5 GB of memory,
and the data itself (rows x columns) is the host's to bound, since only its rows are limited. A host
that takes views or data from untrusted users should lower the limits to what its reports need and
catch `PivotkitError`. A way to exhaust memory or CPU around the limits, or far beyond what the
README says the defaults allow, is in scope. Vulnerabilities in a dependency (for example Apache
ECharts or fflate) belong to that project; tell us too if a package ships an affected version.

## Reporting a vulnerability

Please report privately through GitHub's
[Report a vulnerability](https://github.com/eizedev/pivotkit/security/advisories/new)
(Security tab, Advisories), not in a public issue. If you cannot use GitHub, email `oss@eize.dev`.

Include the package and version, the host (browser, framework), steps to reproduce and what you
expected.

## Supported versions

The latest released version of each package.

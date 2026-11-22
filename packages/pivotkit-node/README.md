# pivotkit-node

Internal to [pivotkit](https://github.com/eizedev/pivotkit). Do not depend on it directly.

It holds what the command line [pivotkit-cli](https://www.npmjs.com/package/pivotkit-cli) and
[pivotkit-server](https://www.npmjs.com/package/pivotkit-server) share in Node:

- `pivotkit-node/files` reads and writes files for a caller.
- `pivotkit-node/rest` holds what the REST service and its client agree on.

Its exports may change in any release. Use `pivotkit-cli/files` and `pivotkit-cli/rest` instead.
They re-export the same names and follow [versioning](https://pivotkit.eize.dev/versioning/).

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)

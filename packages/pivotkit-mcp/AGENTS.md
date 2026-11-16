# pivotkit-mcp

The MCP server. Node only. Built on the official MCP TypeScript SDK v2 and pivotkit-server.
The root [AGENTS.md](../../AGENTS.md) and [pivotkit-server's](../pivotkit-server/AGENTS.md) apply too.

## Commands

```bash
npm test -w pivotkit-mcp   # the SDK's client over stdio and HTTP, both protocol eras
npx pivotkit-mcp --source sales=data.csv --output out --check-config
```

## Tools

- One tool per operation of pivotkit-report's `OPERATIONS`. `registerTools` in `src/tools.js` adds them.
- A new operation needs no change here.
- What only MCP needs goes into `tools.js`: extra words in `descriptionOf`, `VIEW_ONLY`, annotations.
- The work is pivotkit-server's `present()`. Do not repeat policy logic here.
- A changed tool description or schema: say on the upgrading page that clients must reconnect.
- Clients keep the old tool list until then.

## Server

- Every HTTP request or stdio connection gets a fresh `McpServer` (`src/context.js`).
- Sign-in, policy and downloads are pivotkit-server's. `src/auth.js` only answers as MCP clients expect.
- pivotkit-mcp imports from pivotkit-server. Release that first ([RELEASING.md](../../RELEASING.md)).

## Skill and plugin

- `skills/pivotkit-reports/SKILL.md` is the skill. It ships with the package.
- The package folder is also a Claude Code plugin (`.claude-plugin/plugin.json`).
- The repository's `.claude-plugin/marketplace.json` lists it.
- `plugin.json` carries the package version. Its tests check it.

## Tests

`test/` drives the server with the SDK's client: stdio, HTTP, a local OAuth issuer, hostile inputs.

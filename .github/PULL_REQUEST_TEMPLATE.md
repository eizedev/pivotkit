## Summary

<!-- What changes and why. Link the issue: Fixes #n / Refs #n. If an AI assistant helped, you may say so; it does not change the review. -->

## Checklist ([PRODUCT.md](https://github.com/eizedev/pivotkit/blob/main/PRODUCT.md#what-a-contribution-delivers))

- [ ] Linked issue; for a new feature, the answers to the five questions
- [ ] New or changed tests fail without this change; no test weakened
- [ ] Docs, upgrading notes and `CHANGELOG.md` describe the new state
- [ ] Reviewed before opening by someone who did not write it (strongly recommended, mandatory for the maintainer's own AI agents; for AI-written code a person or a separate AI session), and I read, ran and understand all of it

## Test plan

- [ ] `npm run lint`
- [ ] `npm run types` (type check, generated declarations, TypeScript consumer)
- [ ] `npm test` (all workspace packages)
- [ ] `npm run pack:check` if files, exports or package.json changed
- [ ] `npm run bench -w pivotkit-core` if the engine changed (timings in the description)
- [ ] An exported `.xlsx` opened in Excel or LibreOffice, if the export changed

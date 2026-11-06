## Summary

<!-- What changes and why. Link the issue: Fixes #n / Refs #n -->

## Test plan

- [ ] `npm run lint`
- [ ] `npm run types` (type check, generated declarations, TypeScript consumer)
- [ ] `npm test` (all workspace packages)
- [ ] `npm run pack:check` if files, exports or package.json changed
- [ ] `npm run bench -w pivotkit-core` if the engine changed (timings in the description)
- [ ] An exported `.xlsx` opened in Excel or LibreOffice, if the export changed
- [ ] `CHANGELOG.md` of each changed package updated

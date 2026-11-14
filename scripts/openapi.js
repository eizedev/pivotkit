// Writes docs/openapi.json: the REST service's OpenAPI 3.1 document as pivotkit-server generates it
// (static tokens, no server address). packages/pivotkit-server/test/openapi.test.js fails until the
// committed file is what this writes: run it after a change of the operations, the presented
// schemas, the routes or pivotkit-server's version.
//
//   node scripts/openapi.js
import { writeFileSync } from "node:fs";
import { openApiDocument } from "pivotkit-server/rest";

const file = new URL("../docs/openapi.json", import.meta.url);
writeFileSync(file, `${JSON.stringify(openApiDocument(), null, 2)}\n`);
console.log(`wrote ${file.pathname}`);

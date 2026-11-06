// After tsc (npm run types): copies the hand-written src/global.d.ts next to the generated
// declarations and references it from the entry points, so a TypeScript user who imports the package
// gets the DOM's tag and event maps too.
import { copyFile, readFile, writeFile } from "node:fs/promises";

const here = new URL(".", import.meta.url);
await copyFile(new URL("src/global.d.ts", here), new URL("types/global.d.ts", here));
for (const entry of ["index.d.ts", "element.d.ts"]) {
    const file = new URL(`types/${entry}`, here);
    const text = await readFile(file, "utf8");
    const reference = '/// <reference path="./global.d.ts" />\n';
    if (!text.startsWith(reference)) {
        await writeFile(file, reference + text);
    }
}

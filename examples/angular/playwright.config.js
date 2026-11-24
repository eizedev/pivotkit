// The browser test of the Angular example in Chromium, Firefox and WebKit: the built app
// (npm run build here, into dist/browser/) served by the playground's static server. Run from the
// repository root, where @playwright/test is installed:
//   npx playwright test -c examples/angular/playwright.config.js
import { defineConfig } from "@playwright/test";
import base from "../../playwright.config.js";
import { fileURLToPath } from "node:url";

// another port than the playground (4173) and the docs scripts (4174, 4175): they may run at the same time
const port = Number(process.env.ANGULAR_PORT ?? 4176);

export default defineConfig({
    ...base,
    testDir: "test",
    use: { ...base.use, baseURL: `http://127.0.0.1:${port}/` },
    webServer: {
        command: `node ../playground/serve.js ${port} dist/browser`,
        cwd: fileURLToPath(new URL(".", import.meta.url)),
        url: `http://127.0.0.1:${port}/`,
        reuseExistingServer: false
    }
});

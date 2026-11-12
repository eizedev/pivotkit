// The browser test of the Angular example in Chromium, Firefox and WebKit: the built app
// (npm run build here, into dist/browser/) served by the playground's static server. Run from the
// repository root, where @playwright/test is installed:
//   npx playwright test -c examples/angular/playwright.config.js
import { defineConfig } from "@playwright/test";
import base from "../../playwright.config.js";

const port = Number(process.env.ANGULAR_PORT ?? 4174);

export default defineConfig({
    ...base,
    testDir: "test",
    use: { ...base.use, baseURL: `http://127.0.0.1:${port}/` },
    webServer: {
        command: `node ../playground/serve.js ${port} dist/browser`,
        cwd: new URL(".", import.meta.url).pathname,
        url: `http://127.0.0.1:${port}/`,
        reuseExistingServer: false
    }
});

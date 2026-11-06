// Browser tests of the playground (examples/playground) in Chromium, Firefox and WebKit. The build
// runs first (npm run test:browser); the tests open the static build through a small file server.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYGROUND_PORT ?? 4173);

export default defineConfig({
    testDir: "tests/browser",
    timeout: 60_000,
    expect: { timeout: 10_000 },
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
    use: {
        baseURL: `http://127.0.0.1:${port}/`,
        trace: "retain-on-failure",
        acceptDownloads: true
    },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } }
    ],
    webServer: {
        command: `node examples/playground/serve.js ${port}`,
        url: `http://127.0.0.1:${port}/`,
        // never a server that is already running: it may serve another checkout's build
        // (another port: PLAYGROUND_PORT=4180 npm run test:browser)
        reuseExistingServer: false
    }
});

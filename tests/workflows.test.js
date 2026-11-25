// The GitHub workflows (.github/workflows), read as YAML: which jobs run which steps in which order,
// on which events, with which permissions. A check reads the parsed jobs and steps, so a comment, a
// reordered key or another quoting style changes nothing; a shell command inside a step's `run` is
// text, and the checks of commands read it line by line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { workspacesToCheck } from "../scripts/check-pack.js";
import { GUARD_NAMES } from "../scripts/growth.js";
import { commandsOf, stringsOf, workflow, workflowFiles } from "./workflow.js";

const root = new URL("../", import.meta.url);
const OWN = new Set(JSON.parse(readFileSync(new URL("package.json", root), "utf8")).workspaces.map((w) => w.split("/").pop()));

/** A job of a workflow; fails when the workflow has none of that name. */
function jobOf(file, name) {
    const job = workflow(file).jobs?.[name];
    assert.ok(job, `${file} has no job ${name}`);
    return job;
}

/** The index of the first step whose `run` has a command that starts with `command`. */
const stepRunning = (steps, command) => steps.findIndex((step) => commandsOf(step).some((line) => line.startsWith(command)));

/** Every step of every job of every workflow, with its file and job. */
function allSteps() {
    return workflowFiles()
        .flatMap((file) => Object.entries(workflow(file).jobs ?? {}).flatMap(([job, { steps = [] }]) => steps.map((step) => ({ file, job, step }))));
}

// The browser tests run in Playwright's container image: its browsers belong to one Playwright
// version, which must be the version of @playwright/test the tests are run with
test("the Playwright container image matches @playwright/test in package-lock.json", () => {
    const lock = JSON.parse(readFileSync(new URL("package-lock.json", root), "utf8"));
    const locked = lock.packages["node_modules/@playwright/test"].version;
    // every mention in any value: a job's container (as an object or a string), a service, a docker run
    const images = workflowFiles().flatMap((file) => stringsOf(workflow(file)).flatMap((text) => text.match(/mcr\.microsoft\.com\/playwright:\S+/g) ?? []));
    assert.ok(images.length > 0, "no job runs in the Playwright image");
    for (const image of images) {
        const m = /^mcr\.microsoft\.com\/playwright:v([0-9][^-@\s]*)[^@\s]*@sha256:[0-9a-f]{64}$/.exec(image);
        assert.ok(m, `${image}: pin the image by tag and digest`);
        assert.equal(m[1], locked, `a workflow uses the Playwright image v${m[1]}, package-lock.json has @playwright/test ${locked}: raise both together`);
    }
});

// a process killed without its exit event, or a child that makes directories outside the run's id,
// leaves directories that test-run.js does not count: CI compares all pivotkit-* names around the
// tests (#526)
test("CI's test job fails when the tests leave any pivotkit-* directory in the temporary directory", () => {
    const steps = jobOf("ci.yml", "test").steps;
    const save = stepRunning(steps, "node scripts/temp-dirs.js save ");
    const tests = stepRunning(steps, "npm run coverage");
    const repository = stepRunning(steps, 'node scripts/test-run.js node --test "tests/*.test.js"');
    const check = stepRunning(steps, "node scripts/temp-dirs.js check ");
    assert.ok(save !== -1 && tests !== -1 && save < tests, "the names are saved before the tests");
    assert.ok(repository !== -1 && check > repository, "they are compared after the repository checks");
});

// one step per growth guard, so a failing guard names itself in the run's step list
test("CI's test job runs every growth guard in a step of its own", () => {
    const commands = jobOf("ci.yml", "test").steps.map((step) => commandsOf(step));
    for (const name of GUARD_NAMES) {
        assert.ok(commands.some((lines) => lines.length === 1 && lines[0] === `node scripts/growth.js ${name}`), `ci.yml runs no step "node scripts/growth.js ${name}"`);
    }
});

// npm audit signatures checks the registry signatures of what npm ci installed: the step right after
// the install, in CI's test job and in the release's build job, through scripts/audit-signatures.js
// (tried again only when the registry's answer cannot be read)
test("CI's test job and the release build verify the registry signatures right after npm ci", () => {
    for (const [file, name] of [["ci.yml", "test"], ["release.yml", "build"]]) {
        const steps = jobOf(file, name).steps;
        const install = stepRunning(steps, "npm ci --no-audit");
        assert.ok(install !== -1, `${file} ${name}: no npm ci`);
        assert.deepEqual(commandsOf(steps[install + 1]), ["node scripts/audit-signatures.js"], `${file} ${name}: the signature check is the step right after the install`);
    }
});

// the web component's size step runs on the Node major its size check names (zlibNote): that Node's
// bundled zlib gives the numbers CI checks against the budgets
test("CI measures the web component's size on the Node major pivotkit-element's build.js names", async () => {
    const { SIZE_NODE } = await import("../packages/pivotkit-element/build.js");
    const job = jobOf("ci.yml", "test");
    const step = job.steps[stepRunning(job.steps, "npm run size -w pivotkit-element")];
    assert.ok(step, "no step runs npm run size -w pivotkit-element");
    assert.deepEqual(commandsOf(step), ["npm run size -w pivotkit-element"]);
    assert.equal(step.if, `matrix.node == '${SIZE_NODE}'`);
    assert.ok(job.strategy.matrix.node.includes(SIZE_NODE), `the test job's Node matrix has no ${SIZE_NODE}`);
});

// a value that starts with "-" is read as an option: node -e ends the step with "bad option" (#660),
// and grep takes it for flags, so a check that the token is not on the log never fails. A workflow
// hands values to an inline node script through the environment and puts "--" or -e before a grep
// pattern taken from a variable. These are checks of the command lines; a script over several lines
// is not covered
test("no workflow passes a value that may start with \"-\" where a command reads options", () => {
    for (const { file, job, step } of allSteps()) {
        for (const line of commandsOf(step)) {
            const where = `${file} ${job} "${step.name ?? step.uses}"`;
            if (/\bnode (-e|-p|--eval|--print)\b/.test(line)) assert.doesNotMatch(line, /process\.argv/, `${where} reads process.argv in an inline node script`);
            const grep = /\bgrep((?:\s+-[A-Za-z]+)*)\s+"\$/.exec(line);
            if (grep) assert.match(grep[1], /-[A-Za-z]*e$/, `${where} gives grep a pattern from a variable without -- or -e`);
        }
    }
});

// the file handling of pivotkit-node (junctions, drive letters, device names), pivotkit-cli and the whole of
// pivotkit-server (workers, output directory, download markers, listen, state, sign-in, secret
// files) are tested on Windows and macOS too, not only on Linux
test("CI runs pivotkit-node's, pivotkit-cli's and pivotkit-server's tests on Windows and macOS", () => {
    const job = jobOf("ci.yml", "platforms");
    assert.equal(job["runs-on"], "${{ matrix.os }}");
    assert.deepEqual(job.strategy.matrix.include.map((target) => target.os).sort(), ["macos-latest", "windows-latest"]);
    const commands = job.steps.flatMap(commandsOf);
    for (const name of ["pivotkit-node", "pivotkit-cli", "pivotkit-server"]) {
        assert.ok(commands.includes(`npm test -w ${name}`), `the platforms job does not run npm test -w ${name}`);
    }
});

test("the release workflow runs check-release for the tagged package before it packs", () => {
    const steps = jobOf("release.yml", "build").steps;
    const check = stepRunning(steps, "node scripts/check-release.js");
    assert.ok(check !== -1, "release.yml does not run scripts/check-release.js");
    assert.ok(check < steps.findIndex((step) => step.id === "pack"), "check-release runs after the pack");
});

// A compromised dev dependency could change the packages during lint and tests (#506). So the
// build job packs and uploads the tarball first. Only the compilers and bundlers run before the
// pack: tsc for every workspace's declarations, and the package's own prepack. The publish job
// stages only a tarball with the integrity the Pack step recorded.
test("the release packs and uploads the tarball before lint and tests, and publish checks its integrity", () => {
    const build = jobOf("release.yml", "build");
    const steps = build.steps;
    const signatures = stepRunning(steps, "node scripts/audit-signatures.js");
    const pack = steps.findIndex((step) => step.name === "Pack");
    const upload = steps.findIndex((step) => String(step.uses).startsWith("actions/upload-artifact@"));
    const checks = stepRunning(steps, "npm run lint");
    assert.ok(signatures !== -1 && pack === signatures + 2, "the pack follows the install, its signature check and one step");
    // the pack step itself runs these commands and no other, word for word on purpose: it makes the
    // tarball that is published, so any change to it needs a review here
    assert.deepEqual(commandsOf(steps[pack]), [
        "set -o pipefail",
        'mkdir -p "$RUNNER_TEMP/pack"',
        'file="$(npm pack --workspace "$PACKAGE" --pack-destination "$RUNNER_TEMP/pack" --json | node scripts/npm-pack.js)"',
        'test -f "$RUNNER_TEMP/pack/$file"',
        'echo "file=$file" >> "$GITHUB_OUTPUT"',
        'echo "integrity=sha512-$(openssl dgst -sha512 -binary "$RUNNER_TEMP/pack/$file" | base64 -w0)" >> "$GITHUB_OUTPUT"'
    ]);
    assert.ok(upload === pack + 1, "the upload follows the pack");
    assert.ok(checks > upload, "lint, types and tests run after the upload");
    // the one step between the signature check and the pack, whatever form another one takes
    // (a run block, a run without a name, an action): only the declarations are built there
    assert.deepEqual(steps.slice(signatures + 1, pack), [{ name: "Types", run: "npm run types --workspaces --if-present" }]);
    // nothing changes how these two run: no env, working-directory, continue-on-error or if
    assert.deepEqual(Object.keys(steps[signatures]).sort(), ["name", "run"]);
    assert.deepEqual(Object.keys(steps[pack]).sort(), ["env", "id", "name", "run"]);
    assert.deepEqual(steps[pack].env, { PACKAGE: "${{ steps.package.outputs.name }}" });
    assert.equal(steps[pack].id, "pack");
    assert.equal(build.outputs.integrity, "${{ steps.pack.outputs.integrity }}");
    const publish = jobOf("release.yml", "publish").steps;
    const compare = publish.findIndex((step) => commandsOf(step).some((line) => line.startsWith('test "$actual" = "$INTEGRITY"')));
    assert.ok(compare !== -1, "the publish job compares the tarball's integrity with the recorded one");
    assert.equal(publish[compare].env.INTEGRITY, "${{ needs.build.outputs.integrity }}");
    assert.ok(compare < stepRunning(publish, "npm stage publish"), "it compares before it stages");
});

test("every package of this repository is checked, packed and released", () => {
    const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
    const release = workflow("release.yml");
    // the case of the tag check: "pivotkit-core|pivotkit-react|...) ;;"
    const tagCheck = release.jobs.build.steps.flatMap(commandsOf).map((line) => /^((?:pivotkit-[a-z]+\|?)+)\) ;;$/.exec(line)?.[1]).find(Boolean);
    const accepted = tagCheck?.split("|") ?? [];
    // pack:check names no workspace: check-pack.js then checks every one of the root package.json
    assert.equal(pkg.scripts["pack:check"], "node scripts/check-pack.js");
    assert.deepEqual(workspacesToCheck([]), [...OWN]);
    for (const name of OWN) {
        assert.ok(release.on.push.tags.includes(`${name}@*`), `release.yml has no tag pattern for ${name}`);
        assert.ok(accepted.includes(name), `release.yml does not accept a ${name} tag`);
    }
    // the docs site may be published by hand from a release tag of any package
    const docs = workflow("docs.yml").jobs.build.steps.flatMap(commandsOf).join("\n");
    const tagPattern = new RegExp(/\^pivotkit-\([a-z|]+\)@[^\s"]+/.exec(docs)?.[0].replace(/\\\\/g, "\\") ?? "^$");
    for (const name of OWN) assert.ok(tagPattern.test(`${name}@1.2.3`), `docs.yml does not accept the tag ${name}@1.2.3`);
});

// The browser tests run as one job per engine, shard and React version, each well inside
// its timeout: the matrix covers every Playwright project on React 18 and 19, every shard of a project,
// and each job runs its own project and shard only. Playwright gives each shard the same number of
// tests; PWTEST_SHARD_WEIGHTS gives WebKit's shards other shares (#672). One weight per shard: another
// count makes Playwright throw. Each weight above zero, or a shard runs nothing.
test("the browser jobs cover every engine and every shard on React 18 and 19", async () => {
    const { default: config } = await import("../playwright.config.js");
    const projects = config.projects.map((project) => project.name);
    assert.deepEqual(projects, ["chromium", "firefox", "webkit"]);
    const job = jobOf("browser.yml", "browser");
    assert.deepEqual(job.strategy.matrix.react, ["18", "19"]);
    const targets = job.strategy.matrix.target;
    for (const browser of projects) {
        const shards = targets.filter((t) => t.browser === browser);
        assert.ok(shards.length > 0, `${browser} has no job`);
        assert.deepEqual(shards.map((t) => t.shard), Array.from({ length: shards[0].of }, (_, i) => i + 1), `${browser}: every shard once`);
        assert.ok(shards.every((t) => t.of === shards.length), `${browser}: shards of one size`);
    }
    const step = job.steps[stepRunning(job.steps, "node scripts/test-run.js npx playwright test")];
    assert.ok(step, "the browser job runs no Playwright tests");
    assert.deepEqual(commandsOf(step), ["node scripts/test-run.js npx playwright test --project=${{ matrix.target.browser }} --shard=${{ matrix.target.shard }}/${{ matrix.target.of }}"]);
    const weighted = /^\$\{\{ matrix\.target\.browser == '(\w+)' && '(\d+(?::\d+)*)' \|\| '' \}\}$/.exec(step.env?.PWTEST_SHARD_WEIGHTS ?? "");
    assert.ok(weighted, "the test step gives WebKit's shards their weights");
    assert.equal(weighted[1], "webkit");
    const weights = weighted[2].split(":").map(Number);
    assert.equal(weights.length, targets.filter((t) => t.browser === "webkit").length, "one weight per WebKit shard");
    assert.ok(weights.every((w) => w > 0), "no shard without tests");
    const minutes = job["timeout-minutes"];
    assert.ok(minutes > 0 && minutes <= 15, `browser job timeout ${minutes} minutes`);
});

// The browser matrix (browser.yml) is most of CI's runner time (#820). A pull request starts it on its
// own and skips it when it changes only paths the browser jobs never read; ci.yml calls it on every
// push to main, so the green ci.yml run that release.yml and image.yml need holds the browser tests
const BROWSER_IGNORED = ["docs/**", "**.md", "examples/angular/**"];

test("a pull request runs the browser matrix unless it changes only docs, Markdown or the Angular example; main always runs it", () => {
    const browser = workflow("browser.yml");
    assert.deepEqual(Object.keys(browser.on).sort(), ["pull_request", "workflow_call"]);
    assert.deepEqual(browser.on.pull_request, { "paths-ignore": BROWSER_IGNORED });
    assert.notEqual(browser.concurrency.group, workflow("ci.yml").concurrency.group, "one concurrency group for both workflows: one run cancels the other");
    const ci = workflow("ci.yml");
    assert.ok("push" in ci.on && "pull_request" in ci.on, "ci.yml runs on push and pull_request");
    assert.ok(ci.on.push.branches?.includes("main"), "ci.yml does not run on a push to main, so main's browser jobs never run");
    assert.equal(ci.on.pull_request?.paths ?? ci.on.pull_request?.["paths-ignore"], undefined, "ci.yml's test, platforms and angular jobs run on every pull request");
    assert.deepEqual(jobOf("ci.yml", "browser"), {
        if: "github.event_name == 'push'",
        uses: "./.github/workflows/browser.yml"
    });
    // a pull request's run of ci.yml has no browser jobs: a release and the image take a push run only
    for (const [file, job] of [["release.yml", "build"], ["image.yml", "publish"]]) {
        const queries = jobOf(file, job).steps.flatMap(commandsOf).filter((line) => line.includes("actions/workflows/ci.yml/runs?"));
        assert.equal(queries.length, 1, `${file}: one query for the CI run of the tagged commit`);
        assert.match(queries[0], /[?&]event=push(&|")/, `${file} accepts a pull request's CI run, which has no browser tests`);
        assert.match(queries[0], /[?&]status=success(&|")/, `${file} accepts a CI run that did not succeed`);
        assert.match(queries[0], /[?&]head_sha=\$GITHUB_SHA(&|")/, `${file} accepts a CI run of another commit`);
    }
});

// what the browser jobs build, serve and test names no ignored path: a string such as "docs/x.md",
// "../README.md", `${root}docs/`, join(root, "docs") or "examples/angular/..." in their code would
// make a change there untested. It looks for such strings, so a path built another way escapes it.
// Comment lines are skipped; a URL ("https://host/docs/") is not a repository path. A package.json
// names its README and CHANGELOG for npm pack, which ci.yml's test job checks, not the browser jobs
test("the code of the browser jobs names no path their pull request filter ignores", () => {
    const read = ["playwright.config.js", "tests/browser", "tests/react19", "examples/playground", "packages", "scripts/site-url.js"];
    const files = read.flatMap((path) => {
        const url = new URL(path, root);
        if (/\.[a-z]+$/.test(path)) return [path];
        return readdirSync(url, { recursive: true }).map((name) => `${path}/${name.replaceAll("\\", "/")}`);
    }).filter((path) => /\.(c?m?js|jsx|html|json)$/.test(path) && !/(^|\/)package(-lock)?\.json$/.test(path) && !/(^|\/)(node_modules|dist|types|test)\//.test(path) && !/\/data\//.test(path));
    assert.ok(files.length > 100, `only ${files.length} files read`);
    const ignored = /["'`}](?:\.{1,2}\/)*(?:docs\/|examples\/angular\/)|["'`][^"'`\s]*\.md["'`]|["'`](?:docs|angular)["'`]\s*[,)]/;
    const found = files.flatMap((path) => readFileSync(new URL(path, root), "utf8").split("\n")
        .map((line, i) => ({ line: line.trim(), at: `${path}:${i + 1}` }))
        .filter(({ line }) => !/^(\/\/|\*|\/\*)/.test(line) && ignored.test(line))
        .map(({ at }) => at));
    assert.deepEqual(found, [], "the browser jobs read a path that browser.yml's paths-ignore skips: narrow the ignore list");
});

// PWTEST_SHARD_WEIGHTS is not in Playwright's docs: an update that drops it would quietly bring back
// shards of equal test counts, so the installed Playwright must still read it
test("the installed Playwright still reads PWTEST_SHARD_WEIGHTS", () => {
    // an internal file of Playwright: a release that moves it fails here, with this message
    const file = "node_modules/playwright/lib/cli/testActions.js";
    let cli;
    try {
        cli = readFileSync(new URL(file, root), "utf8");
    } catch (error) {
        assert.fail(`${file} is gone (${error.code}): after npm ci, find where Playwright reads PWTEST_SHARD_WEIGHTS now (#672)`);
    }
    assert.match(cli, /process\.env\.PWTEST_SHARD_WEIGHTS/, "Playwright no longer reads PWTEST_SHARD_WEIGHTS: balance the WebKit shards in browser.yml another way (#672)");
});

/**
 * The lines of every value of release.yml, without comments: the steps' `run` and also what an action
 * gets in `with` (a script), so a command cannot hide from the checks below in another key.
 */
const releaseCommands = () => stringsOf(workflow("release.yml")).flatMap((text) => text.split("\n")).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));

// npm reads "dir/file.tgz" as the GitHub repository <owner>/<repo>; a local tarball needs ./ or /
test("the release workflow publishes the tarball by a path npm reads as a file", () => {
    const publishes = releaseCommands().flatMap((line) => [...line.matchAll(/npm (?:stage )?publish\s+"?([^"\s]+)/g)].map((m) => m[1]));
    assert.ok(publishes.length > 0, "no npm stage publish in release.yml");
    for (const target of publishes) {
        assert.match(target, /^(\.\/|\/)/, `npm publish ${target}: start the path with ./`);
    }
});

// The publish job holds the OIDC token, so the npm it runs is installed from a tarball whose sha512 is
// committed in release.yml, never by a name the registry resolves (#724)
test("the publish job installs npm only from a tarball with the integrity committed in release.yml", () => {
    const steps = jobOf("release.yml", "publish").steps;
    const installs = steps.flatMap((step, index) => commandsOf(step).filter((line) => /\bnpm\s+(install|i|add)\b/.test(line)).map((line) => ({ step, index, line })));
    assert.equal(installs.length, 1, `the publish job installs with npm in ${installs.length} places, not one: ${JSON.stringify(installs.map(({ line }) => line))}`);
    const [{ step, index, line }] = installs;
    assert.equal(line, 'npm install --global "$file" --offline --ignore-scripts --no-audit --no-fund', "npm is installed from the checked file, offline and without scripts");
    assert.ok(index < stepRunning(steps, "npm stage publish"), "npm is installed before it stages");
    assert.match(step.env?.NPM_VERSION ?? "", /^\d+\.\d+\.\d+$/, "the step pins NPM_VERSION exactly");
    // staged publishing needs npm 11.15.0 or later (npm's documentation, "Staged publishing")
    const [major, minor] = step.env.NPM_VERSION.split(".").map(Number);
    assert.ok(major > 11 || (major === 11 && minor >= 15), `npm ${step.env.NPM_VERSION} cannot stage: it needs 11.15.0 or later`);
    assert.match(step.env?.NPM_INTEGRITY ?? "", /^sha512-[A-Za-z0-9+/]{86}==$/, "the step commits NPM_INTEGRITY, npm's dist.integrity");
    // these commands and no other, in this order: download, compare (fail closed), install, version check
    assert.deepEqual(commandsOf(step), [
        'file="$RUNNER_TEMP/npm-$NPM_VERSION.tgz"',
        'curl --fail --silent --show-error --location --proto "=https" --output "$file" "https://registry.npmjs.org/npm/-/npm-$NPM_VERSION.tgz"',
        'actual="sha512-$(openssl dgst -sha512 -binary "$file" | base64 -w0)"',
        'test "$actual" = "$NPM_INTEGRITY" || { echo "npm $NPM_VERSION tarball has $actual, release.yml expects $NPM_INTEGRITY"; exit 1; }',
        line,
        'test "$(npm --version)" = "$NPM_VERSION" || { echo "npm $(npm --version) is installed, not $NPM_VERSION"; exit 1; }'
    ]);
    assert.deepEqual(Object.keys(step).sort(), ["env", "name", "run"], "nothing changes how the step runs: no if, continue-on-error or working-directory");
});

// The check above holds only while nothing else in the job decides which npm runs or what it fetches:
// an allowlist of the package manager calls, the actions and the settings of the publish job (#724)
test("the publish job runs no package manager call, action or setting beyond its allowlist", () => {
    const release = workflow("release.yml");
    const job = jobOf("release.yml", "publish");
    const allowed = new Set([
        'npm install --global "$file" --offline --ignore-scripts --no-audit --no-fund',
        'test "$(npm --version)" = "$NPM_VERSION" || { echo "npm $(npm --version) is installed, not $NPM_VERSION"; exit 1; }',
        // names npm only in its message
        'test "$actual" = "$NPM_INTEGRITY" || { echo "npm $NPM_VERSION tarball has $actual, release.yml expects $NPM_INTEGRITY"; exit 1; }',
        'npm stage publish "./pack/$TARBALL" --provenance --access public --ignore-scripts 2>&1 | tee stage.log'
    ]);
    // an echo line that runs nothing (no command substitution, no unescaped backtick) only writes text
    // the name as a command, also as a path (/usr/bin/npm), not inside a word or a file name (npm-11.21.1.tgz)
    const call = /(^|[^\w.-])(npm|npx|corepack|pnpm|yarn)(?=\s|$|[;)|&])/;
    const textOnly = (line) => /^echo\s/.test(line) && !line.includes("$(") && !/(^|[^\\])`/.test(line);
    for (const step of job.steps) {
        for (const line of commandsOf(step)) {
            if (call.test(line) && !textOnly(line)) assert.ok(allowed.has(line), `the publish job runs a package manager outside the allowlist: ${line}`);
        }
    }
    // a later step's PATH or environment would decide which npm runs
    assert.deepEqual(stringsOf(job).filter((text) => /GITHUB_(PATH|ENV)\b/.test(text)), [], "the publish job writes to GITHUB_PATH or GITHUB_ENV");
    // only these actions, and setup-node with these inputs alone (no cache, no other registry)
    assert.deepEqual(job.steps.filter((step) => step.uses).map((step) => step.uses.split("@")[0]), ["actions/download-artifact", "actions/setup-node"], "the publish job uses other actions");
    const setupNode = job.steps.find((step) => String(step.uses).startsWith("actions/setup-node@"));
    assert.deepEqual(setupNode.with, { "node-version": "24", "registry-url": "https://registry.npmjs.org" }, "setup-node takes other inputs in the publish job");
    // nothing changes the shell, the directory or the environment npm runs in
    assert.equal(release.env, undefined, "release.yml sets env for every job");
    assert.equal(release.defaults, undefined, "release.yml sets defaults for every job");
    assert.equal(job.env, undefined, "the publish job sets env");
    assert.equal(job.defaults, undefined, "the publish job sets defaults");
    assert.equal(job.container, undefined, "the publish job runs in a container");
    const envNames = new Set(["TAG", "TARBALL", "INTEGRITY", "NPM_VERSION", "NPM_INTEGRITY"]);
    for (const step of job.steps) {
        const where = `publish "${step.name ?? step.uses}"`;
        assert.equal(step.shell, undefined, `${where} sets a shell`);
        assert.equal(step["working-directory"], undefined, `${where} sets a working directory`);
        for (const name of Object.keys(step.env ?? {})) assert.ok(envNames.has(name), `${where} sets env ${name}, which may change how npm runs`);
    }
});

// The trusted publisher on npm allows staging only (RELEASING.md): a plain npm publish
// would fail at release time, after the tag is pushed
test("the release workflow stages on npm and never publishes directly", () => {
    const commands = releaseCommands();
    const stages = commands.filter((line) => /npm stage publish /.test(line));
    assert.ok(stages.length > 0, "release.yml does not run npm stage publish");
    // --provenance asks for the attestation explicitly, so a run that cannot make one fails instead of
    // staging an unattested version; --ignore-scripts keeps lifecycle scripts away from the OIDC token
    for (const line of stages) {
        assert.match(line, /\s--provenance(\s|$)/, `npm stage publish without --provenance: ${line}`);
        assert.match(line, /\s--ignore-scripts(\s|$)/, `npm stage publish without --ignore-scripts: ${line}`);
        assert.match(line, /\s--access public(\s|$)/, `npm stage publish without --access public: ${line}`);
    }
    // no other registry command: a direct publish (any spacing), dist-tag, deprecate, unpublish,
    // version, or npx, which can fetch and run a package while the OIDC token is available
    const others = commands.map((line) => line.replaceAll("npm stage publish", "")).filter((line) => /npm\s+(publish|dist-tag|deprecate|unpublish|version)\b|\bnpx\b/.test(line));
    assert.deepEqual(others, [], "release.yml runs an npm registry command other than npm stage publish");
});

// The OIDC token exists only in the job that waits for the "npm" environment's reviewers, and only a
// pushed release tag starts the workflow (RELEASING.md)
test("the release workflow holds the OIDC token only behind the npm environment, on tags only", () => {
    const release = workflow("release.yml");
    assert.deepEqual(Object.keys(release.jobs).sort(), ["build", "publish"], "release.yml has other jobs than build and publish");
    assert.equal(release.jobs.publish.environment, "npm", "the publish job does not wait for the npm environment");
    assert.equal(release.jobs.publish.permissions?.["id-token"], "write", "the publish job has no id-token: write");
    assert.equal(release.jobs.build.permissions?.["id-token"], undefined, "the build job runs the dependencies and must not get the OIDC token");
    assert.equal(release.permissions?.["id-token"], undefined, "id-token is granted to every job");
    assert.deepEqual(Object.keys(release.on), ["push"], "release.yml runs on other events than push");
    assert.deepEqual(Object.keys(release.on.push), ["tags"], "release.yml runs on a push of something other than tags");
});

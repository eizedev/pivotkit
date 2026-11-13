// The completion scripts are made from the command table: every command and option is in them, and
// each shell that is installed parses its script (bash -n, zsh -n, fish --no-execute, PowerShell's parser).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMMANDS, optionsOf } from "../src/commands.js";
import { run, tempDir } from "./helpers.js";

const has = (cmd) => {
    try {
        execFileSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};

const CHECKS = {
    bash: ["bash", (f) => ["-n", f]],
    zsh: ["zsh", (f) => ["-n", f]],
    fish: ["fish", (f) => ["--no-execute", f]],
    powershell: ["pwsh", (f) => ["-NoProfile", "-Command", `$e = $null; [System.Management.Automation.Language.Parser]::ParseFile('${f}', [ref]$null, [ref]$e) | Out-Null; if ($e.Count) { $e | ForEach-Object { $_.Message }; exit 1 }`]]
};

for (const [shell, [binary, args]] of Object.entries(CHECKS)) {
    test(`completion ${shell}: every command and option, and ${binary} parses it`, { skip: has(binary) ? false : `${binary} is not installed` }, async () => {
        const r = await run(["completion", shell]);
        assert.equal(r.code, 0);
        for (const command of Object.keys(COMMANDS)) {
            assert.ok(r.stdout.includes(command), command);
            for (const option of Object.keys(optionsOf(command))) assert.ok(r.stdout.includes(option), `${command} --${option}`);
        }
        const file = join(tempDir(), `pivotkit.${shell}`);
        writeFileSync(file, r.stdout);
        execFileSync(binary, args(file), { stdio: "pipe" });
    });
}

test("bash completes commands, options and the values of an option with choices", { skip: has("bash") ? false : "bash is not installed" }, async () => {
    const script = (await run(["completion", "bash"])).stdout;
    const complete = (words) =>
        execFileSync("bash", ["-c", `${script}\nCOMP_WORDS=(${words.map((w) => `'${w}'`).join(" ")}); COMP_CWORD=${words.length - 1}; _pivotkit; printf '%s\\n' "\${COMPREPLY[@]}"`], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(complete(["pivotkit", "re"]), ["render"]);
    assert.ok(complete(["pivotkit", "render", "--fo"]).includes("--format"));
    assert.deepEqual(complete(["pivotkit", "render", "--format", "s"]), ["svg"]);
    assert.deepEqual(complete(["pivotkit", "completion", "p"]), ["powershell"]);
});

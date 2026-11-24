// The completion scripts are made from the command table: every command and its options are in them,
// `help` completes the command names, and each shell that is installed parses its script (bash -n,
// zsh -n, fish --no-execute, PowerShell's parser).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMMANDS, optionsOf } from "../src/commands.js";
import { has, run, tempDir } from "./helpers.js";

const CHECKS = {
    bash: ["bash", (f) => ["-n", f]],
    zsh: ["zsh", (f) => ["-n", f]],
    fish: ["fish", (f) => ["--no-execute", f]],
    powershell: ["pwsh", (f) => ["-NoProfile", "-Command", `$e = $null; [System.Management.Automation.Language.Parser]::ParseFile('${f}', [ref]$null, [ref]$e) | Out-Null; if ($e.Count) { $e | ForEach-Object { $_.Message }; exit 1 }`]]
};

/** A regular expression's text for a word taken as it is. */
const literal = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Where each generator writes a command, one of its options and the command names `help` completes:
 * forms only the generator writes, so a script without them fails (a short word such as "list" or
 * "json" is in any script by chance).
 */
const FORMS = {
    bash: {
        command: (c) => new RegExp(`^ {4}${literal(c)}\\)$`, "m"),
        // within the command's own case: no other "    name)" line between
        option: (c, o) => new RegExp(`^ {4}${literal(c)}\\)\\n(?:(?!^ {4}[\\w-]+\\)$)[\\s\\S])*?compgen -W '[^']*--${literal(o)}(?:[ ']|$)`, "m"),
        help: /^ {4}help\)\n(?:(?!^ {4}[\w-]+\)$)[\s\S])*?compgen -W 'render validate/m
    },
    fish: {
        command: (c) => new RegExp(`^complete -c pivotkit -n __fish_use_subcommand -a '${literal(c)}' `, "m"),
        option: (c, o) => new RegExp(`^complete -c pivotkit -n '__fish_seen_subcommand_from ${literal(c)}' -l ${literal(o)}(?: |$)`, "m"),
        help: /^complete -c pivotkit -n '__fish_seen_subcommand_from help' -a 'render validate/m
    },
    powershell: {
        command: (c) => new RegExp(`^ {4}'${literal(c)}' = @\\{`, "m"),
        option: (c, o) => new RegExp(`^ {4}'${literal(c)}' = @\\{ options = @\\([^)]*'--${literal(o)}'`, "m"),
        help: /\$words\[1\] -eq 'help' .*\$candidates = @\('render', 'validate'/
    }
};
FORMS.zsh = FORMS.bash;

for (const shell of Object.keys(CHECKS)) {
    test(`completion ${shell}: every command with each of its options, and the command names after help`, async () => {
        const r = await run(["completion", shell]);
        assert.equal(r.code, 0);
        const forms = FORMS[shell];
        for (const command of Object.keys(COMMANDS)) {
            assert.match(r.stdout, forms.command(command), command);
            for (const option of Object.keys(optionsOf(command))) assert.match(r.stdout, forms.option(command, option), `${command} --${option}`);
        }
        assert.match(r.stdout, forms.help);
    });
}

for (const [shell, [binary, args]] of Object.entries(CHECKS)) {
    test(`completion ${shell}: ${binary} parses it`, { skip: has(binary) ? false : `${binary} is not installed` }, async () => {
        const file = join(tempDir(), `pivotkit.${shell}`);
        writeFileSync(file, (await run(["completion", shell])).stdout);
        execFileSync(binary, args(file), { stdio: "pipe" });
    });
}

test("bash completes commands, options and the values of an option with choices", { skip: has("bash") ? false : "bash is not installed" }, async () => {
    // bash sources the script from a file, named as bash -n above gets it. As one -c argument it
    // would meet the Windows command-line limit (about 8 KiB) and be cut
    const file = join(tempDir(), "pivotkit.bash");
    writeFileSync(file, (await run(["completion", "bash"])).stdout);
    const complete = (words) =>
        execFileSync("bash", ["-c", `source "$1"; COMP_WORDS=(${words.map((w) => `'${w}'`).join(" ")}); COMP_CWORD=${words.length - 1}; _pivotkit; printf '%s\\n' "\${COMPREPLY[@]}"`, "bash", file], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(complete(["pivotkit", "re"]), ["render"]);
    assert.ok(complete(["pivotkit", "render", "--fo"]).includes("--format"));
    assert.deepEqual(complete(["pivotkit", "render", "--format", "s"]), ["svg"]);
    assert.deepEqual(complete(["pivotkit", "completion", "p"]), ["powershell"]);
    assert.deepEqual(complete(["pivotkit", "help", "re"]), ["render"]);
});

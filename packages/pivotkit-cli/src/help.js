/*
 * The help texts and the shell completions, both made from the command table (commands.js).
 */

import { COMMANDS, GLOBAL_OPTIONS, SHELLS, optionsOf } from "./commands.js";

/** One option as the help writes it: "-o, --output <file>". */
function optionLine(name, spec) {
    const flag = `${spec.short ? `-${spec.short}, ` : "    "}--${name}${spec.type === "string" ? ` <${spec.value ?? "value"}>` : ""}`;
    const choices = spec.choices ? ` (${spec.choices.join(", ")})` : "";
    const env = spec.env ? ` [env ${spec.env}]` : "";
    return { flag, text: `${spec.text}${choices}${env}` };
}

/** Lines of two columns, the first padded. */
const columns = (rows) => {
    const width = Math.min(32, Math.max(...rows.map((r) => r.flag.length)));
    return rows.map((r) => `  ${r.flag.padEnd(width)}  ${r.text}`).join("\n");
};

/** The help of pivotkit, or of one command. */
export function helpText(command) {
    if (!command || !Object.hasOwn(COMMANDS, command)) {
        const list = Object.entries(COMMANDS).map(([name, c]) => ({ flag: name, text: c.text }));
        return `pivotkit - run pivotkit views without a browser\n\nUsage: pivotkit <command> [options]\n\nCommands:\n${columns(list)}\n\nOptions:\n${columns([...Object.entries(GLOBAL_OPTIONS).map(([n, s]) => optionLine(n, s)), { flag: "    --version", text: "Show the versions of pivotkit-cli, pivotkit-report and pivotkit-core." }])}\n\nExit codes: 0 done, 1 findings (errors in the view, or warnings with --strict), 2 usage, file, limit or template errors.\nRun "pivotkit help <command>" for a command's options. Documentation: https://pivotkit.eize.dev/reference/cli/\n`;
    }
    const c = COMMANDS[command];
    const args = c.args.length ? `\n\nArguments:\n${columns(c.args.map((a) => ({ flag: a.optional ? `[${a.name}]` : `<${a.name}>`, text: a.text })))}` : "";
    const own = Object.entries(c.options).map(([n, s]) => optionLine(n, s));
    const global = Object.entries(GLOBAL_OPTIONS).map(([n, s]) => optionLine(n, s));
    const examples = c.examples?.length ? `\n\nExamples:\n${c.examples.map((e) => `  ${e}`).join("\n")}` : "";
    return `${c.text}\n\nUsage: ${c.usage}${args}${own.length ? `\n\nOptions:\n${columns(own)}` : ""}\n\nCommon options:\n${columns(global)}${examples}\n`;
}

/** Every command's long options, with whether each takes a value and how a shell completes it. */
function table() {
    return Object.keys(COMMANDS).map((name) => ({
        name,
        args: COMMANDS[name].args,
        options: Object.entries(optionsOf(name)).map(([option, spec]) => ({ name: option, short: spec.short, value: spec.type === "string", choices: spec.choices ?? null, complete: spec.complete ?? null }))
    }));
}

/** Quotes a word for a POSIX shell script. */
const sh = (word) => `'${String(word).replace(/'/g, "'\\''")}'`;

/**
 * The completion script of a shell.
 * @param {"bash" | "zsh" | "fish" | "powershell"} shell
 */
export function completionScript(shell) {
    const commands = table();
    const names = commands.map((c) => c.name).join(" ");
    if (shell === "bash" || shell === "zsh") {
        const cases = commands
            .map((c) => {
                const opts = c.options.flatMap((o) => [`--${o.name}`, ...(o.short ? [`-${o.short}`] : [])]).join(" ");
                const values = c.options
                    .filter((o) => o.value)
                    .map((o) => {
                        const flags = [`--${o.name}`, ...(o.short ? [`-${o.short}`] : [])].join("|");
                        const reply = o.choices ? `COMPREPLY=( $(compgen -W ${sh(o.choices.join(" "))} -- "$cur") )` : o.complete === "dir" ? 'COMPREPLY=( $(compgen -d -- "$cur") )' : o.complete === "file" ? 'COMPREPLY=( $(compgen -f -- "$cur") )' : "COMPREPLY=()";
                        return `        ${flags}) ${reply}; return 0 ;;`;
                    })
                    .join("\n");
                const arg = c.args[0]?.complete === "shell" ? `compgen -W ${sh(SHELLS.join(" "))} -- "$cur"` : c.args[0]?.complete === "command" ? `compgen -W ${sh(names)} -- "$cur"` : 'compgen -f -- "$cur"';
                return `    ${c.name})\n      case "$prev" in\n${values || "        *) ;;"}\n      esac\n      if [[ "$cur" == -* ]]; then COMPREPLY=( $(compgen -W ${sh(opts)} -- "$cur") ); else COMPREPLY=( $(${arg}) ); fi ;;`;
            })
            .join("\n");
        const body = `_pivotkit() {\n  local cur prev cmd\n  cur="\${COMP_WORDS[COMP_CWORD]}"\n  prev="\${COMP_WORDS[COMP_CWORD-1]}"\n  cmd="\${COMP_WORDS[1]}"\n  if [[ $COMP_CWORD -eq 1 ]]; then\n    COMPREPLY=( $(compgen -W ${sh(`${names} --help --version`)} -- "$cur") )\n    return 0\n  fi\n  case "$cmd" in\n${cases}\n  esac\n}\n`;
        return shell === "bash"
            ? `# pivotkit completion for bash: eval "$(pivotkit completion bash)"\n${body}complete -o default -F _pivotkit pivotkit\n`
            : `#compdef pivotkit\n# pivotkit completion for zsh: eval "$(pivotkit completion zsh)" (uses bash completion)\nautoload -U +X bashcompinit && bashcompinit\n${body}complete -o default -F _pivotkit pivotkit\n`;
    }
    if (shell === "fish") {
        const lines = ["# pivotkit completion for fish: pivotkit completion fish | source", "complete -c pivotkit -f"];
        for (const c of commands) {
            lines.push(`complete -c pivotkit -n __fish_use_subcommand -a ${sh(c.name)} -d ${sh(COMMANDS[c.name].text)}`);
            for (const o of c.options) {
                const values = o.choices ? ` -x -a ${sh(o.choices.join(" "))}` : o.complete === "file" ? " -r -F" : o.complete === "dir" ? ` -x -a "(__fish_complete_directories)"` : o.value ? " -x" : "";
                lines.push(`complete -c pivotkit -n ${sh(`__fish_seen_subcommand_from ${c.name}`)} -l ${o.name}${o.short ? ` -s ${o.short}` : ""}${values}`);
            }
            if (c.args[0]?.complete === "shell") lines.push(`complete -c pivotkit -n ${sh("__fish_seen_subcommand_from completion")} -a ${sh(SHELLS.join(" "))}`);
            if (c.args[0]?.complete === "file") lines.push(`complete -c pivotkit -n ${sh(`__fish_seen_subcommand_from ${c.name}`)} -F`);
        }
        return `${lines.join("\n")}\n`;
    }
    // PowerShell: Register-ArgumentCompleter -Native
    const ps = (word) => `'${String(word).replace(/'/g, "''")}'`;
    const map = commands
        .map((c) => `    ${ps(c.name)} = @{ options = @(${c.options.flatMap((o) => [`--${o.name}`, ...(o.short ? [`-${o.short}`] : [])]).map(ps).join(", ")}); choices = @{ ${c.options.filter((o) => o.choices).map((o) => `${ps(`--${o.name}`)} = @(${o.choices.map(ps).join(", ")})`).join("; ")} } }`)
        .join("\n");
    return `# pivotkit completion for PowerShell: pivotkit completion powershell | Out-String | Invoke-Expression
$pivotkitCommands = @{
${map}
}
Register-ArgumentCompleter -Native -CommandName pivotkit -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $words = @($commandAst.CommandElements | ForEach-Object { $_.ToString() })
    if ($words.Count -le 1 -or ($words.Count -eq 2 -and $wordToComplete)) {
        $candidates = @(${commands.map((c) => ps(c.name)).join(", ")}, '--help', '--version')
    } else {
        $entry = $pivotkitCommands[$words[1]]
        if (-not $entry) { return }
        $previous = if ($wordToComplete) { $words[-2] } else { $words[-1] }
        if ($entry.choices.ContainsKey($previous)) { $candidates = $entry.choices[$previous] }
        elseif ($words[1] -eq 'completion') { $candidates = @(${SHELLS.map(ps).join(", ")}) }
        elseif ($wordToComplete -like '-*') { $candidates = $entry.options }
        else { return }
    }
    $candidates | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
`;
}

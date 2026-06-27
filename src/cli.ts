#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compile, compileWorkspace, workspaceRootForInput } from "./compile/compile.js";
import type { CompileResult } from "./compile/compile.js";
import { Provenance } from "./domain/provenance.js";

interface CliArgs {
  readonly command: string;
  readonly input: string | undefined;
  readonly workspace: string | undefined;
  readonly output: string | undefined;
  readonly report: boolean;
  readonly provenance: string | undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const [command = "", ...optionArgs] = argv;

  let input: string | undefined;
  let workspace: string | undefined;
  let output: string | undefined;
  let report = false;
  let provenance: string | undefined;
  for (let i = 0; i < optionArgs.length; i += 1) {
    const arg = optionArgs[i];
    if ((arg === "-i" || arg === "--input") && optionArgs[i + 1]) {
      input = optionArgs[i + 1];
      i += 1;
    } else if ((arg === "-w" || arg === "--workspace") && optionArgs[i + 1]) {
      workspace = optionArgs[i + 1];
      i += 1;
    } else if ((arg === "-o" || arg === "--output") && optionArgs[i + 1]) {
      output = optionArgs[i + 1];
      i += 1;
    } else if (arg === "--provenance" && optionArgs[i + 1]) {
      provenance = optionArgs[i + 1];
      i += 1;
    } else if (arg === "--report") {
      report = true;
    }
  }
  return { command, input, workspace, output, report, provenance };
}

function printProvenanceSummary(diagnostics: CompileResult["diagnostics"]): void {
  const counts = new Map<Provenance, number>();
  for (const d of diagnostics) counts.set(d.provenance, (counts.get(d.provenance) ?? 0) + 1);
  process.stdout.write("\nProvenance summary:\n");
  for (const provenance of Object.values(Provenance)) {
    process.stdout.write(`  ${provenance.padEnd(14)} ${counts.get(provenance) ?? 0}\n`);
  }
}

function printNotDerivable(diagnostics: CompileResult["diagnostics"]): void {
  const gaps = diagnostics.filter((d) => d.provenance === Provenance.NotDerivable);
  if (gaps.length === 0) return;
  process.stdout.write("\nNOT_DERIVABLE (invented by any hand-authored golden):\n");
  for (const gap of gaps) {
    process.stdout.write(`  - ${gap.target}: ${gap.message}\n`);
  }
}

function writeOutput(result: CompileResult, outputDir: string): void {
  for (const [relPath, content] of result.files) {
    const fullPath = join(outputDir, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf8");
    process.stdout.write(`wrote ${relPath}\n`);
  }
}

function runCompile(args: CliArgs): void {
  if (!args.output) {
    process.stderr.write("Error: -o <output-dir> is required\n");
    process.exit(1);
    return;
  }
  if (Boolean(args.input) === Boolean(args.workspace)) {
    process.stderr.write("Error: specify exactly one of -i <file.pactia> or -w <workspace-dir>\n");
    process.exit(1);
    return;
  }

  const outputDir = resolve(args.output);
  const result = args.workspace
    ? compileWorkspace(resolve(args.workspace))
    : (() => {
        const inputPath = resolve(args.input!);
        return compile(readFileSync(inputPath, "utf8"), workspaceRootForInput(inputPath));
      })();

  writeOutput(result, outputDir);

  if (args.provenance) {
    const provenancePath = resolve(args.provenance);
    mkdirSync(dirname(provenancePath), { recursive: true });
    const payload = {
      diagnostics: result.diagnostics.map((d) => ({
        provenance: d.provenance,
        target: d.target,
        message: d.message,
      })),
    };
    writeFileSync(provenancePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    process.stdout.write(`wrote provenance report ${args.provenance}\n`);
  }

  printProvenanceSummary(result.diagnostics);
  if (args.report) printNotDerivable(result.diagnostics);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "compile") {
    runCompile(args);
    return;
  }

  process.stderr.write(
    "Usage:\n  pactiac compile (-i <file.pactia> | -w <workspace-dir>) -o <output-dir> [--report]\n",
  );
  process.exit(1);
}

main();

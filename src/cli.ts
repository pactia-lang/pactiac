#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compile, compileWorkspace, workspaceRootForInput } from "./compile/compile.js";
import type { CompileResult } from "./compile/compile.js";
import { Provenance } from "./domain/provenance.js";
import {
  SerializationFormat,
  parseSerializationFormat,
} from "./domain/serialization-format.js";
import { emitYaml } from "./adapters/yaml-emitter.js";

interface CliArgs {
  readonly command: string;
  readonly input: string | undefined;
  readonly workspace: string | undefined;
  readonly output: string | undefined;
  readonly report: boolean;
  readonly provenance: string | undefined;
  readonly stopAfter: string | undefined;
  readonly format: SerializationFormat;
}

function parseArgs(argv: string[]): CliArgs {
  const [command = "", ...optionArgs] = argv;

  let input: string | undefined;
  let workspace: string | undefined;
  let output: string | undefined;
  let report = false;
  let provenance: string | undefined;
  let stopAfter: string | undefined;
  let format = SerializationFormat.Yaml;
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
    } else if ((arg === "--provenance" && optionArgs[i + 1]) || (arg === "-p" && optionArgs[i + 1])) {
      provenance = optionArgs[i + 1];
      i += 1;
    } else if (arg === "--stop-after" && optionArgs[i + 1]) {
      stopAfter = optionArgs[i + 1];
      i += 1;
    } else if ((arg === "--format" || arg === "-f") && optionArgs[i + 1]) {
      const formatValue = optionArgs[i + 1];
      if (formatValue !== undefined) {
        format = parseSerializationFormat(formatValue) ?? SerializationFormat.Yaml;
        i += 1;
      }
    } else if (arg === "--json") {
      format = SerializationFormat.Json;
    } else if (arg === "--report") {
      report = true;
    }
  }
  return { command, input, workspace, output, report, provenance, stopAfter, format };
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

function serializeContent(
  content: string,
  format: SerializationFormat,
): string {
  if (format === SerializationFormat.Yaml) {
    const parsed = JSON.parse(content) as unknown;
    return emitYaml(parsed);
  }
  return content;
}

function writeOutput(
  result: CompileResult,
  outputDir: string,
  format: SerializationFormat,
): void {
  const ext = format === SerializationFormat.Yaml ? ".yaml" : ".json";
  for (const [relPath, content] of result.files) {
    const outPath = relPath.replace(/\.json$/, ext);
    const fullPath = join(outputDir, outPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    const serialized = serializeContent(content, format);
    writeFileSync(fullPath, serialized, "utf8");
    process.stdout.write(`wrote ${outPath}\n`);
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

  writeOutput(result, outputDir, args.format);

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
    const serialized =
      args.format === SerializationFormat.Yaml
        ? emitYaml(payload)
        : `${JSON.stringify(payload, null, 2)}\n`;
    writeFileSync(provenancePath, serialized, "utf8");
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
    "Usage:\n  pactiac compile (-i <file> | -w <dir>) -o <output-dir> [--format json|yaml] [--json] [--report] [--provenance <path>] [--stop-after <phase>]\n\nDefault output format is YAML. Use --json for JSON output.\n",
  );
  process.exit(1);
}

main();

#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compile } from "./compile.js";
import { Provenance } from "./diagnostics.js";

interface CliArgs {
  readonly command: string;
  readonly input: string | undefined;
  readonly output: string | undefined;
  readonly report: boolean;
  /** Path to write the machine-readable provenance report (consumed by bsc conform). */
  readonly provenance: string | undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const [command = "", ...rest] = argv;
  let input: string | undefined;
  let output: string | undefined;
  let report = false;
  let provenance: string | undefined;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if ((arg === "-i" || arg === "--input") && rest[i + 1]) {
      input = rest[i + 1];
      i += 1;
    } else if ((arg === "-o" || arg === "--output") && rest[i + 1]) {
      output = rest[i + 1];
      i += 1;
    } else if (arg === "--provenance" && rest[i + 1]) {
      provenance = rest[i + 1];
      i += 1;
    } else if (arg === "--report") {
      report = true;
    }
  }
  return { command, input, output, report, provenance };
}

function printProvenanceSummary(diagnostics: ReturnType<typeof compile>["diagnostics"]): void {
  const counts = new Map<Provenance, number>();
  for (const d of diagnostics) counts.set(d.provenance, (counts.get(d.provenance) ?? 0) + 1);
  process.stdout.write("\nProvenance summary:\n");
  for (const provenance of Object.values(Provenance)) {
    process.stdout.write(`  ${provenance.padEnd(14)} ${counts.get(provenance) ?? 0}\n`);
  }
}

function printNotDerivable(diagnostics: ReturnType<typeof compile>["diagnostics"]): void {
  const gaps = diagnostics.filter((d) => d.provenance === Provenance.NOT_DERIVABLE);
  if (gaps.length === 0) return;
  process.stdout.write("\nNOT_DERIVABLE (invented by any hand-authored golden):\n");
  for (const gap of gaps) {
    process.stdout.write(`  - ${gap.target}: ${gap.message}\n`);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.command !== "compile") {
    process.stderr.write("Usage: pactiac compile -i <file.pactia> -o <output-dir> [--report]\n");
    process.exit(1);
    return;
  }
  if (!args.input || !args.output) {
    process.stderr.write("Error: both -i <file.pactia> and -o <output-dir> are required\n");
    process.exit(1);
    return;
  }

  const inputPath = resolve(args.input);
  const outputDir = resolve(args.output);
  const source = readFileSync(inputPath, "utf8");

  const result = compile(source);

  for (const [relPath, content] of result.files) {
    const fullPath = join(outputDir, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf8");
    process.stdout.write(`wrote ${relPath}\n`);
  }

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

main();

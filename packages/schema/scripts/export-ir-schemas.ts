import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { irJsonSchemaExporters, type IrJsonSchemaName } from "../src/json-schema.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pactiacRoot = resolve(scriptDir, "../../..");
const specRoot = process.env.PACTIA_SPEC_ROOT ?? resolve(pactiacRoot, "..", "spec");
const outputDir = join(specRoot, "schemas/ir");

const schemaFiles: ReadonlyArray<{ name: IrJsonSchemaName; filename: string }> = [
  { name: "manifest", filename: "manifest.schema.json" },
  { name: "product", filename: "product.schema.json" },
  { name: "module", filename: "module-slice.schema.json" },
  { name: "model", filename: "model-slice.schema.json" },
  { name: "service", filename: "service-slice.schema.json" },
  { name: "workspace", filename: "ir-workspace.schema.json" },
];

mkdirSync(outputDir, { recursive: true });

for (const { name, filename } of schemaFiles) {
  const schema = irJsonSchemaExporters[name]();
  writeFileSync(join(outputDir, filename), `${JSON.stringify(schema, null, 2)}\n`, "utf-8");
}

console.log(`Wrote ${schemaFiles.length} IR JSON Schema files to ${outputDir}`);

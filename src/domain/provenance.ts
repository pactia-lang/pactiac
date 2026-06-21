/** IR fact provenance labels — not tag names; attached by lowering when a slot is written. */
export enum Provenance {
  Pactia = "Pactia",
  Inferred = "INFERRED",
  Package = "PACKAGE",
  Macro = "MACRO",
  Define = "DEFINE",
  YamlEmbed = "YAML_EMBED",
  Guidance = "GUIDANCE",
  Generated = "GENERATED",
  NotDerivable = "NOT_DERIVABLE",
}

export const provenanceValues = Object.values(Provenance);

export enum ScenarioProvenance {
  Pactia = "Pactia",
}

export enum ScenarioOwnership {
  Owner = "owner",
  NonOwner = "non-owner",
}

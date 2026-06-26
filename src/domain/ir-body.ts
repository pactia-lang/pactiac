/** Ordered lowering stream within each IR slice — preserves source sequence. */
export enum IrBodySlot {
  BodyArray = "body[]",
}

/** Structural context attachments on each IR slice (language keyword — not registry tags). */
export enum IrContextSlot {
  ContextArray = "context",
}

/** Language-level `body[]` entry kinds — not registry `@tag` symbols. */
export enum IrBodyKind {
  Prose = "prose",
}

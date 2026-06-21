/** Tag lowering merge strategy — spec/docs/compilation.md#tag-lowering. */
export enum IrMerge {
  AppendHost = "append_host",
  MergeIntoHost = "merge_into_host",
  MergeFields = "merge_fields",
  FieldAnnotation = "field_annotation",
}

export const irMergeValues: readonly IrMerge[] = Object.values(IrMerge) as IrMerge[];

export function parseIrMerge(value: string): IrMerge | undefined {
  return irMergeValues.find((merge) => merge === value);
}

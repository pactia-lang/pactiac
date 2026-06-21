import { PlacementTarget } from "./placement.js";

/** IR file kind selected by enclosing Pactia block scope. */
export enum IrFile {
  Product = "product",
  Module = "module",
  Model = "model",
  Service = "service",
}

export const irFileValues: readonly IrFile[] = Object.values(IrFile) as IrFile[];

export function parseIrFile(value: string): IrFile | undefined {
  return irFileValues.find((file) => file === value);
}

/** Map enclosing block placement to the IR file that receives lowered tags. */
export function irFileForPlacement(placement: PlacementTarget): IrFile | undefined {
  switch (placement) {
    case PlacementTarget.Product:
      return IrFile.Product;
    case PlacementTarget.Module:
      return IrFile.Module;
    case PlacementTarget.Model:
    case PlacementTarget.Field:
      return IrFile.Model;
    case PlacementTarget.Service:
      return IrFile.Service;
    default: {
      const _exhaustive: never = placement;
      return _exhaustive;
    }
  }
}

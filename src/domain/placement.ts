/** Registry `in` placement targets — spec/docs/registry.md. */
export enum PlacementTarget {
  Product = "product",
  Module = "module",
  Model = "model",
  Service = "service",
  Field = "field",
}

export const placementTargetValues: readonly PlacementTarget[] = Object.values(
  PlacementTarget,
) as PlacementTarget[];

/** All placement targets — used when local `def` omits `in`. */
export const allPlacementTargets: readonly PlacementTarget[] = placementTargetValues;

export function placementAllows(
  allowed: readonly PlacementTarget[],
  site: PlacementTarget,
): boolean {
  return allowed.includes(site);
}

export function parsePlacementTarget(value: string): PlacementTarget | undefined {
  return placementTargetValues.find((target) => target === value);
}

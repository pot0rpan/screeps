export function getAllResourceAmounts(
  store: StoreDefinition
): Partial<Record<ResourceConstant, number>> {
  const amounts: Partial<Record<ResourceConstant, number>> = {};

  for (let resType in store) {
    if (store[resType as ResourceConstant] > 0)
      amounts[resType as ResourceConstant] = store[resType as ResourceConstant];
  }

  return amounts;
}

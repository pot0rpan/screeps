import config from 'config';

export function minToStoreOfResource(
  room: Room,
  resourceType: ResourceConstant,
  terminal = false
): number {
  if (resourceType === RESOURCE_ENERGY) {
    return terminal
      ? 0
      : config.MIN_ENERGY_STORAGE(room.controller?.level ?? 0);
  }
  return 0;
}

export function maxToStoreOfResource(
  room: Room,
  resourceType: ResourceConstant,
  terminal = false
): number {
  if (resourceType === RESOURCE_ENERGY) {
    return terminal
      ? 100000
      : config.MIN_ENERGY_STORAGE(room.controller?.level ?? 0);
  }
  return config.MAX_MINERAL_STORAGE;
}

export function isHighway(room: Room): boolean {
  const pattern = /\w(\d+)\w(\d+)/;
  const match = room.name.match(pattern);
  if (!match) return false;
  const [, y, x] = match;
  return parseInt(x) % 10 === 0 || parseInt(y) % 10 === 0;
}

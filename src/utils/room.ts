import config from 'config';

export function targetResourceAmount(
  room: Room,
  resourceType: ResourceConstant
): number {
  if (resourceType === RESOURCE_ENERGY) {
    return config.TARGET_ENERGY_STORAGE(room.controller?.level ?? 0);
  } else {
    return config.TARGET_MINERAL_STORAGE;
  }
}

export function isHighway(room: Room): boolean {
  const pattern = /\w(\d+)\w(\d+)/;
  const match = room.name.match(pattern);
  if (!match) return false;
  const [, y, x] = match;
  return parseInt(x) % 10 === 0 || parseInt(y) % 10 === 0;
}

export function isInColonyHelpRange(
  colonyRoom: string,
  targetRoom: string
): boolean {
  return (
    Game.map.getRoomLinearDistance(colonyRoom, targetRoom) <=
    config.COLONY_HELP_DISTANCE
  );
}

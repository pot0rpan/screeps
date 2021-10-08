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

export function isHighway(roomName: string): boolean {
  const pattern = /\w(\d+)\w(\d+)/;
  const match = roomName.match(pattern);
  if (!match) return false;
  return parseInt(match[1]) % 10 === 0 || parseInt(match[2]) % 10 === 0;
}

// Cached in heap
const colonyHelpRooms: { [key: string]: boolean } = {};
export function isInColonyHelpRange(
  colonyRoom: string,
  targetRoom: string
): boolean {
  const key = colonyRoom + targetRoom;

  if (colonyHelpRooms[key] === undefined) {
    colonyHelpRooms[key] =
      // In range
      Game.map.getRoomLinearDistance(colonyRoom, targetRoom) <=
        config.COLONY_HELP_DISTANCE &&
      // Valid path to it
      Game.map.findRoute(colonyRoom, targetRoom, {
        routeCallback: roomName =>
          Memory.rooms[roomName]?.avoid ? Infinity : 1,
      }) !== -2;
  }
  return colonyHelpRooms[key];
}

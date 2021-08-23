import config from 'config';

export function getAdjacentRoomNames(roomName: string): string[] {
  const [centerX, centerY] = roomNameToXY(roomName);
  const adjacentRooms: string[] = [];

  for (let x = centerX - 1; x <= centerX + 1; x++) {
    for (let y = centerY - 1; y <= centerY + 1; y++) {
      if (x === centerX && y === centerY) continue;
      adjacentRooms.push(getRoomNameFromXY(x, y));
    }
  }

  return adjacentRooms;
}

function getRoomNameFromXY(x: number, y: number): string {
  let _x, _y: string;

  if (x < 0) {
    _x = 'W' + (-x - 1);
  } else {
    _x = 'E' + x;
  }
  if (y < 0) {
    _y = 'N' + (-y - 1);
  } else {
    _y = 'S' + y;
  }
  return _x + _y;
}

function roomNameToXY(name: string): [number, number] {
  let xx = parseInt(name.substr(1), 10);
  let verticalPos = 2;
  if (xx >= 100) {
    verticalPos = 4;
  } else if (xx >= 10) {
    verticalPos = 3;
  }
  let yy = parseInt(name.substr(verticalPos + 1), 10);
  let horizontalDir = name.charAt(0);
  let verticalDir = name.charAt(verticalPos);
  if (horizontalDir === 'W' || horizontalDir === 'w') {
    xx = -xx - 1;
  }
  if (verticalDir === 'N' || verticalDir === 'n') {
    yy = -yy - 1;
  }
  return [xx, yy];
}

export function maxToStoreOfResource(
  room: Room,
  resourceType: ResourceConstant
): number {
  return resourceType === 'energy'
    ? config.MAX_ENERGY_STORAGE(room.controller?.level ?? 0)
    : config.MAX_MINERAL_STORAGE;
}

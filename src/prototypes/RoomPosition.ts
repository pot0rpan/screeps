import cacheInTick from 'utils/cacheInTick';
import { Traveler } from 'utils/Traveler';

declare global {
  interface RoomPosition {
    getAdjacentPositions(
      length?: number,
      ignoreCreeps?: boolean
    ): RoomPosition[];
    getAdjacentOrthogonalPositions(length?: number): RoomPosition[];
    getDiagonalPositions(length?: number): RoomPosition[];
    findClosestOpenSources(creep: Creep): Source[];
    isNearEdge(distance?: number): boolean;
    findClosestWalkableRampart(
      ignoreCreeps?: string[]
    ): StructureRampart | null;
    isDiagonalTo(pos: RoomPosition): boolean;
    getLinearRangeTo(pos: RoomPosition | _HasRoomPosition): number;
  }

  interface RoomMemory {
    _ramparts?: {
      ts: number;
      ramparts: {
        id: string;
        pos: { x: number; y: number };
        blockable: boolean;
      }[];
    };
  }
}

export default (() => {
  RoomPosition.prototype.getAdjacentPositions = function (
    length = 1,
    ignoreCreeps = true
  ) {
    return cacheInTick(
      `${this}_getAdjacentPositions_${length}_${ignoreCreeps}`,
      () => {
        const adjacentPositions: RoomPosition[] = [];

        const startX = Math.max(this.x - length, 1);
        const startY = Math.max(this.y - length, 1);

        for (let x = startX; x <= this.x + length && x < 49; x++) {
          for (let y = startY; y <= this.y + length && y < 49; y++) {
            if (x === this.x && y === this.y) continue;

            if (
              new Room.Terrain(this.roomName).get(x, y) !== TERRAIN_MASK_WALL
            ) {
              const pos = new RoomPosition(x, y, this.roomName);

              if (!ignoreCreeps && pos.lookFor(LOOK_CREEPS).length) {
                continue;
              }

              adjacentPositions.push(pos);
            }
          }
        }

        return adjacentPositions;
      }
    );
  };

  RoomPosition.prototype.getAdjacentOrthogonalPositions = function (
    length = 1
  ) {
    return cacheInTick(
      `${this}_getAdjacentOrthogonalPositions_${length}`,
      () => {
        const adjacentPositions = this.getAdjacentPositions(length);
        const positions: RoomPosition[] = [];

        for (const pos of adjacentPositions) {
          if (pos.x === this.x || pos.y === this.y) {
            positions.push(new RoomPosition(pos.x, pos.y, this.roomName));
          }
        }

        return positions;
      }
    );
  };

  RoomPosition.prototype.getDiagonalPositions = function (length = 1) {
    return cacheInTick(`${this}_getDiagonalPositions_${length}`, () =>
      this.getAdjacentPositions(length).filter(pos => this.isDiagonalTo(pos))
    );
  };

  RoomPosition.prototype.findClosestOpenSources = function (creep) {
    return Game.rooms[this.roomName]
      .findSources(true)
      .filter(
        source =>
          source.energy > 0 &&
          (creep.pos.getRangeTo(source) === 1 ||
            source.pos.getAdjacentPositions(1, false).length > 0)
      )
      .sort((a, b) => a.pos.getRangeTo(this) - b.pos.getRangeTo(this));
  };

  RoomPosition.prototype.isNearEdge = function isNearEdge(distance = 6) {
    return (
      this.x < distance ||
      this.x > 49 - distance ||
      this.y < distance ||
      this.y > 49 - distance
    );
  };

  RoomPosition.prototype.findClosestWalkableRampart = function (
    ignoreCreeps = []
  ) {
    const isRampartBlockable = (struct: Structure): boolean => {
      // Make sure it's a rampart
      if (struct.structureType !== STRUCTURE_RAMPART) return false;

      // Make sure rampart is the only structure here
      // or a road on the outer edge of bunker
      // baseCenter will only be defined in center colony rooms
      const structuresAtPos = struct.pos.lookFor(LOOK_STRUCTURES);
      const { baseCenter } = Memory.rooms[this.roomName];

      // If in main colony room, go to spots on outer edge of bunker
      if (baseCenter) {
        const centerPos = new RoomPosition(
          baseCenter.x,
          baseCenter.y,
          this.roomName
        );

        // Allow roads if bunker perimeter or farther
        // otherwise block roads in base center
        if (struct.pos.getRangeTo(centerPos) > 3) {
          if (
            structuresAtPos.filter(s => s.structureType !== STRUCTURE_ROAD)
              .length > 1
          ) {
            return false;
          }
        } else if (structuresAtPos.length > 1) {
          return false;
        }
      } else if (structuresAtPos.length > 1) {
        return false;
      }

      return true;
    };

    const roomMem = Memory.rooms[this.roomName];

    if (
      !roomMem._ramparts ||
      Game.time - roomMem._ramparts.ts > (roomMem.defcon ? 5 : 300)
    ) {
      roomMem._ramparts = {
        ts: Game.time,
        ramparts: Game.rooms[this.roomName]
          .find(FIND_MY_STRUCTURES, {
            filter: struct => struct.structureType === STRUCTURE_RAMPART,
          })
          .map(struct => ({
            id: struct.id,
            pos: {
              x: struct.pos.x,
              y: struct.pos.y,
            },
            blockable: isRampartBlockable(struct),
          })),
      };
    }

    // Get ramparts we can block
    const walkableRamparts = roomMem._ramparts.ramparts
      .filter(ramp => ramp.blockable)
      .sort(
        (a, b) =>
          this.getRangeTo(a.pos.x, a.pos.y) - this.getRangeTo(b.pos.x, b.pos.y)
      );

    for (const rampMem of walkableRamparts) {
      const rampart = Game.getObjectById(rampMem.id as Id<StructureRampart>);
      if (!rampart) continue;

      // Make sure no creeps there
      if (
        rampart.pos
          .lookFor(LOOK_CREEPS)
          .filter(crp => !ignoreCreeps.includes(crp.name)).length
      ) {
        continue;
      }

      return rampart;
    }

    return null;
  };

  RoomPosition.prototype.isDiagonalTo = function (pos) {
    return (
      Math.abs(pos.x - this.x) === Math.abs(pos.y - this.y) &&
      (pos.x !== this.x || pos.y !== this.y)
    );
  };

  RoomPosition.prototype.getLinearRangeTo = function (
    pos: RoomPosition | _HasRoomPosition
  ) {
    pos = Traveler.normalizePos(pos);

    return Math.sqrt(Math.pow(pos.x - this.x, 2) + Math.pow(pos.y - this.y, 2));
  };
})();

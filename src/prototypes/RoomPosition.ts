declare global {
  interface RoomPosition {
    getAdjacentPositions(
      length?: number,
      ignoreCreeps?: boolean
    ): RoomPosition[];
    _adjacentPositions: { [key: string]: RoomPosition[] };
    getAdjacentOrthogonalPositions(length?: number): RoomPosition[];
    _adjacentOrthogonalPositions: { [length: number]: RoomPosition[] };
    getDiagonalPositions(length?: number): RoomPosition[];
    _diagonalPositions: { [length: number]: RoomPosition[] };
    findClosestSource(creep: Creep): Source | null;
    isNearEdge(distance?: number): boolean;
    findClosestWalkableRampart(
      ignoreCreeps?: string[]
    ): StructureRampart | null;
    isDiagonalTo(pos: RoomPosition): boolean;
  }

  interface RoomMemory {
    _ramparts: {
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
    if (!this._adjacentPositions) {
      this._adjacentPositions = {};
    }

    const key = length + String(ignoreCreeps);

    if (!this._adjacentPositions[key]) {
      this._adjacentPositions[key] = [];

      const startX = Math.max(this.x - length, 1);
      const startY = Math.max(this.y - length, 1);

      for (let x = startX; x <= this.x + length && x < 49; x++) {
        for (let y = startY; y <= this.y + length && y < 49; y++) {
          if (x === this.x && y === this.y) continue;

          if (new Room.Terrain(this.roomName).get(x, y) !== TERRAIN_MASK_WALL) {
            const pos = new RoomPosition(x, y, this.roomName);

            if (!ignoreCreeps && pos.lookFor(LOOK_CREEPS).length) {
              continue;
            }

            this._adjacentPositions[key].push(pos);
          }
        }
      }
    }

    return this._adjacentPositions[key];
  };

  RoomPosition.prototype.getAdjacentOrthogonalPositions = function (
    length = 1
  ) {
    if (!this._adjacentOrthogonalPositions) {
      this._adjacentOrthogonalPositions = [];
    }

    if (!this._adjacentOrthogonalPositions[length]) {
      this._adjacentOrthogonalPositions[length] = [];
      const adjacentPositions = this.getAdjacentPositions(length);

      for (const pos of adjacentPositions) {
        if (pos.x === this.x || pos.y === this.y) {
          this._adjacentOrthogonalPositions[length].push(
            new RoomPosition(pos.x, pos.y, this.roomName)
          );
        }
      }
    }
    return this._adjacentOrthogonalPositions[length];
  };

  RoomPosition.prototype.getDiagonalPositions = function (length = 1) {
    if (!this._diagonalPositions) {
      this._diagonalPositions = [];
    }

    if (!this._diagonalPositions[length]) {
      this._diagonalPositions[length] = [];
      const adjacentPositions = this.getAdjacentPositions(length);

      for (const pos of adjacentPositions) {
        if (this.isDiagonalTo(pos)) {
          this._diagonalPositions[length].push(
            new RoomPosition(pos.x, pos.y, this.roomName)
          );
        }
      }
    }

    return this._diagonalPositions[length];
  };

  RoomPosition.prototype.findClosestSource = function (creep) {
    return this.findClosestByRange(FIND_SOURCES, {
      filter: source =>
        source.energy > 0 &&
        (creep.pos.getRangeTo(source) === 1 ||
          source.pos.getAdjacentPositions(1, false).length > 0),
    });
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

        // Only check for other structures (roads) if not bunker perimeter
        if (
          struct.pos.getRangeTo(centerPos) !== 5 &&
          structuresAtPos.length > 1
        ) {
          return false;
        }
      } else if (structuresAtPos.length > 1) {
        return false;
      }

      // No construction sites
      if (struct.pos.lookFor(LOOK_CONSTRUCTION_SITES).length) {
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
})();

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
    findClosestWalkableRampart(): StructureRampart | null;
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
        if (
          Math.abs(pos.x - this.x) === Math.abs(pos.y - this.y) &&
          (pos.x !== this.x || pos.y !== this.y)
        ) {
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

  RoomPosition.prototype.findClosestWalkableRampart = function () {
    return this.findClosestByPath<StructureRampart>(FIND_MY_STRUCTURES, {
      filter: struct => {
        if (struct.structureType !== STRUCTURE_RAMPART) return false;

        if (
          struct.pos
            .lookFor(LOOK_STRUCTURES)
            .filter(s => s.structureType !== STRUCTURE_RAMPART).length
        ) {
          return false;
        }

        if (
          (struct.pos.x !== this.x || struct.pos.y !== this.y) &&
          struct.pos.lookFor(LOOK_CREEPS).length
        ) {
          return false;
        }

        return true;
      },
    });
  };
})();

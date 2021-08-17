import { isFriendlyOwner } from 'utils';
import { spawnTime } from 'utils/creep';

declare global {
  interface Creep {
    isDying(): boolean;
    _isDying: boolean;
    isFull(): boolean;
    isEmpty(): boolean;
    isHostile(): boolean;
    moveAway(target: _HasRoomPosition): CreepMoveReturnCode;
  }
}

export default (() => {
  // Cache for current tick
  Creep.prototype.isDying = function () {
    if (typeof this._isDying !== 'boolean') {
      this._isDying = this.spawning
        ? false
        : (this.ticksToLive as number) < spawnTime(this.body.length);
    }
    return this._isDying;
  };

  Creep.prototype.isFull = function () {
    return this.store.getFreeCapacity() === 0;
  };

  Creep.prototype.isEmpty = function () {
    return this.store.getUsedCapacity() === 0;
  };

  Creep.prototype.isHostile = function () {
    // Check owner and any potentially threatening body parts
    return (
      !isFriendlyOwner(this.owner.username) &&
      (!!this.getActiveBodyparts(ATTACK) ||
        !!this.getActiveBodyparts(RANGED_ATTACK) ||
        !!this.getActiveBodyparts(HEAL) ||
        !!this.getActiveBodyparts(WORK) ||
        !!this.getActiveBodyparts(CLAIM))
    );
  };

  Creep.prototype.moveAway = function (target) {
    function reverseDirection(direction: DirectionConstant) {
      const directions = [
        TOP,
        TOP_RIGHT,
        RIGHT,
        BOTTOM_RIGHT,
        TOP_LEFT,
        LEFT,
        BOTTOM_LEFT,
        BOTTOM,
      ];

      return directions[directions.length - directions.indexOf(direction) - 1];
    }

    return this.move(reverseDirection(this.pos.getDirectionTo(target)));
  };
})();

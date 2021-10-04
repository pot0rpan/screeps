import { isFriendlyOwner } from 'utils';
import cacheInTick from 'utils/cacheInTick';
import { spawnTime } from 'utils/creep';
import { reverseDirection } from 'utils/position';

declare global {
  interface Creep {
    isDying(): boolean;
    isFull(): boolean;
    isEmpty(): boolean;
    isHostile(): boolean;
    isDangerous(): boolean;
    moveAway(target: _HasRoomPosition): CreepMoveReturnCode;
    hasRoomForResource(resource: ResourceConstant): boolean;
    getCarryingResources(): ResourceConstant[];
  }
}

export default (() => {
  Creep.prototype.isDying = function () {
    return cacheInTick(
      `${this.name}_dying`,
      () => (this.ticksToLive ?? Infinity) < spawnTime(this.body.length)
    );
  };

  Creep.prototype.isFull = function () {
    return this.store.getFreeCapacity() === 0;
  };

  Creep.prototype.isEmpty = function () {
    return this.store.getUsedCapacity() === 0;
  };

  Creep.prototype.isHostile = function () {
    // Check owner and any potentially threatening body parts
    return cacheInTick(
      `${this.name}_isHostile`,
      () =>
        !isFriendlyOwner(this.owner.username) &&
        (!!this.getActiveBodyparts(ATTACK) ||
          !!this.getActiveBodyparts(RANGED_ATTACK) ||
          !!this.getActiveBodyparts(HEAL) ||
          !!this.getActiveBodyparts(WORK) ||
          !!this.getActiveBodyparts(CLAIM))
    );
  };

  Creep.prototype.isDangerous = function () {
    return (
      !!this.getActiveBodyparts(ATTACK) ||
      !!this.getActiveBodyparts(RANGED_ATTACK) ||
      !!this.getActiveBodyparts(HEAL)
    );
  };

  Creep.prototype.moveAway = function (target) {
    return this.move(reverseDirection(this.pos.getDirectionTo(target)));
  };

  Creep.prototype.hasRoomForResource = function (resource) {
    return !!this.store.getFreeCapacity(resource);
  };

  Creep.prototype.getCarryingResources = function () {
    const resources: ResourceConstant[] = [];

    for (const resType in this.store) {
      if (this.store.getUsedCapacity(resType as ResourceConstant)) {
        resources.push(resType as ResourceConstant);
      }
    }

    return resources;
  };
})();

import { spawnTime } from 'utils/creep';

declare global {
  interface Creep {
    isDying(): boolean;
    _isDying: boolean;
    isFull(): boolean;
    isEmpty(): boolean;
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
})();

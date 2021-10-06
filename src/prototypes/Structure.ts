export default (() => {
  /**
   * Posted 24 February 2018 by @tigga
   * With some modifications done
   */
  const isActive = OwnedStructure.prototype.isActive;
  OwnedStructure.prototype.isActive = function () {
    if (
      this.room.memory &&
      this.room.memory._maxRcl &&
      this.room.memory._maxRcl == (this.room.controller?.level || 0)
    ) {
      return true;
    }

    return isActive.call(this);
  };
})();

declare global {
  interface Source {
    findContainer(): StructureContainer | undefined;
    findLink(): StructureLink | undefined;
  }
}

export default (() => {
  Source.prototype.findContainer = function () {
    return this.pos
      .findInRange<StructureContainer>(FIND_STRUCTURES, 2)
      .find(struct => struct.structureType === STRUCTURE_CONTAINER);
  };

  Source.prototype.findLink = function () {
    return this.pos
      .findInRange<StructureLink>(FIND_STRUCTURES, 1)
      .find(struct => struct.structureType === STRUCTURE_LINK);
  };
})();

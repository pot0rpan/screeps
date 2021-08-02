declare global {
  interface Room {
    findSpawns(): StructureSpawn[];
    findSources(): Source[];
    _sources: Source[];
    findSourceContainers(): StructureContainer[];
    _sourceContainers: StructureContainer[];
    findUpgradeContainers(): StructureContainer[];
    _upgradeContainers: StructureContainer[];
    numSources(): number;
    findConstructionSites(
      type?: BuildableStructureConstant | 'all'
    ): ConstructionSite<BuildableStructureConstant>[];
    _constructionSites: {
      [key in
        | BuildableStructureConstant
        | 'all']?: ConstructionSite<BuildableStructureConstant>[];
    };
  }

  interface RoomMemory {
    _sourceIds?: Id<Source>[];
  }
}

export default (() => {
  Room.prototype.findSpawns = function () {
    return this.find(FIND_MY_SPAWNS);
  };

  Room.prototype.numSources = function () {
    return this.findSources().length;
  };

  // Cached in Memory
  Room.prototype.findSources = function () {
    if (!this._sources) {
      // If we dont have the value stored in memory
      if (!this.memory._sourceIds) {
        // Find the sources and store their id's in memory
        this.memory._sourceIds = this.find(FIND_SOURCES).map(
          source => source.id
        );
      }
      // Get the source objects from the id's in memory and store them locally
      this._sources = this.memory._sourceIds
        .map(id => Game.getObjectById<Source>(id))
        .filter((source): source is Source => !!source);
    }

    // Return the locally stored value,
    // but filter out dangerous sources
    return this._sources.filter(
      source => !source.pos.findInRange(FIND_HOSTILE_CREEPS, 1).length
    );
  };

  // Cached for tick
  Room.prototype.findSourceContainers = function () {
    if (!this._sourceContainers) {
      const sources = this.findSources();
      const sourceContainers: StructureContainer[] = [];

      for (const source of sources) {
        const containers = source.pos.findInRange<StructureContainer>(
          FIND_STRUCTURES,
          1,
          {
            filter: struct => struct.structureType === STRUCTURE_CONTAINER
          }
        );

        if (containers) {
          for (const container of containers) {
            sourceContainers.push(container as StructureContainer);
          }
        }
      }

      this._sourceContainers = sourceContainers;
    }

    return this._sourceContainers;
  };

  Room.prototype.findUpgradeContainers = function () {
    if (!this._upgradeContainers) {
      this._upgradeContainers = [];
      const controller = this.controller;
      if (controller) {
        this._upgradeContainers =
          controller.pos.findInRange<StructureContainer>(FIND_STRUCTURES, 1, {
            filter: struct => struct.structureType === STRUCTURE_CONTAINER
          });
      }
    }
    return this._upgradeContainers;
  };

  // Cache for tick
  Room.prototype.findConstructionSites = function (type = 'all') {
    if (!this._constructionSites) {
      this._constructionSites = {};
    }

    if (!this._constructionSites[type]) {
      // Just filter from all if all is cached
      if (this._constructionSites.all) {
        this._constructionSites[type] = this._constructionSites.all.filter(
          site => site.structureType === type
        );
      } else {
        // Fetch all and save both all and filtered
        this._constructionSites.all = this.find(FIND_CONSTRUCTION_SITES);
        if (type !== 'all') {
          this._constructionSites[type] = this._constructionSites.all.filter(
            site => site.structureType === type
          );
        }
      }
    }

    // Cast since typescript doesn't know it's now defined
    return this._constructionSites[
      type
    ] as ConstructionSite<BuildableStructureConstant>[];
  };
})();

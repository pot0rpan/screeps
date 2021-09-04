import { isNthTick } from 'utils';

declare global {
  interface Room {
    findSpawns(): StructureSpawn[];
    findSources(avoidHostiles?: boolean): Source[];
    _sources: Source[];
    findSourceContainers(): StructureContainer[];
    _sourceContainers: StructureContainer[];
    findSourceLink(source: Source): StructureLink | undefined;
    _sourceLinks: { [source: string]: StructureLink };
    findUpgradeLinks(): StructureLink[];
    _upgradeLinks: StructureLink[];
    findCenterLinks(): StructureLink[];
    _centerLinks: StructureLink[];
    findUpgradeContainers(): StructureContainer[];
    _upgradeContainers: StructureContainer[];
    numSources(avoidHostiles?: boolean): number;
    findConstructionSites(
      type?: BuildableStructureConstant | 'all'
    ): ConstructionSite<BuildableStructureConstant>[];
    _constructionSites: {
      [key in
        | BuildableStructureConstant
        | 'all']?: ConstructionSite<BuildableStructureConstant>[];
    };
    findTowers(): StructureTower[];
    _towers: StructureTower[];
    findHostiles(): Creep[];
    _hostiles: Creep[];
    findDangerousHostiles(): Creep[];
    _dangerousHostiles: Creep[];
    findExtensions(): StructureExtension[];
    _extensions?: StructureExtension[];
  }

  interface RoomMemory {
    _sourceIds?: Id<Source>[];
    _towerIds?: Id<StructureTower>[];
    _hostileIds?: Id<Creep>[];
    _extensions?: Id<StructureExtension>[];
    _extensionsTs?: number;
  }
}

export default (() => {
  Room.prototype.findSpawns = function () {
    return this.find(FIND_MY_SPAWNS);
  };

  Room.prototype.numSources = function (avoidHostiles = true) {
    return this.findSources(avoidHostiles).length;
  };

  // Cached in Memory
  Room.prototype.findSources = function (avoidHostiles = true) {
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

    if (avoidHostiles) {
      return this._sources.filter(
        source => !source.pos.findInRange(FIND_HOSTILE_CREEPS, 1).length
      );
    }

    return this._sources;
  };

  // Cached for tick
  Room.prototype.findSourceContainers = function () {
    if (!this._sourceContainers) {
      const sources = this.findSources();
      const sourceContainers: StructureContainer[] = [];

      for (const source of sources) {
        const containers = source.pos.findInRange<StructureContainer>(
          FIND_STRUCTURES,
          2,
          {
            filter: struct => struct.structureType === STRUCTURE_CONTAINER,
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

  // Cached for tick
  Room.prototype.findSourceLink = function (source: Source) {
    if ((this.controller?.level ?? 0) < 5) return;

    if (!this._sourceLinks) {
      this._sourceLinks = {};
    }
    if (!this._sourceLinks[source.id]) {
      this._sourceLinks[source.id] = source.pos.findInRange<StructureLink>(
        FIND_STRUCTURES,
        1,
        { filter: struct => struct.structureType === STRUCTURE_LINK }
      )[0];
    }

    return this._sourceLinks[source.id];
  };

  // Cached for tick
  Room.prototype.findUpgradeLinks = function () {
    if (!this.controller) return [];

    if (!this._upgradeLinks) {
      this._upgradeLinks = this.controller.pos.findInRange<StructureLink>(
        FIND_STRUCTURES,
        1,
        {
          filter: struct =>
            struct.structureType === STRUCTURE_LINK && struct.isActive(),
        }
      );
    }

    return this._upgradeLinks;
  };

  // Cached for tick
  Room.prototype.findCenterLinks = function () {
    if (!this._centerLinks) {
      if (!this.memory.baseCenter) return [];

      const links = new RoomPosition(
        this.memory.baseCenter.x,
        this.memory.baseCenter.y,
        this.name
      ).findInRange<StructureLink>(FIND_MY_STRUCTURES, 2, {
        filter: struct =>
          struct.structureType === STRUCTURE_LINK && struct.isActive(),
      });

      this._centerLinks = links;
    }

    return this._centerLinks;
  };

  Room.prototype.findUpgradeContainers = function () {
    if (!this._upgradeContainers) {
      this._upgradeContainers = [];
      const controller = this.controller;
      if (controller) {
        this._upgradeContainers =
          controller.pos.findInRange<StructureContainer>(FIND_STRUCTURES, 2, {
            filter: struct => struct.structureType === STRUCTURE_CONTAINER,
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

  // Cached in Memory, occasionally rescanned
  Room.prototype.findTowers = function () {
    if (!this._towers) {
      // If we dont have the value stored in memory,
      // or enough time passed to rescan
      if (!this.memory._towerIds || isNthTick(40)) {
        // Find the towers and store their id's in memory
        this.memory._towerIds = this.find<StructureTower>(FIND_STRUCTURES, {
          filter: struct =>
            struct.structureType === STRUCTURE_TOWER && struct.isActive(),
        }).map(tower => tower.id);
      }

      // Get the tower objects from the id's in memory and store them locally
      this._towers = this.memory._towerIds
        .map(id => Game.getObjectById<StructureTower>(id))
        .filter((tower): tower is StructureTower => !!tower);
    }

    // Return the locally stored value
    return this._towers;
  };

  // Cached for tick
  Room.prototype.findHostiles = function () {
    if (!this._hostiles) {
      this._hostiles = this.find(FIND_HOSTILE_CREEPS, {
        filter: creep => creep.isHostile(),
      });
    }

    // Return the locally stored value
    return this._hostiles;
  };

  // Cached for tick
  Room.prototype.findDangerousHostiles = function () {
    if (!this._dangerousHostiles) {
      this._dangerousHostiles = this.findHostiles().filter(hostile =>
        hostile.isDangerous()
      );
    }

    return this._dangerousHostiles;
  };

  Room.prototype.findExtensions = function () {
    // Populate cache of IDs if not already in room memory or stale
    if (
      !this.memory._extensions?.length ||
      !this.memory._extensionsTs ||
      Game.time - this.memory._extensionsTs > 50
    ) {
      const plans =
        global.empire.colonies[this.name].roomPlanner.plans.extension ?? [];

      // Wait for room planner to plan them (probably was global reset this tick)
      if (!plans.length) return [];

      this.memory._extensions = [];
      this.memory._extensionsTs = Game.time;

      for (const plan of plans) {
        const ext = plan.pos
          .lookFor(LOOK_STRUCTURES)
          .filter(
            struct =>
              struct.structureType === STRUCTURE_EXTENSION && struct.isActive()
          )[0] as StructureExtension | undefined;

        if (ext) {
          this.memory._extensions.push(ext.id);
        }
      }
    }

    // Read from IDs memory and map to game objects, cache for this tick
    if (!this._extensions) {
      this._extensions = [];
      for (const id of this.memory._extensions) {
        const ext = Game.getObjectById(id);
        if (ext) {
          this._extensions.push(ext);
        }
      }
    }

    return this._extensions;
  };
})();

import cacheInTick from 'utils/cacheInTick';
import { isActive } from 'utils/structure';

declare global {
  interface Room {
    findSpawns(): StructureSpawn[];
    findSources(avoidHostiles?: boolean): Source[];
    findSourceContainers(): StructureContainer[];
    findUpgradeLinks(): StructureLink[];
    findCenterLinks(): StructureLink[];
    findUpgradeContainers(): StructureContainer[];
    numSources(avoidHostiles?: boolean): number;
    findConstructionSites(): ConstructionSite<BuildableStructureConstant>[];
    findTowers(): StructureTower[];
    findHostiles(): Creep[];
    findDangerousHostiles(): Creep[];
    findExtensions(): StructureExtension[];
  }

  interface RoomMemory {
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

  //! Caching breaks this for some reason, can't figure out why
  Room.prototype.findSources = function (avoidHostiles = true) {
    // return cacheInTick(`${this.name}_findSources_${avoidHostiles}`, () => {
    return this.find(FIND_SOURCES).filter(
      source =>
        !avoidHostiles ||
        !source.pos
          .findInRange(FIND_HOSTILE_CREEPS, 3)
          .find(creep => creep.isDangerous())
    );
    // });
  };

  Room.prototype.findSourceContainers = function () {
    return cacheInTick(`${this.name}_findSourceContainers`, () => {
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

        if (containers.length) {
          for (const container of containers) {
            sourceContainers.push(container as StructureContainer);
          }
        }
      }

      return sourceContainers;
    });
  };

  Room.prototype.findUpgradeLinks = function () {
    return cacheInTick(`${this.name}_findUpgradeLinks`, () => {
      if (!this.controller) return [];

      return this.controller.pos.findInRange<StructureLink>(
        FIND_STRUCTURES,
        1,
        {
          filter: struct =>
            struct.structureType === STRUCTURE_LINK && isActive(struct),
        }
      );
    });
  };

  Room.prototype.findCenterLinks = function () {
    return cacheInTick(`${this.name}_findCenterLinks`, () => {
      if (!this.memory.baseCenter) return [];

      return new RoomPosition(
        this.memory.baseCenter.x,
        this.memory.baseCenter.y,
        this.name
      ).findInRange<StructureLink>(FIND_MY_STRUCTURES, 1, {
        filter: struct =>
          struct.structureType === STRUCTURE_LINK && isActive(struct),
      });
    });
  };

  Room.prototype.findUpgradeContainers = function () {
    return cacheInTick(`${this.name}_findUpgradeContainers`, () => {
      if (!this.controller) return [];

      return this.controller.pos.findInRange<StructureContainer>(
        FIND_STRUCTURES,
        2,
        {
          filter: struct => struct.structureType === STRUCTURE_CONTAINER,
        }
      );
    });
  };

  Room.prototype.findConstructionSites = function () {
    return cacheInTick(`${this.name}_findConstructionSites`, () => {
      return this.find(FIND_CONSTRUCTION_SITES);
    });
  };

  Room.prototype.findTowers = function () {
    return cacheInTick(`${this.name}_findTowers`, () =>
      this.find<StructureTower>(FIND_STRUCTURES, {
        filter: struct =>
          struct.structureType === STRUCTURE_TOWER && isActive(struct),
      })
    );
  };

  Room.prototype.findHostiles = function () {
    return cacheInTick(`${this.name}_findHostiles`, () =>
      this.find(FIND_HOSTILE_CREEPS, {
        filter: creep => creep.isHostile(),
      })
    );
  };

  Room.prototype.findDangerousHostiles = function () {
    return cacheInTick(`${this.name}_findDangerousHosiles`, () =>
      this.findHostiles().filter(hostile => hostile.isDangerous())
    );
  };

  Room.prototype.findExtensions = function () {
    return cacheInTick(`${this.name}_findExtensions`, () => {
      // Populate cache of IDs if not already in room memory or stale
      if (
        !this.memory._extensions?.length ||
        !this.memory._extensionsTs ||
        Game.time - this.memory._extensionsTs > 50
      ) {
        const plans =
          global.empire.colonies[this.name]?.roomPlanner.plans.extension ?? [];

        // Wait for room planner to plan them (probably was global reset this tick)
        if (!plans.length) return [];

        this.memory._extensions = [];
        this.memory._extensionsTs = Game.time;

        for (const plan of plans) {
          const ext = plan.pos
            .lookFor(LOOK_STRUCTURES)
            .find(
              struct =>
                struct.structureType === STRUCTURE_EXTENSION && isActive(struct)
            ) as StructureExtension | undefined;

          if (ext) {
            this.memory._extensions.push(ext.id);
          }
        }
      }

      // Read from IDs memory and map to game objects
      const extensions = [];
      for (const id of this.memory._extensions) {
        const ext = Game.getObjectById(id);
        if (ext) {
          extensions.push(ext);
        }
      }

      return extensions;
    });
  };
})();

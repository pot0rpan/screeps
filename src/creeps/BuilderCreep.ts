import { isDamaged } from 'utils/structure';
import { minToStoreOfResource } from 'utils/room';
import { recycle } from 'actions/recycle';
import { excuse } from 'actions/excuse';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface BuilderTask extends CreepTask {
  type: 'build' | 'repair' | 'withdraw' | 'harvest';
}

export class BuilderCreep extends CreepBase {
  role: CreepRole = 'builder';
  bodyOpts: BodySettings = {
    pattern: [WORK, CARRY, MOVE],
    suffix: [MOVE],
    sizeLimit: 8,
  };

  taskPriority = 5;

  // Only if construction sites exist
  // Or no towers and repairs needed
  targetNum(room: Room): number {
    // If we're high rcl and low storage, building can wait
    if (
      room.storage &&
      room.storage.isActive() &&
      room.storage.store.getUsedCapacity(RESOURCE_ENERGY) <
        minToStoreOfResource(room, RESOURCE_ENERGY)
    ) {
      return 0;
    }

    const rcl = room.controller?.level ?? 0;
    const sites = room.findConstructionSites();

    if (sites.length) {
      // // If only rampart/wall construction sites, only spawn 1
      // if (
      //   !sites.find(
      //     site =>
      //       site.structureType !== STRUCTURE_RAMPART &&
      //       site.structureType !== STRUCTURE_WALL
      //   )
      // ) {
      //   return 1;
      // }

      return Math.min(sites.length * 2, rcl > 3 ? 2 : 4);
    }

    if (room.find(FIND_STRUCTURES).find(struct => isDamaged(struct))) {
      return room.memory.defcon && rcl >= 6 ? 2 : 1;
    }

    return 0;
  }

  findTask(creep: Creep, taskManager: TaskManager) {
    if (creep.memory.working) {
      // Repairs or construction
      let target: ConstructionSite | Structure | null = null;
      let type: BuilderTask['type'] = 'build';

      // Allow multiple builders to target same construction site
      // Work on these 1 at a time (most completed one first)
      // If all are equal progress, should automatically go in placement order
      // Only construct if not under attack
      if (!creep.room.memory.defcon) {
        target = creep.room
          .findConstructionSites()
          .sort((a, b) => b.progress - a.progress)[0];
      }

      if (!target) {
        // Repair structures if no towers
        type = 'repair';

        // Find most damaged structure
        // Target roads at lower hits
        target = creep.room
          .find(FIND_STRUCTURES, {
            filter: struct => {
              if (!isDamaged(struct)) return false;

              if (
                creep.room.memory.defcon &&
                struct.structureType !== STRUCTURE_RAMPART
              ) {
                return false;
              }

              if (
                struct.structureType === STRUCTURE_ROAD &&
                (creep.room.memory.defcon || struct.hits > struct.hitsMax / 2)
              ) {
                return false;
              }

              if (
                taskManager.isTaskTaken(struct.pos.roomName, struct.id, type)
              ) {
                return false;
              }

              return true;
            },
          })
          .sort((a, b) => a.hits - b.hits)[0];
      }

      // If nothing to repair, hostiles must not be too dangerous so build
      if (!target && creep.room.memory.defcon) {
        type = 'build';
        target = creep.room
          .findConstructionSites()
          .sort((a, b) => b.progress - a.progress)[0];
      }

      if (!target) return null;

      return taskManager.createTask(
        target.pos.roomName,
        target.id,
        type,
        type === 'build' ? -1 : 1
      );
    } else {
      // Find room storage
      if (
        creep.room.storage &&
        creep.room.storage.store[RESOURCE_ENERGY] > 5000
      ) {
        return taskManager.createTask(
          creep.room.name,
          creep.room.storage.id,
          'withdraw'
        );
      }

      // If storage and it's not full enough, recycle
      if (creep.room.storage) return null;

      // Find closest container that can fully fill creep
      const nearestContainer = creep.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: struct =>
          struct.structureType === STRUCTURE_CONTAINER &&
          struct.store[RESOURCE_ENERGY] >=
            creep.store.getFreeCapacity(RESOURCE_ENERGY),
      });

      if (nearestContainer) {
        return taskManager.createTask(
          nearestContainer.pos.roomName,
          nearestContainer.id,
          'withdraw'
        );
      }

      // Default to harvesting from source
      const nearestSources = creep.pos.findClosestOpenSources(creep);

      if (!nearestSources.length) return null;

      for (const source of nearestSources) {
        if (
          !taskManager.isTaskTaken(source.pos.roomName, source.id, 'harvest')
        ) {
          return taskManager.createTask(
            source.pos.roomName,
            source.id,
            'harvest',
            source.pos.getAdjacentPositions(1, true).length
          );
        }
      }

      return null;
    }
  }

  isValidTask(creep: Creep, task: BuilderTask): boolean {
    const target = Game.getObjectById(
      task.target as Id<
        | Source
        | StructureStorage
        | StructureContainer
        | Structure
        | ConstructionSite
      >
    );
    if (!target) return false;

    //? Build is already valid because target is defined

    if (task.type === 'harvest') {
      if ((target as Source).energy <= 0) return false;
      if (creep.pos.isNearTo(target.pos.x, target.pos.y)) return true;
      if (target.pos.getAdjacentPositions(1, false).length === 0) return false;
    }

    if (task.type === 'withdraw') {
      if (
        (target as StructureContainer | StructureStorage).store[
          RESOURCE_ENERGY
        ] < creep.store.getFreeCapacity(RESOURCE_ENERGY)
      ) {
        return false;
      }
    }

    if (task.type === 'repair' && !isDamaged(target as Structure)) {
      return false;
    }

    return true;
  }

  run(creep: Creep): void {
    if (!creep.memory.task) {
      recycle(creep, 600);
      return;
    }

    // Toggle `working` boolean if working and out of energy
    // or not working and full of energy
    // Also mark task as complete so TaskManager assigns a new one
    if (creep.memory.working && creep.isEmpty()) {
      creep.memory.working = false;
      creep.memory.task.complete = true;
    } else if (!creep.memory.working && creep.isFull()) {
      creep.memory.working = true;
      creep.memory.task.complete = true;
    }

    if (creep.memory.task.complete) return;

    const task = creep.memory.task;

    const target = Game.getObjectById(
      task.target as Id<
        | StructureSpawn
        | StructureController
        | Source
        | StructureContainer
        | StructureStorage
        | ConstructionSite
      >
    );

    if (!target) {
      creep.memory.task.complete = true;
      return;
    }

    let res: ScreepsReturnCode = ERR_NOT_FOUND;

    switch (task.type) {
      case 'harvest':
        res = creep.harvest(target as Source);
        break;
      case 'build':
        res = creep.build(target as ConstructionSite);
        break;
      case 'withdraw':
        res = creep.withdraw(
          target as StructureStorage | StructureContainer,
          RESOURCE_ENERGY
        );
        break;
      case 'repair':
        res = creep.repair(target as Structure);
        break;
      default:
        task.complete = true;
    }

    if (task.type === 'withdraw' && res === OK) {
      task.complete = true;
    } else if (task.type === 'build' || task.type === 'repair') {
      const ramp = target.pos.findClosestWalkableRampart(
        // If defcon, don't hog the most damaged rampart
        // It may be a better spot for a defender creep
        creep.room.memory.defcon ? [] : [creep.name]
      );
      if (ramp && target.pos.getRangeTo(ramp) <= 3) {
        if (creep.pos.getRangeTo(ramp) > 1) {
          creep.travelTo(ramp);
        } else {
          excuse(creep);
        }
      } else if (res === ERR_NOT_IN_RANGE) {
        creep.travelTo(target, {
          range: task.type === 'build' || task.type === 'repair' ? 3 : 1,
          // No roads before rcl 3, so avoid creeps for better movement
          ignoreCreeps: (creep.room.controller?.level ?? 0) > 2,
        });
      }
    } else if (res === ERR_NOT_IN_RANGE) {
      creep.travelTo(target, {
        range: 1,
        // No roads before rcl 3, so avoid creeps for better movement
        ignoreCreeps: (creep.room.controller?.level ?? 0) > 2,
      });
    }
  }
}

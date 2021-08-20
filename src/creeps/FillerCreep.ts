import { isNthTick } from 'utils';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface FillerTask extends CreepTask {
  type: 'withdraw' | 'transfer';
}

export class FillerCreep extends CreepBase {
  role: CreepRole = 'filler';
  bodyOpts: BodySettings = {
    pattern: [CARRY, CARRY, MOVE],
    sizeLimit: 8,
  };

  // Only if we have center storage (RCL4+)
  targetNum(room: Room): number {
    return room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ? 1 : 0;
  }

  findTask(creep: Creep, taskManager: TaskManager): FillerTask | null {
    if (creep.memory.working) {
      // Fill extensions, spawn, towers
      let target: StructureSpawn | StructureExtension | StructureTower | null =
        null;
      const type: FillerTask['type'] = 'transfer';

      if (creep.room.energyAvailable < creep.room.energyCapacityAvailable) {
        // Extensions
        target = creep.pos.findClosestByPath<StructureExtension>(
          FIND_STRUCTURES,
          {
            filter: struct =>
              struct.structureType === STRUCTURE_EXTENSION &&
              struct.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
          }
        );

        // Spawns
        if (!target) {
          target = creep.room
            .findSpawns()
            .filter(
              spawn => spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            )[0];
        }
      }

      // Towers
      if (!target) {
        target = creep.room
          .find<StructureTower>(FIND_MY_STRUCTURES, {
            filter: struct =>
              struct.structureType === STRUCTURE_TOWER &&
              struct.store.getFreeCapacity(RESOURCE_ENERGY),
          })
          .sort(
            (a, b) =>
              a.store.getUsedCapacity(RESOURCE_ENERGY) -
              b.store.getUsedCapacity(RESOURCE_ENERGY)
          )[0];
      }

      if (!target) return null;

      return taskManager.createTask<FillerTask>(
        target.pos.roomName,
        target.id,
        type,
        1 // Only ever spawn 1 Filler
      );
    } else {
      let target: StructureStorage | null = null;

      // Gather from center storage
      target =
        creep.room.storage &&
        creep.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) >=
          creep.store.getFreeCapacity(RESOURCE_ENERGY)
          ? creep.room.storage
          : null;

      if (!target) return null;

      return taskManager.createTask<FillerTask>(
        target.pos.roomName,
        target.id,
        'withdraw',
        1
      );
    }
  }

  isValidTask(creep: Creep, task: FillerTask): boolean {
    const target = Game.getObjectById(
      task.target as Id<
        StructureSpawn | StructureExtension | StructureTower | StructureStorage
      >
    );

    if (!target) return false;

    if (task.type === 'withdraw') {
      if (
        (target as StructureStorage).store.getUsedCapacity(RESOURCE_ENERGY) <
        creep.store.getFreeCapacity(RESOURCE_ENERGY)
      ) {
        return false;
      }
    } else if (task.type === 'transfer') {
      // @ts-ignore-next-line idk why this is needed
      if (target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        return false;
      }
    }

    return true;
  }

  run(creep: Creep): void {
    if (!creep.memory.task) {
      creep.say('...');
      return;
    }

    const task = creep.memory.task as FillerTask;

    const target = Game.getObjectById(
      task.target as Id<
        StructureSpawn | StructureExtension | StructureTower | StructureStorage
      >
    );

    if (!target) {
      creep.memory.task.complete = true;
      return;
    }

    let res: ScreepsReturnCode = ERR_NOT_FOUND;

    switch (task.type) {
      case 'transfer':
        res = creep.transfer(
          target as
            | StructureSpawn
            | StructureContainer
            | StructureStorage
            | StructureExtension,
          RESOURCE_ENERGY
        );

        // Also withdraw from storage if adjacent
        const storage = creep.room.storage;
        if (storage && creep.pos.getRangeTo(storage) <= 1) {
          creep.withdraw(storage, RESOURCE_ENERGY);
        }
        break;
      case 'withdraw':
        res = creep.withdraw(
          target as StructureStorage | StructureContainer,
          RESOURCE_ENERGY
        );
        break;
      default:
        creep.memory.task.complete = true;
    }

    if (res === OK) {
      creep.memory.task.complete = true;
    } else if (res === ERR_NOT_IN_RANGE) {
      // Find dropped energy in range if creep has room
      if (isNthTick(2) && creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
        const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
          filter: res => res.resourceType === RESOURCE_ENERGY,
        })[0];

        if (dropped) {
          creep.pickup(dropped);
        } else {
          // Find tombstones with energy
          const tombstone = creep.pos.findInRange(FIND_TOMBSTONES, 1, {
            filter: ts => ts.store.getUsedCapacity(RESOURCE_ENERGY) > 0,
          })[0];
          if (tombstone) {
            creep.withdraw(tombstone, RESOURCE_ENERGY);
          }
        }
      }

      creep.travelTo(target, { range: 1 });
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
  }
}

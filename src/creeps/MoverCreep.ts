import { recycle } from 'actions/recycle';
import config from 'config';
import { TaskManager } from 'TaskManager';
import { isNthTick } from 'utils';
import { BodySettings, CreepBase } from './CreepBase';

interface MoverTask extends CreepTask {
  type: 'withdraw' | 'transfer';
}

export class MoverCreep extends CreepBase {
  role: CreepRole = 'mover';
  bodyOpts: BodySettings = {
    pattern: [CARRY, CARRY, MOVE],
    sizeLimit: 6,
  };
  taskPriority = 3;

  // Number of source containers
  targetNum(room: Room): number {
    return room.findSourceContainers().length;
  }

  findTask(creep: Creep, taskManager: TaskManager): MoverTask | null {
    if (creep.memory.working) {
      if (
        creep.room.storage &&
        _.filter(
          global.empire.colonies[creep.memory.homeRoom].getColonyCreeps(),
          crp => crp.memory.role === 'filler'
        ).length
      ) {
        // Only fill controller container and storage, operator/filler do the rest
        let target: StructureStorage | StructureContainer | null = null;
        const type: MoverTask['type'] = 'transfer';

        const storage = creep.room.storage;

        if (storage && storage.store.getUsedCapacity(RESOURCE_ENERGY) < 10000) {
          target = storage;
        }

        // Controller container
        if (!target) {
          target = creep.room
            .findUpgradeContainers()
            .filter(
              container =>
                container.store.getFreeCapacity(RESOURCE_ENERGY) >
                  creep.store.getUsedCapacity(RESOURCE_ENERGY) &&
                !taskManager.isTaskTaken(creep.room.name, container.id, type)
            )[0];
        }

        // Center storage
        if (!target && storage) {
          target = storage;
        }

        if (!target) return null;

        return taskManager.createTask<MoverTask>(
          target.pos.roomName,
          target.id,
          type,
          target.structureType === STRUCTURE_CONTAINER ? 2 : -1
        );
      } else {
        // Fill extensions, spawn, towers, center/controller storage/container
        let target:
          | StructureSpawn
          | StructureExtension
          | StructureTower
          | StructureContainer
          | null;
        const type: MoverTask['type'] = 'transfer';

        // Extensions
        target = creep.pos.findClosestByRange<StructureExtension>(
          FIND_STRUCTURES,
          {
            filter: struct =>
              struct.structureType === STRUCTURE_EXTENSION &&
              struct.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
              struct.isActive() &&
              !taskManager.isTaskTaken(struct.pos.roomName, struct.id, type),
          }
        );

        // Spawns
        if (!target) {
          target = creep.room
            .findSpawns()
            .filter(
              spawn =>
                spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                !taskManager.isTaskTaken(spawn.pos.roomName, spawn.id, type)
            )[0];
        }

        // Towers
        if (!target) {
          // Ignore max tower refill in defcon, keep them full
          target = creep.room.find<StructureTower>(FIND_MY_STRUCTURES, {
            filter: struct =>
              struct.structureType === STRUCTURE_TOWER &&
              (struct.store.getUsedCapacity(RESOURCE_ENERGY) <
                config.MAX_TOWER_REFILL ||
                creep.room.memory.defcon) &&
              !taskManager.isTaskTaken(struct.pos.roomName, struct.id, type),
          })[0];
        }

        // Controller container
        if (!target) {
          target = creep.room
            .findUpgradeContainers()
            .filter(
              container =>
                container.store.getFreeCapacity(RESOURCE_ENERGY) >
                  creep.store.getUsedCapacity(RESOURCE_ENERGY) &&
                !taskManager.isTaskTaken(creep.room.name, container.id, type)
            )[0];
        }

        if (!target) return null;

        return taskManager.createTask<MoverTask>(
          target.pos.roomName,
          target.id,
          type,
          target.structureType === STRUCTURE_EXTENSION ||
            target.structureType === STRUCTURE_SPAWN ||
            target.structureType === STRUCTURE_TOWER
            ? 1
            : -1
        );
      }
    } else {
      let target: StructureContainer | StructureStorage | null = null;
      const type: MoverTask['type'] = 'withdraw';

      // Gather from fullest source container
      target = creep.room
        .findSourceContainers()
        .filter(
          container =>
            container.store[RESOURCE_ENERGY] >=
            creep.store.getFreeCapacity(RESOURCE_ENERGY)
        )
        .sort(
          (a, b) =>
            a.store.getFreeCapacity(RESOURCE_ENERGY) -
            b.store.getFreeCapacity(RESOURCE_ENERGY)
        )[0];

      // Gather from storage
      if (!target) {
        if (
          creep.room.storage &&
          creep.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) >=
            creep.store.getFreeCapacity(RESOURCE_ENERGY)
        ) {
          target = creep.room.storage;
        }
      }

      if (!target) return null;

      return taskManager.createTask<MoverTask>(
        target.pos.roomName,
        target.id,
        type
      );
    }
  }

  isValidTask(creep: Creep, task: MoverTask): boolean {
    const target = Game.getObjectById(
      task.target as Id<
        | StructureSpawn
        | StructureExtension
        | StructureTower
        | StructureStorage
        | StructureContainer
      >
    );
    if (!target) return false;

    if (task.type === 'withdraw') {
      if (
        (target as StructureContainer | StructureStorage).store[
          RESOURCE_ENERGY
        ] < creep.store.getFreeCapacity(RESOURCE_ENERGY)
      ) {
        return false;
      }
    }

    if (task.type === 'transfer') {
      // @ts-ignore-next-line idk why this is needed
      if (target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        return false;
      }
    }

    return true;
  }

  run(creep: Creep): void {
    if (!creep.memory.task) {
      recycle(creep, 1000);
      return;
    }

    const task = creep.memory.task as MoverTask;
    const target = Game.getObjectById(
      task.target as Id<
        | StructureSpawn
        | StructureController
        | Source
        | StructureContainer
        | StructureStorage
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
        break;
      case 'withdraw':
        res = creep.withdraw(target as StructureContainer, RESOURCE_ENERGY);
        break;
      default:
        creep.memory.task.complete = true;
    }

    if (res === OK) {
      creep.memory.task.complete = true;
    } else if (res === ERR_NOT_IN_RANGE) {
      if (isNthTick(2)) {
        // Find tombstones with energy
        const tombstone = creep.pos.findInRange(FIND_TOMBSTONES, 1, {
          filter: ts => ts.store.getUsedCapacity(RESOURCE_ENERGY) > 0,
        })[0];
        if (tombstone) {
          creep.withdraw(tombstone, RESOURCE_ENERGY);
        } else {
          // Find dropped resources in range
          const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
            filter: res => res.resourceType === RESOURCE_ENERGY,
          })[0];
          if (dropped) {
            creep.pickup(dropped);
          }
        }
      }

      creep.travelTo(target);
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

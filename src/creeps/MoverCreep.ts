import config from 'config';
import { TaskManager } from 'TaskManager';
import { CreepBase } from './CreepBase';

interface MoverTask extends CreepTask {
  type: 'withdraw' | 'transfer';
}

export class MoverCreep extends CreepBase {
  role: CreepRole = 'mover';
  bodyPattern = [CARRY, MOVE];

  // Same number of source containers
  // Max of 3
  targetNum(room: Room): number {
    return Math.min(room.findSourceContainers().length, 3);
  }

  findTask(creep: Creep, taskManager: TaskManager): MoverTask | null {
    if (creep.memory.working) {
      // Fill extensions, spawn, towers, center/controller storage/container
      let target:
        | StructureSpawn
        | StructureExtension
        | StructureTower
        | StructureStorage
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
        target = creep.room.find<StructureTower>(FIND_MY_STRUCTURES, {
          filter: struct =>
            struct.structureType === STRUCTURE_TOWER &&
            struct.store.getUsedCapacity(RESOURCE_ENERGY) <
              config.MAX_TOWER_REFILL &&
            !taskManager.isTaskTaken(struct.pos.roomName, struct.id, type),
        })[0];
      }

      // Controller container
      if (!target) {
        target = creep.room
          .findUpgradeContainers()
          .filter(
            container =>
              container.store.getFreeCapacity(RESOURCE_ENERGY) > 200 &&
              !taskManager.isTaskTaken(creep.room.name, container.id, type)
          )[0];
      }

      // Center storage
      if (!target) {
        const storage = creep.room.storage;
        if (
          storage &&
          !taskManager.isTaskTaken(storage.room.name, storage.id, type)
        ) {
          target = storage;
        }
      }

      // Center container
      if (!target) {
        const center = creep.room.memory.baseCenter;
        if (center) {
          target = new RoomPosition(
            center.x,
            center.y,
            creep.room.name
          ).findInRange<StructureContainer>(FIND_STRUCTURES, 2, {
            filter: struct =>
              struct.structureType === STRUCTURE_CONTAINER &&
              struct.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
              !taskManager.isTaskTaken(creep.room.name, struct.id, type),
          })[0];
        }
      }

      if (!target) return null;

      return taskManager.createTask<MoverTask>(
        target.pos.roomName,
        target.id,
        type
      );
    } else {
      let target: StructureContainer | StructureStorage | null = null;
      const type: MoverTask['type'] = 'withdraw';

      // Gather from fullest source container
      target = creep.room
        .findSourceContainers()
        .sort(
          (a, b) =>
            a.store.getFreeCapacity(RESOURCE_ENERGY) -
            b.store.getFreeCapacity(RESOURCE_ENERGY)
        )[0];

      // Gather from center storage if available
      if (!target) {
        target =
          creep.room.storage &&
          creep.room.storage.store[RESOURCE_ENERGY] >=
            creep.store.getFreeCapacity(RESOURCE_ENERGY)
            ? creep.room.storage
            : null;
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
      // @ts-ignore-next-line
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
        res = creep.withdraw(
          target as StructureStorage | StructureContainer,
          RESOURCE_ENERGY
        );
        break;
      default:
        creep.memory.task.complete = true;
    }

    if (res === ERR_NOT_IN_RANGE) {
      // Find dropped resources in range
      const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1)[0];
      if (dropped) creep.pickup(dropped);

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

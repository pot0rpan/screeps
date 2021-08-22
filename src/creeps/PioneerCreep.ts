import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface PioneerTask extends CreepTask {
  type: 'harvest' | 'withdraw' | 'transfer' | 'upgrade';
}

// Pioneers are unspecialized, used only for level 1
// They mine from source and transfer to spawn or upgrade controller
export class PioneerCreep extends CreepBase {
  role: CreepRole = 'pioneer';
  bodyOpts: BodySettings = {
    pattern: [WORK, CARRY, MOVE, MOVE],
    sizeLimit: 2,
  };

  // If controller is level 1, spawn 4
  // If there aren't enough other roles, spawn 2
  targetNum(room: Room): number {
    const controller = room.controller;
    if (!controller) return 0;
    if (controller.level === 1) return 4;

    // If no upgraders or movers, spawn 2
    if (
      !room.find(FIND_MY_CREEPS, {
        filter: creep =>
          creep.memory.role === 'upgrader' || creep.memory.role === 'mover',
      }).length
    ) {
      return 2;
    }

    return 0;
  }

  findTask(creep: Creep, taskManager: TaskManager): CreepTask | null {
    if (creep.memory.working) {
      // Fill extensions or spawn or controller
      let target:
        | StructureSpawn
        | StructureController
        | StructureExtension
        | null;
      let type: PioneerTask['type'] = 'transfer';

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

      if (!target) {
        target = creep.room
          .findSpawns()
          .filter(
            spawn =>
              spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
              !taskManager.tasks[
                taskManager.createTask(spawn.pos.roomName, spawn.id, type).id
              ]
          )[0];
      }

      if (!target && creep.room.controller) {
        target = creep.room.controller;
        type = 'upgrade';
      }

      if (!target) return null;

      return taskManager.createTask(
        target.pos.roomName,
        target.id,
        type,
        target.structureType === STRUCTURE_EXTENSION ? 1 : -1
      );
    } else {
      // Find room storage
      if (
        (creep.room.controller?.level ?? 0) > 3 &&
        creep.room.storage &&
        creep.room.storage.store[RESOURCE_ENERGY] >=
          creep.store.getFreeCapacity(RESOURCE_ENERGY)
      ) {
        return taskManager.createTask(
          creep.room.name,
          creep.room.storage.id,
          'withdraw'
        );
      }

      // Find closest container that can fully fill creep
      const nearestContainer =
        creep.room.controller?.level ?? 0 > 1
          ? creep.pos.findClosestByRange(FIND_STRUCTURES, {
              filter: struct =>
                struct.structureType === STRUCTURE_CONTAINER &&
                struct.store[RESOURCE_ENERGY] >=
                  creep.store.getFreeCapacity(RESOURCE_ENERGY),
            })
          : null;

      if (nearestContainer) {
        return taskManager.createTask(
          nearestContainer.pos.roomName,
          nearestContainer.id,
          'withdraw'
        );
      }

      // Find nearest source
      const nearestSource = creep.pos.findClosestSource(creep);
      if (!nearestSource) return null;
      return taskManager.createTask(
        nearestSource.pos.roomName,
        nearestSource.id,
        'harvest'
      );
    }
  }

  isValidTask(creep: Creep, task: PioneerTask): boolean {
    const target = Game.getObjectById(
      task.target as Id<
        | Source
        | StructureController
        | StructureSpawn
        | StructureContainer
        | StructureStorage
        | StructureExtension
      >
    );
    if (!target) return false;

    if (task.type === 'harvest') {
      if ((target as Source).energy < 0) return false;
      if (creep.pos.isNearTo(target.pos.x, target.pos.y)) return true;

      // Check number of open spaces around source
      if (target.pos.getAdjacentPositions(1, false).length === 0) return false;
    }

    if (task.type === 'transfer') {
      if (
        (target as StructureSpawn | StructureExtension).store.getFreeCapacity(
          RESOURCE_ENERGY
        ) === 0
      )
        return false;
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

    if (task.type === 'upgrade') {
      // TODO: Check number of open spaces around controller
    }

    return true;
  }

  run(creep: Creep): void {
    if (!creep.memory.task || creep.memory.task.complete) return;

    const task = creep.memory.task;
    const target = Game.getObjectById(
      task.target as Id<
        | StructureSpawn
        | StructureController
        | Source
        | StructureContainer
        | StructureStorage
        | StructureExtension
      >
    );

    if (!target) {
      creep.memory.task.complete = true;
      return;
    }

    let res: ScreepsReturnCode;

    switch (task.type) {
      case 'harvest':
        res = creep.harvest(target as Source);
        break;
      case 'transfer':
        res = creep.transfer(
          target as StructureSpawn | StructureExtension,
          RESOURCE_ENERGY
        );
        break;
      case 'upgrade':
        res = creep.upgradeController(target as StructureController);
        break;
      case 'withdraw':
        res = creep.withdraw(
          target as StructureStorage | StructureContainer,
          RESOURCE_ENERGY
        );
        break;
      default:
        return;
    }

    if ((task.type === 'withdraw' || task.type === 'transfer') && res === OK) {
      creep.memory.task.complete = true;
    } else if (res === ERR_NOT_IN_RANGE) {
      creep.travelTo(target);
    }

    // Toggle `working` boolean if working and out of energy
    // or not working and full of energy
    if (creep.memory.working && creep.isEmpty()) {
      creep.memory.working = false;
      creep.memory.task.complete = true;
    } else if (!creep.memory.working && creep.isFull()) {
      creep.memory.working = true;
      creep.memory.task.complete = true;
    }
  }
}

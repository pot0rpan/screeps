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

  targetNum(room: Room): number {
    const controller = room.controller;
    if (!controller) return 0;

    if (controller.level <= 2) {
      return Math.min(
        6,
        room.findSources(true).reduce(
          (spaces, source) =>
            spaces + source.pos.getAdjacentPositions(1, true).length,
          1 // Extra since they won't all always be harvesting at the same time
        )
      );
    }

    // If no upgraders or movers, spawn some depending on rcl, min 2
    if (
      !room.find(FIND_MY_CREEPS, {
        filter: creep =>
          creep.memory.role === 'mover' || creep.memory.role === 'filler',
      }).length
    ) {
      return Math.max(7 - controller.level, 2);
    }

    return 0;
  }

  findTask(creep: Creep, taskManager: TaskManager): PioneerTask | null {
    if (creep.memory.working) {
      // Fill extensions or spawn or tower or controller
      let target:
        | StructureExtension
        | StructureSpawn
        | StructureTower
        | StructureController
        | null
        | undefined;
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
          .find(spawn => spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
      }

      if (!target) {
        target = creep.room
          .findTowers()
          .find(tower => tower.store.getFreeCapacity(RESOURCE_ENERGY) > 200);
      }

      if (!target && creep.room.controller) {
        target = creep.room.controller;
        type = 'upgrade';
      }

      if (!target) return null;

      return taskManager.createTask<PioneerTask>(
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
        return taskManager.createTask<PioneerTask>(
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
        return taskManager.createTask<PioneerTask>(
          nearestContainer.pos.roomName,
          nearestContainer.id,
          'withdraw'
        );
      }

      // Find nearest source
      const nearestSources = creep.pos.findClosestOpenSources(creep);
      if (!nearestSources.length) return null;

      for (const source of nearestSources) {
        if (
          !taskManager.isTaskTaken(source.pos.roomName, source.id, 'harvest')
        ) {
          return taskManager.createTask<PioneerTask>(
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
      if ((target as Source).energy <= 0) return false;
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
    const task = creep.memory.task as PioneerTask | undefined;

    if (!task || task.complete) return;

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
      task.complete = true;
      return;
    }

    if (task.type === 'upgrade') {
      if (creep.pos.getRangeTo(target) > 3) {
        creep.travelTo(target, {
          range: 3,
          ignoreCreeps: false,
          ignoreRoads: true,
        });
        return;
      }
    } else {
      if (creep.pos.getRangeTo(target) > 1) {
        creep.travelTo(target, {
          range: 1,
          ignoreCreeps: false,
          ignoreRoads: true,
        });
        return;
      }
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
      task.complete = true;
    }

    // Toggle `working` boolean if working and out of energy
    // or not working and full of energy
    if (creep.memory.working && creep.isEmpty()) {
      creep.memory.working = false;
      task.complete = true;
    } else if (!creep.memory.working && creep.isFull()) {
      creep.memory.working = true;
      task.complete = true;
    }
  }
}

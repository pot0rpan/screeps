import { recycle } from 'actions/recycle';
import config from 'config';
import { TaskManager } from 'TaskManager';
import { isNthTick } from 'utils';
import { BodySettings, CreepBase } from './CreepBase';

interface MoverTask extends CreepTask {
  type: 'withdraw' | 'transfer' | 'pickup';
}

export class MoverCreep extends CreepBase {
  role: CreepRole = 'mover';
  bodyOpts: BodySettings = {
    pattern: [CARRY, CARRY, MOVE],
    sizeLimit: 10,
  };
  taskPriority = 10; // TODO: findTask is EXPENSIVE

  // Number of full source containers, extra if low rcl
  // When links are in place, containers should usually be full so no movers needed
  targetNum(room: Room): number {
    // Containers half full
    const halfFullContainers = room
      .findSourceContainers()
      .filter(cont => cont.store.getUsedCapacity(RESOURCE_ENERGY) > 1000);

    const numContainers = halfFullContainers.length;
    if (!numContainers) return 0;

    const rcl = room.controller?.level ?? 0;

    // Spawn extra mover if any source containers are completely full
    const extraNeeded = halfFullContainers.filter(
      cont => cont.store.getFreeCapacity(RESOURCE_ENERGY) === 0
    ).length
      ? 1
      : 0;

    if (rcl < 4) return numContainers + extraNeeded + 1; // Extra for low rcl
    if (rcl > 5) return extraNeeded + 1;
    return extraNeeded + numContainers;
  }

  findTask(creep: Creep, taskManager: TaskManager): MoverTask | null {
    if (creep.memory.working) {
      if (
        creep.room.storage &&
        global.empire.colonies[creep.memory.homeRoom]
          .getColonyCreeps()
          .find(crp => crp.memory.role === 'filler')
      ) {
        // Only fill controller container and storage, operator/filler do the rest
        let target: StructureStorage | StructureContainer | null = null;
        const type: MoverTask['type'] = 'transfer';

        const storage = creep.room.storage;

        if (
          storage &&
          (storage.store.getUsedCapacity(RESOURCE_ENERGY) < 10000 ||
            creep.getCarryingResources()[0] !== RESOURCE_ENERGY)
        ) {
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
          | undefined;
        const type: MoverTask['type'] = 'transfer';

        // Extensions
        target = creep.room
          .findExtensions()
          .filter(
            ext =>
              ext.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
              !taskManager.isTaskTaken(ext.pos.roomName, ext.id, type)
          )
          .sort((a, b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep))[0];

        // Spawns
        if (!target) {
          target = creep.room
            .findSpawns()
            .find(
              spawn =>
                spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                !taskManager.isTaskTaken(spawn.pos.roomName, spawn.id, type)
            );
        }

        // Towers
        if (!target) {
          // Ignore max tower refill in defcon, keep them full
          target = creep.room
            .findTowers()
            .find(
              tower =>
                (tower.store.getUsedCapacity(RESOURCE_ENERGY) <
                  config.MAX_TOWER_REFILL ||
                  creep.room.memory.defcon) &&
                !taskManager.isTaskTaken(tower.pos.roomName, tower.id, type)
            );
        }

        // Controller container
        if (!target) {
          target = creep.room
            .findUpgradeContainers()
            .find(
              container =>
                container.store.getFreeCapacity(RESOURCE_ENERGY) >
                  creep.store.getUsedCapacity(RESOURCE_ENERGY) &&
                !taskManager.isTaskTaken(creep.room.name, container.id, type)
            );
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
      let target: StructureContainer | Resource | undefined = undefined;
      let type: MoverTask['type'] = 'pickup';

      // Look for dropped resources, get largest amounts first
      // Get other resources first if we aren't low on energy
      const dropped = creep.room
        .find(
          FIND_DROPPED_RESOURCES,
          creep.room.storage?.isActive() &&
            creep.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 10000
            ? undefined
            : { filter: res => res.resourceType === RESOURCE_ENERGY }
        )
        .filter(res => res.amount > 100)
        .sort((a, b) => b.amount - a.amount);

      if (dropped.length) {
        target = dropped.find(res => res.resourceType !== RESOURCE_ENERGY);

        if (!target) target = dropped[0];
      }

      // Gather from fullest source container
      if (!target) {
        type = 'withdraw';
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
      }

      if (!target) return null;

      return taskManager.createTask<MoverTask>(
        target.pos.roomName,
        target.id,
        type,
        target instanceof Resource &&
          target.amount > creep.store.getFreeCapacity(target.resourceType)
          ? -1
          : 1
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
        | Resource
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
      if (target.store.getFreeCapacity() === 0) {
        return false;
      }
    }

    // Pickup should be valid if target is defined

    return true;
  }

  run(creep: Creep): void {
    if (!creep.memory.task) {
      recycle(creep, 1000);
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

    if (creep.memory.task.complete) {
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
        | Resource
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
          creep.getCarryingResources()[0]
        );
        break;
      case 'withdraw':
        res = creep.withdraw(target as StructureContainer, RESOURCE_ENERGY);
        break;
      case 'pickup':
        res = creep.pickup(target as Resource);
        break;
      default:
        creep.memory.task.complete = true;
    }

    if (res === OK || res === ERR_FULL) {
      creep.memory.task.complete = true;
    } else if (res === ERR_NOT_IN_RANGE) {
      creep.travelTo(target, { range: 1, ignoreRoads: creep.isEmpty() });
    }
  }
}

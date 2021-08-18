import config from 'config';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface UpgraderTask extends CreepTask {
  type: 'upgrade' | 'withdraw';
  data: { controller: string };
}

// Upgraders grab energy from controller container and upgrade controller
export class UpgraderCreep extends CreepBase {
  role: CreepRole = 'upgrader';
  bodyOpts: BodySettings = {
    pattern: [WORK, WORK, CARRY],
    sizeLimit: 5,
    suffix: [MOVE],
  };

  targetNum(room: Room): number {
    const controller = room.controller;
    if (!controller) return 0;
    const rcl = controller.level;
    if (rcl < 2) return 0;
    if (room.memory.defcon) return 0;

    const controllerContainer =
      room.controller &&
      (room.controller.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: struct =>
          struct.structureType === STRUCTURE_CONTAINER &&
          struct.store[RESOURCE_ENERGY] !== 0,
      })[0] as StructureContainer);

    if (controllerContainer) {
      // Get number of positions around container
      const numPositions =
        controllerContainer.pos.getAdjacentPositions(1).length;

      // Number that seems decent for rcl
      const idealNum = rcl < 4 ? 3 : 2;

      // Leave room for mover to fill container (num positions - 1)
      const targetNum = Math.min(idealNum, numPositions - 1);

      // If storage low and controller not half downgraded, less upgraders
      if (
        controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[rcl] / 2 &&
        room.storage &&
        room.storage.store.getUsedCapacity(RESOURCE_ENERGY) <
          config.MAX_ENERGY_STORAGE(rcl)
      ) {
        return Math.floor(targetNum / 2);
      } else {
        return targetNum;
      }
    }

    return 0;
  }

  findTask(creep: Creep, taskManager: TaskManager) {
    const controller = creep.room.controller;
    if (!controller) return null;
    const container = creep.room.findUpgradeContainers()[0];
    if (!container) return null;

    return taskManager.createTask<UpgraderTask>(
      container.pos.roomName,
      container.id,
      'upgrade',
      -1,
      { controller: controller.id }
    );
  }

  isValidTask(creep: Creep, task: UpgraderTask): boolean {
    return (
      !!Game.getObjectById(task.target as Id<StructureContainer>) &&
      !!Game.getObjectById(task.data.controller as Id<StructureController>)
    );
  }

  run(creep: Creep): void {
    if (!creep.memory.task || creep.memory.task.complete) return;

    const task = creep.memory.task as UpgraderTask;
    const container = Game.getObjectById(task.target as Id<StructureContainer>);
    const controller = Game.getObjectById(
      task.data.controller as Id<StructureController>
    );

    if (!container || !controller) {
      creep.memory.task.complete = true;
      return;
    }

    // If creep is near controller and has energy, upgrade
    if (
      creep.store[RESOURCE_ENERGY] > 0 &&
      creep.pos.getRangeTo(controller.pos.x, controller.pos.y) < 3
    ) {
      creep.upgradeController(controller);
    } else {
      // Otherwise withdraw from container
      const res = creep.withdraw(container, RESOURCE_ENERGY);
      if (res === ERR_NOT_IN_RANGE) {
        creep.travelTo(container);
      } else if (res !== OK) {
        creep.say('...');
      }
    }
  }
}

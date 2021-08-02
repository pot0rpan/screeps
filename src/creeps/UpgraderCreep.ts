import { TaskManager } from 'TaskManager';
import { CreepBase } from './CreepBase';

interface UpgraderTask extends CreepTask {
  type: 'upgrade' | 'withdraw';
  data: { controller: string };
}

// Upgraders grab energy from controller container and upgrade controller
export class UpgraderCreep extends CreepBase {
  role: CreepRole = 'upgrader';
  bodyPattern = [WORK, WORK, CARRY, MOVE];

  // 2 if full container by controller
  targetNum(room: Room): number {
    if (
      room.controller &&
      room.controller.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: struct =>
          struct.structureType === STRUCTURE_CONTAINER &&
          struct.store[RESOURCE_ENERGY] !== 0,
      }).length
    ) {
      return 2;
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
      } else {
        creep.say('...');
      }
    }
  }
}

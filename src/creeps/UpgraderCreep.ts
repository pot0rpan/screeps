import { TaskManager } from 'TaskManager';
import { minToStoreOfResource } from 'utils/room';
import { BodySettings, CreepBase } from './CreepBase';

interface UpgraderTask extends CreepTask {
  type: 'upgrade' | 'withdraw';
  data: { controller: string; link?: string };
}

// Upgraders grab energy from controller container and upgrade controller
export class UpgraderCreep extends CreepBase {
  role: CreepRole = 'upgrader';
  bodyOpts: BodySettings = {
    pattern: [WORK, WORK, CARRY],
    ordered: true,
    sizeLimit: 6,
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
      room.controller.pos.findInRange<StructureContainer>(FIND_STRUCTURES, 2, {
        filter: struct => struct.structureType === STRUCTURE_CONTAINER,
      })[0];

    if (!controllerContainer) return 0;

    const controllerLink = room.findUpgradeLinks()[0];

    // Check for energy levels
    let totalUpgradeEnergy =
      controllerContainer.store.getUsedCapacity(RESOURCE_ENERGY);
    if (controllerLink) {
      totalUpgradeEnergy +=
        controllerLink.store.getUsedCapacity(RESOURCE_ENERGY);
    }

    if (totalUpgradeEnergy < 500) return 0;

    // Get number of positions around container
    const numPositions = controllerContainer.pos.getAdjacentPositions(1).length;

    // Number that seems decent for rcl, accounting for excess energy
    const idealNum = rcl < 4 ? 3 : 2;

    // Leave room for mover to fill container (num positions - 1)
    const targetNum = Math.min(idealNum, numPositions - 1);

    // If storage low and controller not half downgraded, less upgraders
    if (
      controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[rcl] / 2 &&
      room.storage &&
      room.storage.store.getUsedCapacity(RESOURCE_ENERGY) <
        minToStoreOfResource(room, RESOURCE_ENERGY)
    ) {
      return Math.floor(targetNum / 2);
    } else {
      return targetNum;
    }
  }

  findTask(creep: Creep, taskManager: TaskManager) {
    const controller = creep.room.controller;
    if (!controller) return null;
    const container = creep.room.findUpgradeContainers()[0];
    if (!container) return null;

    const link =
      controller.level > 4
        ? creep.room.findUpgradeLinks()[0]
        : (undefined as StructureLink | undefined);

    return taskManager.createTask<UpgraderTask>(
      container.pos.roomName,
      container.id,
      'upgrade',
      -1,
      { controller: controller.id, link: link?.id }
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
    const link = Game.getObjectById(
      (task.data.link || '') as Id<StructureLink>
    );

    if (!container || !controller) {
      creep.memory.task.complete = true;
      return;
    }

    // If creep is near controller and has energy, upgrade
    if (creep.store[RESOURCE_ENERGY] > 0) {
      if (creep.pos.getRangeTo(controller) <= 3) {
        creep.upgradeController(controller);
      } else {
        creep.travelTo(controller, { range: 3 });
      }
    } else {
      // Withdraw from link if available, otherwise container
      const target =
        link && link.store.getUsedCapacity(RESOURCE_ENERGY) ? link : container;

      const res = creep.withdraw(target, RESOURCE_ENERGY);
      if (res === ERR_NOT_IN_RANGE) {
        creep.travelTo(target);
      } else if (res !== OK) {
        creep.say('...');
      }
    }
  }
}

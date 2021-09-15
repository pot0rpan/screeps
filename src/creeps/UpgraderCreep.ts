import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { targetResourceAmount } from 'utils/room';
import { BodySettings, CreepBase } from './CreepBase';

interface UpgraderTask extends CreepTask {
  type: 'upgrade' | 'withdraw';
  target: Id<StructureContainer>;
  data: { controller: Id<StructureController>; link?: Id<StructureLink> };
}

// Upgraders grab energy from controller container and upgrade controller
export class UpgraderCreep extends CreepBase {
  role: CreepRole = 'upgrader';
  bodyOpts: BodySettings = {
    pattern: [WORK, WORK, CARRY],
    ordered: true,
    sizeLimit: 8,
    suffix: [MOVE],
  };

  targetNum(room: Room): number {
    const controller = room.controller;
    if (!controller) return 0;
    const rcl = controller.level;
    if (rcl < 2) return 0;
    if (room.memory.defcon) return 0;

    const controllerContainer = room.findUpgradeContainers()[0] as
      | StructureContainer
      | undefined;
    const controllerLink = room.findUpgradeLinks()[0] as
      | StructureLink
      | undefined;

    // Check for energy levels
    let totalUpgradeEnergy =
      (controllerContainer?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) +
      (controllerLink?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0);

    if (totalUpgradeEnergy < 500) return 0;

    // Get number of positions around energy source
    const numPositions = (
      controllerLink || controllerContainer!
    ).pos.getAdjacentPositions(1).length;

    // Number that seems decent for rcl, accounting for excess energy
    // Limit to 1 for rcl 8 since max of 15 e/t
    const idealNum = rcl < 4 ? 3 : rcl < 8 ? 2 : 1;

    // Leave room for mover to fill container (num positions - 1)
    const targetNum = Math.min(idealNum, numPositions - 1);

    // If storage low and controller not half downgraded, upgrading can wait
    if (
      controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[rcl] / 2 &&
      room.storage &&
      room.storage.store.getUsedCapacity(RESOURCE_ENERGY) <
        targetResourceAmount(room, RESOURCE_ENERGY)
    ) {
      return 0;
    } else {
      return targetNum;
    }
  }

  findTask(creep: Creep, taskManager: TaskManager) {
    const controller = creep.room.controller;
    if (!controller) return null;

    const container = creep.room.findUpgradeContainers()[0];
    const link = controller.level > 4 ? creep.room.findUpgradeLinks()[0] : null;

    if (!container && !link) return null;

    return taskManager.createTask<UpgraderTask>(
      (container || link).pos.roomName,
      container?.id ?? '',
      'upgrade',
      -1,
      { controller: controller.id, link: link?.id }
    );
  }

  isValidTask(creep: Creep, task: UpgraderTask): boolean {
    return (
      !!Game.getObjectById(task.target as Id<StructureContainer>) ||
      !!Game.getObjectById(task.data.controller as Id<StructureController>)
    );
  }

  run(creep: Creep): void {
    if (!creep.memory.task || creep.memory.task.complete) {
      recycle(creep, 500);
      return;
    }

    const task = creep.memory.task as UpgraderTask;
    const controller = Game.getObjectById(task.data.controller);
    const container = Game.getObjectById(task.target);
    const link = task.data.link ? Game.getObjectById(task.data.link) : null;

    if ((!container && !link) || !controller) {
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

      if (!target) return;

      if (creep.pos.getRangeTo(target) > 1) {
        creep.travelTo(target, { range: 1 });
      } else if (
        !target.store[RESOURCE_ENERGY] ||
        creep.withdraw(target, RESOURCE_ENERGY) !== OK
      ) {
        creep.say('...');
      }
    }
  }
}

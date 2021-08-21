import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface DefenderTask extends CreepTask {
  type: 'attack';
}

// Defenders can't spawn until RCL 3 due to body size
export class DefenderCreep extends CreepBase {
  role: CreepRole = 'defender';
  bodyOpts: BodySettings = {
    ordered: true,
    pattern: [
      MOVE,
      MOVE,
      MOVE,
      ATTACK, // 80
      ATTACK, // 80
      RANGED_ATTACK, // 150
    ],
  };

  targetNum(room: Room): number {
    // Base body pattern needs RCL3 extensions to spawn
    return (room.controller?.level ?? 0) >= 3 && room.memory.defcon ? 5 : 0;
  }

  findTask(creep: Creep, taskManager: TaskManager): DefenderTask | null {
    if (!creep.room.memory.defcon) return null;
    return taskManager.createTask<DefenderTask>(creep.room.name, '', 'attack');
  }

  isValidTask(creep: Creep, task: DefenderTask): boolean {
    return !!creep.room.memory.defcon;
  }

  run(creep: Creep): void {
    const task = creep.memory.task as DefenderTask | undefined;

    if (!task || task.complete) {
      recycle(creep, 20);
      return;
    }

    const closestHostile = creep.room
      .findHostiles()
      .sort((a, b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep))[0];

    if (!closestHostile) {
      task.complete = true;
      return;
    }

    const closestRampart =
      closestHostile.pos.findClosestByRange<StructureRampart>(
        FIND_MY_STRUCTURES,
        {
          filter: struct =>
            struct.structureType === STRUCTURE_RAMPART &&
            !struct.pos
              .look()
              .filter(
                res =>
                  !res.creep && (!res.structure || res.structure.structureType)
              ),
        }
      );

    // Travel to closest rampart no matter what
    if (closestRampart) {
      creep.travelTo(closestRampart);
    }

    const rangeToHostile = creep.pos.getRangeTo(closestHostile);

    if (rangeToHostile === 1) {
      creep.attack(closestHostile);
    } else if (
      rangeToHostile <= 3 &&
      !!creep.getActiveBodyparts(RANGED_ATTACK)
    ) {
      creep.rangedAttack(closestHostile);
    }
  }
}

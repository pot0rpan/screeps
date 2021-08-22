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
    pattern: [ATTACK, MOVE],
  };

  targetNum(room: Room): number {
    // Base body pattern needs RCL3 extensions to spawn
    return (room.controller?.level ?? 0) >= 3 && room.memory.defcon ? 3 : 0;
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
      recycle(creep, 100);
      return;
    }

    const closestHostile = creep.room
      .findHostiles()
      .sort((a, b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep))[0];

    if (!closestHostile) {
      task.complete = true;
      return;
    }

    // Find closest open rampart to hostile that's walkable
    // Also avoid roads to not block other creeps
    const closestRampart = creep.pos.findClosestWalkableRampart();

    // Travel to closest rampart no matter what
    if (closestRampart) {
      creep.travelTo(closestRampart);
    }

    if (creep.pos.getRangeTo(closestHostile) === 1) {
      creep.attack(closestHostile);
    }
  }
}

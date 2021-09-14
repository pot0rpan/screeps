import { excuse } from 'actions/excuse';
import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface DefenderTask extends CreepTask {
  type: 'attack';
}

export class DefenderCreep extends CreepBase {
  role: CreepRole = 'defender';
  bodyOpts: BodySettings = {
    ordered: true,
    pattern: [ATTACK, ATTACK, MOVE],
  };

  targetNum(room: Room): number {
    if (!room.memory.defcon) return 0;

    return room
      .findDangerousHostiles()
      .filter(hostile => hostile.getActiveBodyparts(ATTACK)).length;
  }

  findTask(creep: Creep, taskManager: TaskManager): DefenderTask | null {
    if (!creep.room.memory.defcon) return null;
    return taskManager.createTask<DefenderTask>(creep.room.name, '', 'attack');
  }

  isValidTask(creep: Creep, task: DefenderTask): boolean {
    return !!creep.room.memory.defcon;
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    const task = creep.memory.task as DefenderTask | undefined;

    if (!task || task.complete) {
      recycle(creep, 300);
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
    const closestRampart = closestHostile.pos.findClosestWalkableRampart([
      creep.name,
    ]);

    // Travel to closest rampart
    if (closestRampart) {
      if (!closestRampart.pos.isEqualTo(creep.pos)) {
        creep.travelTo(closestRampart);
      } else {
        excuse(creep);
      }
    } else {
      creep.travelTo(closestHostile, { maxRooms: 1 });
    }

    if (creep.pos.getRangeTo(closestHostile) === 1) {
      creep.attack(closestHostile);
    }
  }
}

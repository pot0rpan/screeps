import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface RangedDefenderTask extends CreepTask {
  type: 'attack';
}

export class RangedDefenderCreep extends CreepBase {
  role: CreepRole = 'ranged_defender';
  bodyOpts: BodySettings = {
    ordered: true,
    pattern: [RANGED_ATTACK, RANGED_ATTACK, HEAL, MOVE],
    suffix: [MOVE],
  };

  targetNum(room: Room): number {
    if (!room.memory.defcon) return 0;
    return room
      .findDangerousHostiles()
      .filter(hostile => hostile.getActiveBodyparts(RANGED_ATTACK)).length;
  }

  findTask(creep: Creep, taskManager: TaskManager): RangedDefenderTask | null {
    if (!creep.room.memory.defcon) return null;
    return taskManager.createTask<RangedDefenderTask>(
      creep.room.name,
      '',
      'attack'
    );
  }

  isValidTask(creep: Creep, task: RangedDefenderTask): boolean {
    return !!creep.room.memory.defcon;
  }

  run(creep: Creep): void {
    const task = creep.memory.task as RangedDefenderTask | undefined;

    if (!task || task.complete) {
      recycle(creep, 500);
      return;
    }

    const closestHostiles = creep.room
      .findHostiles()
      .sort((a, b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep));

    if (!closestHostiles.length) {
      task.complete = true;
      return;
    }

    // Find closest open rampart to hostile that's walkable
    // Also avoid roads to not block other creeps
    const closestRampart = closestHostiles[0].pos.findClosestWalkableRampart([
      creep.name,
    ]);

    // Travel to closest rampart
    if (closestRampart && !closestRampart.pos.isEqualTo(creep.pos)) {
      creep.travelTo(closestRampart);
    }

    // Attack and heal
    const hostilesInRange = closestHostiles.filter(
      hostile => hostile.pos.getRangeTo(creep) <= 3
    );

    let attacked = false;
    if (hostilesInRange.length === 1) {
      creep.rangedAttack(hostilesInRange[0]);
      attacked = true;
    } else if (hostilesInRange.length > 1) {
      creep.rangedMassAttack();
      attacked = true;
    }

    if (creep.hits < creep.hitsMax) {
      creep.heal(creep);
    } else {
      const injuredFriendly = creep.pos
        .findInRange(FIND_MY_CREEPS, 3, {
          filter: crp => crp.hits < crp.hitsMax,
        })
        .sort((a, b) => a.hits - b.hits)[0];
      if (injuredFriendly) {
        if (creep.pos.getRangeTo(injuredFriendly) === 1) {
          creep.heal(injuredFriendly);
        } else if (!attacked) {
          creep.rangedHeal(injuredFriendly);
        }
      }
    }
  }
}
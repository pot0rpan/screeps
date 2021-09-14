import { excuse } from 'actions/excuse';
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
    if ((room.controller?.level ?? 0) < 4) return 0; // Not enough energy
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
    creep.notifyWhenAttacked(false);

    const task = creep.memory.task as RangedDefenderTask | undefined;

    if (!task || task.complete) {
      recycle(creep, 300);
      return;
    }

    const closestHostiles = creep.room
      .findHostiles()
      .filter(hostile => !hostile.pos.isNearEdge(3))
      .sort((a, b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep));

    if (!closestHostiles.length) {
      task.complete = true;
      return;
    }

    // Find closest open rampart to hostile that's walkable
    const closestRampart = closestHostiles[0].pos.findClosestWalkableRampart([
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
      creep.travelTo(closestHostiles[0], { maxRooms: 1 });
    }

    // Attack and heal
    const hostilesInRange = closestHostiles.filter(
      hostile => hostile.pos.getRangeTo(creep) <= 3
    );

    let attacked = false;

    if (hostilesInRange.length) {
      const hostilesInRmaRange = hostilesInRange.filter(
        hostile => hostile.pos.getRangeTo(creep) <= 2
      );

      if (hostilesInRmaRange.length > 1) {
        creep.rangedMassAttack();
        attacked = true;
      } else {
        creep.rangedAttack(hostilesInRange[0]);
        attacked = true;
      }
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

import { isFriendlyOwner } from 'utils';
import { sortByRange } from 'utils/sort';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';
import { recycle } from 'actions/recycle';

interface ExterminatorTask extends CreepTask {
  type: 'exterminate';
}

export class ExterminatorCreep extends CreepBase {
  role: CreepRole = 'exterminator';
  bodyOpts: BodySettings = {
    pattern: [
      MOVE, // 50
      MOVE, // 50
      MOVE, // 50
      ATTACK, // 80
      ATTACK, // 80
      HEAL, // 250
    ],
    ordered: true,
  };

  // When to back off due to number of dangerous hostiles in room
  private ABANDON_LIMIT = 3;

  // Number of dangerous hostiles + 1,
  // Or 2 if reserved by hostile and we want to colonize
  private targetNumPerRoom(roomName: string): number {
    const mem = Memory.rooms[roomName];

    // Make sure room has been scouted
    if (!mem) return 0;

    if (!mem.colonize) return 0;

    // We only reserve adjacent rooms, so an owner must be hostile and likely too powerful
    if (mem.owner) return 0;

    // Only defend rooms we're actively trying to use
    if (!mem.colonize) return 0;

    // If mem.hostiles is undefined or 0, keep it at 0
    // Filter out invaders, those are handled by other creeps
    const numHostiles = (mem.hostiles || 0) - (mem.invaders || 0);

    // Abandon room for now if too expensive to defend
    if (numHostiles > this.ABANDON_LIMIT) return 0;

    if (numHostiles > 0) {
      return numHostiles + 1;
    } else if (mem.reserver && !isFriendlyOwner(mem.reserver)) {
      return 2;
    }

    return 0;
  }

  // Harass any adjacent reserved rooms so we can expand
  targetNum(room: Room): number {
    // Don't attack unless we're powerful enough
    if ((room.controller?.level ?? 0) < 5) return 0;

    const { adjacentRoomNames } = global.empire.colonies[room.name];
    let num = 0;

    for (const roomName of adjacentRoomNames) {
      num += this.targetNumPerRoom(roomName);
    }

    return num;
  }

  isValidTask(creep: Creep, task: CreepTask): boolean {
    return !!this.targetNumPerRoom(task.room);
  }

  findTask(creep: Creep, taskManager: TaskManager): CreepTask | null {
    const { adjacentRoomNames } = global.empire.colonies[creep.memory.homeRoom];

    for (const roomName of adjacentRoomNames) {
      const numNeeded = this.targetNumPerRoom(roomName);

      if (
        numNeeded > 0 &&
        !taskManager.isTaskTaken(roomName, roomName, 'exterminate', numNeeded)
      ) {
        return taskManager.createTask(
          roomName,
          roomName,
          'exterminate',
          numNeeded
        );
      }
    }

    return null;
  }

  private guardController(creep: Creep): void {
    // Guard controller until recycle timer reaches 0
    if (recycle(creep, 100) && creep.room.controller) {
      creep.travelTo(creep.room.controller, { range: 5, ignoreRoads: true });
    }
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    const task = creep.memory.task as ExterminatorTask | undefined;

    // Handle moving to task room if not already there
    if (task && creep.room.name !== task.room) {
      // If still in home room
      if (creep.room.name === creep.memory.homeRoom) {
        const colony = global.empire.colonies[creep.memory.homeRoom];

        const { baseCenter } = colony.roomPlanner;

        // If far enough from spawn to not disrupt stuff
        // and still waiting on more squad mates
        if (
          baseCenter &&
          creep.pos.getRangeTo(baseCenter) > 10 &&
          (colony.taskManager.getTaskById(task.id)?.creeps.length ?? 0) <
            task.limit
        ) {
          creep.say('cmon');
        } else {
          // Full squad ready
          creep.travelToRoom(task.room);
          creep.say('leggo');
        }
      } else {
        // In some other room
        creep.travelToRoom(task.room);
        creep.say('coming');
      }

      return;
    }

    // Look for hostiles to attack
    let target: Creep | null = null;

    let dangerousHostiles = creep.room.findDangerousHostiles();

    // Update room memory
    creep.room.memory.hostiles = dangerousHostiles.length;

    // Filter out any creeps near an edge
    dangerousHostiles = dangerousHostiles
      .filter(hostile => !hostile.pos.isNearEdge(5))
      .sort(sortByRange(creep));

    // Most dangerous creep
    target = dangerousHostiles[0];

    // Potentially dangerous creep
    if (!target) {
      target = creep.room
        .findHostiles()
        .filter(hostile => !hostile.pos.isNearEdge(5))
        .sort(sortByRange(creep))[0];
    }

    // Civilians
    if (!target) {
      target = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
        filter: crp =>
          !isFriendlyOwner(crp.owner.username) && !crp.pos.isNearEdge(5),
      });
    }

    // Handle intents
    let healed = false;
    let rangedHealed = false;
    let attacked = false;
    let doingSomething = false;

    // Finds in room, so self may be in here
    const needHealing = creep.room
      .find(FIND_MY_CREEPS, {
        filter: crp => crp.hits < crp.hitsMax,
      })
      .sort((a, b) => a.hits - b.hits);

    if (target) {
      doingSomething = true;

      const range = creep.pos.getRangeTo(target);

      // If significantly injured, retreat and heal self
      if (creep.hits < creep.hitsMax * 0.75) {
        creep.say('heal self');
        creep.heal(creep);
        healed = true;

        // If in range of target, move away
        // Otherwise follow at a distance
        if (range <= 1) {
          creep.moveAway(target);
        } else if (range > 3) {
          creep.travelTo(target);
        }
      } else {
        // Pursue and attack
        // Always travelTo, so that if target moves we're still adjacent
        creep.travelTo(target);

        if (range > 1) {
          creep.say('grrr');
        } else {
          creep.attack(target);
          creep.say('attack');
        }
      }
    }

    if (!healed && needHealing.length) {
      const injuredNearSelf = [...needHealing].sort(sortByRange(creep))[0];
      const injuredNearSelfRange = creep.pos.getRangeTo(injuredNearSelf);

      if (doingSomething) {
        // Already pursuing a hostile, only heal in range
        if (injuredNearSelfRange <= 1) {
          creep.heal(injuredNearSelf);
        } else if (injuredNearSelfRange <= 3) {
          creep.rangedHeal(injuredNearSelf);
        }
      } else {
        // No target to pursue or attack, so pursue and heal most damaged friendly
        doingSomething = true;

        // Travel to most injured
        const mostInjured = needHealing[0];

        const range = creep.pos.getRangeTo(mostInjured);

        if (range > 1) {
          // mostInjured must be a friendly, not self
          creep.travelTo(mostInjured, {
            range: 1,
            movingTarget: !!mostInjured.getActiveBodyparts(MOVE),
          });

          // Heal injured creeps near me (may be self)
          if (injuredNearSelfRange <= 3) {
            if (injuredNearSelfRange <= 1) {
              creep.heal(injuredNearSelf);
              healed = true;
            } else {
              creep.rangedHeal(injuredNearSelf);
              rangedHealed = true;
            }
          }
        } else {
          // Adjacent to most injured friendly (or maybe self)
          creep.heal(mostInjured);
          healed = true;
        }
      }
    }

    if (!doingSomething) {
      this.guardController(creep);
    }
  }
}

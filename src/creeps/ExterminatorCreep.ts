import { isFriendlyOwner, isNthTick } from 'utils';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';
import config from 'config';

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

  private MAX_PER_ROOM = 2;
  private ABANDON_LIMIT = 5;

  // Harass any adjacent reserved rooms so we can expand
  targetNum(room: Room): number {
    // Don't attack unless we're powerful enough
    if ((room.controller?.level ?? 0) < 5) return 0;

    const { adjacentRoomNames } = global.empire.colonies[room.name];
    let num = 0;

    for (const roomName of adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (!mem || !mem.colonize) continue;

      const numHostiles = mem.hostiles ?? 0;

      // Abandon room for now if too expensive to defend
      if (numHostiles > this.ABANDON_LIMIT) continue;

      // Defend rooms with few or no hostiles
      // or reserved by hostile, since that's likely to be attacked
      if (numHostiles > 0 || (mem.reserver && !isFriendlyOwner(mem.reserver))) {
        num++;
      }
    }

    return num * 2;
  }

  isValidTask(creep: Creep, task: CreepTask): boolean {
    // Not in room, assume valid
    if (creep.room.name !== task.room) return true;

    // Check if reserved by someone else or me
    if (
      creep.room.controller?.reservation &&
      (!isFriendlyOwner(creep.room.controller.reservation.username) ||
        creep.room.controller.reservation.username === config.USERNAME)
    ) {
      return true;
    }

    // Check for any hostiles
    if (creep.room.find(FIND_HOSTILE_CREEPS).length) return true;

    return false;
  }

  findTask(creep: Creep, taskManager: TaskManager): CreepTask | null {
    const { adjacentRoomNames } = global.empire.colonies[creep.memory.homeRoom];

    for (const roomName of adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (
        mem &&
        !mem.owner &&
        mem.colonize &&
        // (!mem.reserver || mem.reserver === config.USERNAME) &&
        !taskManager.isTaskTaken(roomName, roomName, 'exterminate')
      ) {
        return taskManager.createTask(
          roomName,
          roomName,
          'exterminate',
          this.MAX_PER_ROOM
        );
      }
    }

    return null;
  }

  run(creep: Creep): void {
    const task = creep.memory.task as ExterminatorTask | undefined;
    let healedSelf = false;

    // Always heal, gets cancelled if attacking
    if (creep.hits < creep.hitsMax) {
      creep.heal(creep);
      healedSelf = true;
    }

    if (!task) {
      creep.say('...');
      return;
    }

    if (creep.room.name !== task.room) {
      // If in home room still
      if (creep.room.name === creep.memory.homeRoom) {
        const colony = global.empire.colonies[creep.room.name];

        // If far enough from spawn to not disrupt stuff
        const { baseCenter } = colony.roomPlanner;
        if (
          baseCenter &&
          creep.pos.getRangeTo(baseCenter) > 10 &&
          (colony.taskManager.getTaskById(task.id)?.creeps.length ?? 0) <
            this.MAX_PER_ROOM
        ) {
          // If only exterminator assigned to task room, wait for more
          creep.say('cmon');
          return;
        } else {
          // Full squad ready
          creep.travelTo(new RoomPosition(25, 25, task.room), { range: 10 });
          creep.say('leggo');
          return;
        }
      } else {
        // Must be in other adjacent room
        creep.travelTo(new RoomPosition(25, 25, task.room), { range: 10 });
        return;
      }
    }

    let target: Creep | null = null;

    const dangerousHostiles = creep.room
      .findHostiles()
      .filter(hostile => !hostile.pos.isNearEdge(2))
      .sort((a, b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep));
    creep.room.memory.hostiles = dangerousHostiles.length;

    // Most dangerous creeps
    target = dangerousHostiles.filter(
      hostile =>
        !hostile.getActiveBodyparts(WORK) && !hostile.getActiveBodyparts(CLAIM)
    )[0];

    // Potentially dangerous creep
    if (!target) {
      target = dangerousHostiles[0];
    }

    // Civilians
    if (!target) {
      target = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
        filter: crp => !isFriendlyOwner(crp.owner.username),
      });
    }

    if (!target) {
      creep.say('...');
      creep.room.memory.hostiles = 0;
      return;

      // TODO: heal any friendlies in the room
    }

    const range = creep.pos.getRangeTo(target);
    if (range <= 1 && creep.getActiveBodyparts(ATTACK)) {
      // Attack if in range
      creep.cancelOrder('heal');
      creep.attack(target);
    } else {
      // If not close or healed enough, pursue
      if (range > 3 || creep.hits > creep.hitsMax * 0.75) {
        creep.travelTo(target, { range: 1, maxRooms: 1, movingTarget: true });
      }

      // If didn't heal self this tick, heal friendlies
      if (!healedSelf) {
        const closestFriendly = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
          filter: crp => crp.hits < crp.hitsMax,
        });
        if (closestFriendly) {
          const range = creep.pos.getRangeTo(closestFriendly);
          if (range === 1) {
            creep.heal(closestFriendly);
          } else if (range <= 3) {
            creep.rangedHeal(closestFriendly);
          }
        }
      }
    }
  }
}

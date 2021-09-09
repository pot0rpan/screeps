import config from 'config';
import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface AssassinTask extends CreepTask {
  type: 'assassinate';
}

// Assassin creeps take out invaders in adjacent colonized rooms,
// Or invader cores in adjacent rooms reserved by Invader so we _can_ colonize
export class AssassinCreep extends CreepBase {
  role: CreepRole = 'assassin';
  bodyOpts: BodySettings = {
    pattern: [MOVE, ATTACK],
    suffix: [RANGED_ATTACK, MOVE],
    ordered: true,
    sizeLimit: 5,
  };

  // If colonized (remote mining) and there's an invader,
  // Or reserved by invader - take out Invader Core
  private targetNumPerRoom(roomName: string): number {
    const mem = Memory.rooms[roomName];
    if (
      mem &&
      ((mem.colonize && mem.invaders && mem.reserver === config.USERNAME) ||
        (mem.reserver === 'Invader' && (mem.reservationTicks ?? 0) >= 4990))
    ) {
      return mem.invaders || 1;
    }
    return 0;
  }

  targetNum(room: Room): number {
    const { adjacentRoomNames } = global.empire.colonies[room.name];
    let num = 0;

    for (const roomName of adjacentRoomNames) {
      num += this.targetNumPerRoom(roomName);
    }

    return num;
  }

  isValidTask(creep: Creep, task: AssassinTask): boolean {
    return !!this.targetNumPerRoom(task.room);
  }

  findTask(creep: Creep, taskManager: TaskManager): AssassinTask | null {
    const { adjacentRoomNames } = global.empire.colonies[creep.memory.homeRoom];

    for (const roomName of adjacentRoomNames) {
      if (!this.targetNumPerRoom(roomName)) continue;
      const mem = Memory.rooms[roomName];

      // Take out invaders/invader core
      if (
        (mem.invaders || mem.reserver === 'Invader') &&
        !taskManager.isTaskTaken(
          roomName,
          roomName,
          'assassinate',
          mem.invaders || 1
        )
      ) {
        return taskManager.createTask<AssassinTask>(
          roomName,
          roomName,
          'assassinate',
          mem.invaders || 1
        );
      }
    }

    return null;
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    const task = creep.memory.task as AssassinTask | undefined;

    // Handle moving to task room if not already there
    if (task && creep.room.name !== task.room) {
      creep.travelToRoom(task.room);
      creep.say(task.room);
    } else {
      // Target either
      let target: Creep | AnyOwnedStructure | null =
        creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
          filter: hostile => hostile.owner.username === 'Invader',
        });

      if (!target) {
        target = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES);
      }

      if (target) {
        creep.travelTo(target, {
          range: target instanceof Creep ? undefined : 1,
        });
        const range = creep.pos.getRangeTo(target);

        if (range === 1 && creep.getActiveBodyparts(ATTACK)) {
          creep.attack(target);
        } else if (range <= 3 && creep.getActiveBodyparts(RANGED_ATTACK)) {
          creep.rangedAttack(target);
        }
      } else {
        if (task) task.complete = true;
        creep.room.memory.invaders = 0;
        creep.room.memory.hostiles = Math.max(
          0,
          creep.room.memory.hostiles! - 1
        );
        recycle(creep, 10);
      }
    }
  }
}

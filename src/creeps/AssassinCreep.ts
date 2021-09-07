import config from 'config';
import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface AssassinTask extends CreepTask {
  type: 'assassinate';
}

// Assassin creeps take out invaders in adjacent colonized rooms
export class AssassinCreep extends CreepBase {
  role: CreepRole = 'assassin';
  bodyOpts: BodySettings = {
    pattern: [MOVE, ATTACK],
    suffix: [RANGED_ATTACK, MOVE],
    ordered: true,
    sizeLimit: 5,
  };

  private targetNumPerRoom(roomName: string): number {
    const mem = Memory.rooms[roomName];
    if (
      mem &&
      mem.colonize &&
      mem.invaders &&
      (!mem.reserver || mem.reserver === config.USERNAME)
    ) {
      return mem.invaders;
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

      // Take out invaders
      if (
        mem.invaders &&
        !taskManager.isTaskTaken(
          roomName,
          roomName,
          'assassinate',
          mem.invaders
        )
      ) {
        return taskManager.createTask<AssassinTask>(
          roomName,
          roomName,
          'assassinate',
          mem.invaders
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
      const invader = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
        filter: hostile => hostile.owner.username === 'Invader',
      });

      if (invader) {
        creep.travelTo(invader);
        const range = creep.pos.getRangeTo(invader);
        if (range === 1 && creep.getActiveBodyparts(ATTACK)) {
          creep.attack(invader);
        } else if (range <= 3 && creep.getActiveBodyparts(RANGED_ATTACK)) {
          creep.rangedAttack(invader);
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

import config from 'config';
import { TaskManager } from 'TaskManager';
import { isFriendlyOwner } from 'utils';
import { BodySettings, CreepBase } from './CreepBase';

interface ReserverTask extends CreepTask {
  type: 'reserve';
}

export class ReserverCreep extends CreepBase {
  role: CreepRole = 'reserver';
  bodyOpts: BodySettings = {
    pattern: [MOVE, CLAIM],
    ordered: true,
  };

  private targetNumPerRoom(roomName: string): number {
    const mem = Memory.rooms[roomName];

    if (!mem) return 0;
    if (!mem.colonize) return 0;
    if (!mem.controller) return 0;

    // If no hostiles
    // and not reserved
    // or reserved by hostile and have Exterminator creeps
    // or not visible or reserved by me and is close to downgrading
    if (
      !mem.hostiles &&
      (!mem.reserver ||
        (!isFriendlyOwner(mem.reserver) &&
          _.filter(Game.creeps, crp => crp.memory.role === 'exterminator')
            .length) ||
        (mem.reserver === config.USERNAME &&
          (Game.rooms[roomName]?.controller?.reservation?.ticksToEnd ?? 0) <
            config.ticks.RCL_DOWNGRADE))
    ) {
      return 1;
    }

    return 0;
  }

  targetNum(room: Room): number {
    let num = 0;
    const { adjacentRoomNames } = global.empire.colonies[room.name];

    for (const roomName of adjacentRoomNames) {
      num += this.targetNumPerRoom(roomName);
    }

    return num;
  }

  isValidTask(creep: Creep, task: ReserverTask): boolean {
    return !!this.targetNumPerRoom(task.room);
  }

  findTask(creep: Creep, taskManager: TaskManager): ReserverTask | null {
    for (const roomName of global.empire.colonies[creep.memory.homeRoom]
      .adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (
        this.targetNumPerRoom(roomName) &&
        mem.controller &&
        !taskManager.isTaskTaken(roomName, mem.controller.id, 'reserve')
      ) {
        return taskManager.createTask<ReserverTask>(
          roomName,
          mem.controller.id,
          'reserve',
          1
        );
      }
    }
    return null;
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    if (creep.memory.task) {
      const task = creep.memory.task;

      if (creep.room.name !== task.room) {
        creep.travelToRoom(task.room);
        return;
      }

      const controller = Game.getObjectById(
        task.target as Id<StructureController>
      );

      if (!controller) {
        creep.memory.task.complete = true;
        return;
      }

      if (creep.pos.getRangeTo(controller.pos.x, controller.pos.y) === 1) {
        if (
          controller.reservation &&
          controller.reservation.username !== config.USERNAME
        ) {
          creep.attackController(controller);
        } else {
          creep.reserveController(controller);
          creep.room.memory.reserver = config.USERNAME;
          if (controller.sign?.username !== config.USERNAME) {
            creep.signController(controller, '«ᴍɪɴᴇ»');
          }
        }
      } else {
        creep.travelTo(controller, { range: 1 });
      }
    } else {
      // Recycle
      creep.say('recycle');
    }
  }
}

import config from 'config';
import { TaskManager } from 'TaskManager';
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

  targetNum(room: Room): number {
    let num = 0;

    for (const roomName of global.empire.colonies[room.name]
      .adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (mem.colonize && mem.controller && mem.reserver !== config.USERNAME) {
        num++;
      }
    }

    return num;
  }

  isValidTask(creep: Creep, task: ReserverTask): boolean {
    if (creep.room.name !== task.room) return true;
    if (Game.getObjectById(task.target as Id<StructureController>)?.my)
      return false;
    return true;
  }

  findTask(creep: Creep, taskManager: TaskManager): ReserverTask | null {
    for (const roomName of global.empire.colonies[creep.memory.homeRoom]
      .adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (mem.colonize && mem.controller && mem.reserver !== config.USERNAME) {
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
    if (creep.memory.task) {
      const task = creep.memory.task;

      if (creep.room.name !== task.room) {
        creep.travelTo(new RoomPosition(25, 25, task.room));
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

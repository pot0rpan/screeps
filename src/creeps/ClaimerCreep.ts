import { recycle } from 'actions/recycle';
import config from 'config';
import { TaskManager } from 'TaskManager';
import { isFlagOfType } from 'utils/flag';
import { BodySettings, CreepBase } from './CreepBase';

interface ClaimerTask extends CreepTask {
  type: 'claim';
  target: Id<Flag>;
}

export class ClaimerCreep extends CreepBase {
  role: CreepRole = 'claimer';
  bodyOpts: BodySettings = {
    pattern: [MOVE, CLAIM],
  };

  private findFlags(room: Room): Flag[] {
    if ((room.controller?.level ?? 0) < 4) return [];

    return _.filter(
      Game.flags,
      flag =>
        flag.pos.roomName !== room.name &&
        isFlagOfType(flag, 'COLONIZE') &&
        Memory.rooms[flag.pos.roomName]?.owner !== config.USERNAME &&
        Game.map.getRoomLinearDistance(room.name, flag.pos.roomName) <= 5
    );
  }

  // Moves to target room and claims controller, attacks it first if necessary
  targetNum(room: Room): number {
    return this.findFlags(room).length;
  }

  isValidTask(creep: Creep, task: ClaimerTask): boolean {
    return (
      !!Game.flags[task.target] &&
      Memory.rooms[task.room]?.owner !== config.USERNAME
    );
  }

  findTask(creep: Creep, taskManager: TaskManager): ClaimerTask | null {
    const flags = this.findFlags(Game.rooms[creep.memory.homeRoom]);

    for (const flag of flags) {
      if (!taskManager.isTaskTaken(flag.pos.roomName, flag.name, 'claim')) {
        return taskManager.createTask<ClaimerTask>(
          flag.pos.roomName,
          flag.name,
          'claim',
          1
        );
      }
    }

    return null;
  }

  run(creep: Creep): void {
    const task = creep.memory.task as ClaimerTask | undefined;
    if (!task) {
      recycle(creep, 50);
      return;
    }

    if (creep.room.name !== task.room) {
      if (creep.room.findDangerousHostiles().length) {
        creep.room.memory.avoid = 1;
        delete creep.memory._trav;
        creep.travelToRoom(creep.memory.homeRoom);
        creep.say('nope');
      } else {
        creep.say(task.room);
        creep.travelToRoom(task.room, { allowHostile: false });
      }
      return;
    }

    const controller = creep.room.controller;
    if (!controller) {
      task.complete = true;
      return;
    }

    if (creep.pos.getRangeTo(controller) > 1) {
      creep.travelTo(controller);
      return;
    }

    if (
      (controller.owner && controller.owner.username !== config.USERNAME) ||
      (controller.reservation &&
        controller.reservation.username !== config.USERNAME)
    ) {
      creep.attackController(controller);
    } else if (controller.owner?.username === config.USERNAME) {
      creep.room.memory.owner = config.USERNAME;
      creep.say('peace');
      creep.suicide();
    } else {
      creep.claimController(controller);
      if (
        controller.sign?.username !== config.USERNAME ||
        controller.sign?.text !== config.signs.CLAIM
      ) {
        creep.signController(controller, config.signs.CLAIM);
      }
    }
  }
}

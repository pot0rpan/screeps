import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';
import { recycle } from 'actions/recycle';

interface DrainerTask extends CreepTask {
  type: 'drain';
}

// Drainers follow cyan flags in adjacent rooms to drain tower energy
// Mostly used for manual harassing to be able to expand
export class DrainerCreep extends CreepBase {
  role: CreepRole = 'drainer';
  bodyOpts: BodySettings = {
    prefix: [ATTACK], // May be needed to make towers attack
    pattern: [MOVE, HEAL],
    suffix: [MOVE],
  };

  private findFlags(room: Room): Flag[] {
    const adjacentRoomNames =
      global.empire.colonies[room.name].adjacentRoomNames;

    return _.filter(
      Game.flags,
      flag =>
        flag.color === COLOR_CYAN &&
        adjacentRoomNames.includes(flag.pos.roomName)
    );
  }

  targetNum(room: Room): number {
    return this.findFlags(room).length;
  }

  isValidTask(creep: Creep, task: DrainerTask): boolean {
    return !!Game.flags[task.target];
  }

  findTask(creep: Creep, taskManager: TaskManager): DrainerTask | null {
    const flags = this.findFlags(Game.rooms[creep.memory.homeRoom]);

    if (!flags) return null;

    for (const flag of flags) {
      if (!taskManager.isTaskTaken(flag.pos.roomName, flag.name, 'drain')) {
        return taskManager.createTask<DrainerTask>(
          flag.pos.roomName,
          flag.name,
          'drain'
        );
      }
    }

    return null;
  }

  run(creep: Creep): void {
    const task = creep.memory.task as DrainerTask;

    // Always heal
    creep.heal(creep);

    if (!task) {
      // If in different room or home room but still near edge, travel
      if (
        creep.room.name !== creep.memory.homeRoom ||
        creep.pos.isNearEdge(4)
      ) {
        creep.travelToRoom(creep.memory.homeRoom);
      } else {
        recycle(creep, 40);
      }
      return;
    }

    // Retreat if injured
    if (creep.hits < creep.hitsMax) {
      // Move to home room if not there or could bounce on exit
      if (
        creep.room.name !== creep.memory.homeRoom ||
        creep.pos.isNearEdge(2)
      ) {
        creep.travelToRoom(creep.memory.homeRoom);
      }

      return;
    }

    // Move to flag and drain towers
    creep.travelTo(Game.flags[task.target]);
  }
}

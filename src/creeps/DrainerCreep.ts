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
    pattern: [MOVE, HEAL],
    suffix: [ATTACK, MOVE],
    ordered: true,
  };

  private RETREAT_HEALTH = 0.8;

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
          'drain',
          1
        );
      }
    }

    return null;
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    const task = creep.memory.task as DrainerTask;

    // Always heal
    if (creep.hits < creep.hitsMax) {
      creep.heal(creep);
    } else {
      const injuredNearSelf = creep.pos
        .findInRange(FIND_MY_CREEPS, 3, {
          filter: crp => crp.hits < crp.hitsMax,
        })
        .sort((a, b) => a.hits - b.hits)[0];

      if (injuredNearSelf) {
        if (creep.pos.getRangeTo(injuredNearSelf) > 1) {
          creep.rangedHeal(injuredNearSelf);
        } else {
          creep.heal(injuredNearSelf);
        }
      }
    }

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

    if (
      creep.memory.working &&
      creep.hits < creep.hitsMax * this.RETREAT_HEALTH
    ) {
      creep.memory.working = false;
    } else if (!creep.memory.working && creep.hits === creep.hitsMax) {
      creep.memory.working = true;
    }

    if (creep.memory.working) {
      // Move to flag and drain towers
      creep.travelTo(Game.flags[task.target]);
    } else {
      // Retreat to heal
      // Move to home room if not there or could bounce on exit
      // Otherwise do nothing and just heal
      if (
        creep.room.name !== creep.memory.homeRoom ||
        creep.pos.isNearEdge(1)
      ) {
        creep.travelToRoom(creep.memory.homeRoom);
      }
    }
  }
}

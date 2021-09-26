import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';
import { AttackerCreep, AttackerTask } from './AttackerCreep';
import { recycle } from 'actions/recycle';

export interface HealerTask extends CreepTask {
  type: 'heal';
  data: { attacker: string };
}

export class HealerCreep extends CreepBase {
  role: CreepRole = 'healer';
  bodyOpts: BodySettings = {
    pattern: [MOVE, HEAL],
    ordered: true,
    suffix: [MOVE],
  };

  // Same number as attackers
  targetNum(room: Room): number {
    return AttackerCreep.findPairAttackFlags(room.name).length;
  }

  isValidTask(creep: Creep, task: HealerTask): boolean {
    if (!Game.flags[task.target]) return false;
    if (!task.data.attacker || !Game.creeps[task.data.attacker]) return false;
    if (Game.flags[task.target].pos.roomName !== task.room) return false;
    return true;
  }

  findTask(creep: Creep, taskManager: TaskManager): HealerTask | null {
    const colonyCreeps =
      global.empire.colonies[creep.memory.homeRoom].getColonyCreeps();

    // Look for available attacker
    // One without a task, or a task assigned with this healer
    const availableAttacker = colonyCreeps.find(
      crp =>
        crp.memory.role === 'attacker' &&
        (!crp.memory.task ||
          (crp.memory.task as AttackerTask).data?.healer === creep.name)
    );

    if (!availableAttacker) return null;

    for (const flag of AttackerCreep.findPairAttackFlags(
      creep.memory.homeRoom
    )) {
      if (!taskManager.isTaskTaken(flag.pos.roomName, flag.name, 'heal')) {
        return taskManager.createTask<HealerTask>(
          flag.pos.roomName,
          flag.name,
          'heal',
          1,
          { attacker: availableAttacker.name }
        );
      }
    }
    return null;
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    const task = creep.memory.task as HealerTask | undefined;

    // If no task, recycle
    if (!task) {
      recycle(
        creep,
        this.targetNum(Game.rooms[creep.memory.homeRoom]) ? 500 : 20
      );
      return;
    }

    // If no attacker, go to home room and wait
    if (!task.data.attacker || !Game.creeps[task.data.attacker]) {
      // Wait for attacker
      task.complete = true;
      return;
    }

    const attacker = Game.creeps[task.data.attacker];
    const rangeToAttacker = creep.pos.getRangeTo(attacker);

    // If attacker is spawning,
    // or creep is in home room and attacker isn't close
    // move to open rampart and wait
    if (attacker.spawning) {
      if (
        creep.room.name !== creep.memory.homeRoom ||
        creep.pos.isNearEdge(3)
      ) {
        creep.travelToRoom(creep.memory.homeRoom);
      }
      return;
    }

    creep.travelTo(attacker);

    if (rangeToAttacker === 1) {
      creep.heal(attacker);
    } else if (rangeToAttacker <= 3) {
      creep.rangedHeal(attacker);
    } else {
      creep.heal(creep);
    }
  }
}

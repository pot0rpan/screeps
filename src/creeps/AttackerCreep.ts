import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { isFriendlyOwner } from 'utils';
import { getFatiguedInSquad } from 'utils/creep';
import { isInColonyHelpRange } from 'utils/room';
import { BodySettings, CreepBase } from './CreepBase';
import { HealerTask } from './HealerCreep';

export interface AttackerTask extends CreepTask {
  type: 'attack';
  data: { healer: string };
}

export class AttackerCreep extends CreepBase {
  role: CreepRole = 'attacker';
  bodyOpts: BodySettings = {
    pattern: [ATTACK, MOVE, ATTACK],
    ordered: true,
    suffix: [MOVE],
  };

  public static findPairAttackFlags(roomName: string): Flag[] {
    // Make sure colony is strong enough to help attack
    if ((Game.rooms[roomName].controller?.level ?? 0) < 4) return [];

    return _.filter(
      Game.flags,
      flag =>
        flag.color === COLOR_RED &&
        flag.secondaryColor === COLOR_GREEN &&
        isInColonyHelpRange(roomName, flag.pos.roomName)
    );
  }

  targetNum(room: Room): number {
    return AttackerCreep.findPairAttackFlags(room.name).length;
  }

  isValidTask(creep: Creep, task: AttackerTask): boolean {
    if (!Game.flags[task.target]) return false;
    if (!task.data.healer || !Game.creeps[task.data.healer]) return false;
    return true;
  }

  findTask(creep: Creep, taskManager: TaskManager): AttackerTask | null {
    const colonyCreeps =
      global.empire.colonies[creep.memory.homeRoom].getColonyCreeps();

    // Look for available healer
    // One without a task, or a task assigned with this attacker
    const availableHealer = colonyCreeps.filter(
      crp =>
        crp.memory.role === 'healer' &&
        (!crp.memory.task ||
          (crp.memory.task as HealerTask).data.attacker === creep.name)
    )[0];

    if (!availableHealer) return null;

    for (const flag of AttackerCreep.findPairAttackFlags(
      creep.memory.homeRoom
    )) {
      if (!taskManager.isTaskTaken(flag.pos.roomName, flag.name, 'attack')) {
        return taskManager.createTask<AttackerTask>(
          flag.pos.roomName,
          flag.name,
          'attack',
          1,
          { healer: availableHealer.name }
        );
      }
    }
    return null;
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    const task = creep.memory.task as AttackerTask | undefined;

    // If no task, recycle
    if (!task) {
      recycle(
        creep,
        this.targetNum(Game.rooms[creep.memory.homeRoom]) ? 500 : 20
      );
      return;
    }

    // If no healer, go to home room and wait
    if (!Game.creeps[task.data.healer]) {
      // Wait for healer
      task.complete = true;
      return;
    }

    const healer = Game.creeps[task.data.healer];
    const rangeToHealer = creep.pos.getRangeTo(healer);

    // If healer is spawning move to open rampart and wait
    if (healer.spawning) {
      const ramp = creep.pos.findClosestWalkableRampart([creep.name]);
      if (ramp) creep.travelTo(ramp);
      return;
    }

    // Handle priority movement
    let moved = false;
    const fatigued = getFatiguedInSquad([creep, healer])[0];

    // Wait/move to fatigued
    if (fatigued && fatigued !== creep) {
      if (creep.pos.getRangeTo(fatigued) > 1) {
        creep.travelTo(fatigued);
      }
      moved = true;
    } else if (rangeToHealer > 1 && !creep.pos.isNearEdge(2)) {
      creep.travelTo(healer);
      moved = true;
    }

    if (
      !moved &&
      creep.room.name !== task.room &&
      creep.hits === creep.hitsMax
    ) {
      // Travel to flag room
      creep.travelToRoom(task.room);
      creep.say(task.room);
      return;
    }

    // Retreat if healer can't keep up
    if (creep.hits < creep.hitsMax * 0.8) {
      creep.travelToRoom(creep.memory.homeRoom);
      creep.say('nope');
      return;
    }

    // If in range of hostiles on a rampart, move away
    const closeHostilesOnRamparts = creep.pos.findInRange(
      FIND_HOSTILE_CREEPS,
      3,
      {
        filter: crp => {
          if (
            crp.pos
              .lookFor(LOOK_STRUCTURES)
              .filter(
                struct =>
                  struct.structureType === STRUCTURE_RAMPART &&
                  !isFriendlyOwner((struct as StructureRampart).owner.username)
              ).length
          ) {
            if (
              crp.getActiveBodyparts(RANGED_ATTACK) ||
              (creep.pos.getRangeTo(crp) === 1 &&
                crp.getActiveBodyparts(ATTACK))
            ) {
              return true;
            }
          }
          return false;
        },
      }
    );
    if (closeHostilesOnRamparts.length) {
      creep.moveAway(closeHostilesOnRamparts[0]);
      moved = true;
    }

    // Handle combat
    let target: Creep | AnyOwnedStructure | null = null;

    target = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {
      filter: hostile =>
        hostile.isHostile() &&
        hostile.isDangerous() &&
        !hostile.pos.isNearEdge(5),
    });

    // Potentially dangerous creep
    if (!target) {
      target = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {
        filter: hostile => hostile.isHostile() && !hostile.pos.isNearEdge(5),
      });
    }

    // Civilians
    if (!target) {
      target = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {
        filter: crp =>
          !isFriendlyOwner(crp.owner.username) && !crp.pos.isNearEdge(5),
      });
    }

    // Structures
    if (!target) {
      target = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES);
    }

    // Nothing to attack?
    if (!target) {
      if (!moved) {
        recycle(creep, 500);
      }
      return;
    }

    if (!moved) {
      if (target instanceof Creep) {
        creep.travelTo(target);
      } else {
        creep.travelTo(target, { range: 1 });
      }
    }

    creep.attack(target);
  }
}

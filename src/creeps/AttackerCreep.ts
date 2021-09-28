import { isFriendlyOwner } from 'utils';
import { getFatiguedInSquad } from 'utils/creep';
import { isFlagOfType } from 'utils/flag';
import { isInColonyHelpRange } from 'utils/room';
import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';
import { HealerTask } from './HealerCreep';

export interface AttackerTask extends CreepTask {
  type: 'attack';
  data: SingleAttackData | PairAttackData;
}

type SingleAttackData = undefined;
type PairAttackData = { healer: string };

export class AttackerCreep extends CreepBase {
  role: CreepRole = 'attacker';
  bodyOpts: BodySettings = {
    pattern: [ATTACK, MOVE, ATTACK, MOVE],
    ordered: true,
  };

  public static findPairAttackFlags(roomName: string): Flag[] {
    // Make sure colony is strong enough to help attack
    if ((Game.rooms[roomName].controller?.level ?? 0) < 4) return [];

    return _.filter(
      Game.flags,
      flag =>
        isFlagOfType(flag, 'PAIR_ATTACK') &&
        isInColonyHelpRange(roomName, flag.pos.roomName)
    );
  }

  private findAttackFlags(roomName: string): Flag[] {
    // Make sure colony is strong enough to help attack
    if ((Game.rooms[roomName].controller?.level ?? 0) < 4) return [];

    return _.filter(
      Game.flags,
      flag =>
        isFlagOfType(flag, 'ATTACK') &&
        isInColonyHelpRange(roomName, flag.pos.roomName)
    );
  }

  targetNum(room: Room): number {
    return (
      this.findAttackFlags(room.name).length +
      AttackerCreep.findPairAttackFlags(room.name).length
    );
  }

  isValidTask(creep: Creep, task: AttackerTask): boolean {
    if (!Game.flags[task.target]) return false;
    if (task.data && (!task.data.healer || !Game.creeps[task.data.healer]))
      return false;
    if (Game.flags[task.target].pos.roomName !== task.room) return false;
    return true;
  }

  findTask(creep: Creep, taskManager: TaskManager): AttackerTask | null {
    const colonyCreeps =
      global.empire.colonies[creep.memory.homeRoom].getColonyCreeps();

    // Single Attacker flag
    for (const flag of this.findAttackFlags(creep.memory.homeRoom)) {
      if (!taskManager.isTaskTaken(flag.pos.roomName, flag.name, 'attack')) {
        return taskManager.createTask<AttackerTask>(
          flag.pos.roomName,
          flag.name,
          'attack',
          1
        );
      }
    }

    // Attacker/Healer pair flags
    // Look for available healer
    // One without a task, or a task assigned with this attacker
    const availableHealer = colonyCreeps.find(
      crp =>
        crp.memory.role === 'healer' &&
        (!crp.memory.task ||
          (crp.memory.task as HealerTask).data.attacker === creep.name)
    );

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

    let moved = false;

    // Only handle moving with healer if task.data is defined
    if (task.data) {
      // If no healer, go to home room and wait
      if (!Game.creeps[task.data!.healer]) {
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
    }

    if (
      !moved &&
      creep.room.name !== task.room &&
      creep.hits === creep.hitsMax
    ) {
      // Travel to flag room
      creep.travelToRoom(task.room, { preferHighway: true });
      creep.say(task.room);
      return;
    }

    if (creep.room.controller?.safeMode) {
      const flag = Game.flags[task.target];
      if (flag) flag.remove();
      task.complete = true;
      return;
    }

    if (task.data && creep.hits < creep.hitsMax * 0.8) {
      // Retreat if healer can't keep up
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
      target = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {
        filter: struct =>
          struct.hits !== undefined && // Controller (and other indestructible structures?)
          struct.structureType !== STRUCTURE_STORAGE &&
          struct.structureType !== STRUCTURE_TERMINAL &&
          struct.structureType !== STRUCTURE_LAB &&
          struct.structureType !== STRUCTURE_FACTORY,
      });
    }

    // Remove flag if nothing left to attack
    if (!target) {
      const flag = Game.flags[task.target];
      if (flag) flag.remove();
      task.complete = true;
      return;
    }

    if (!moved) {
      if (target instanceof Creep) {
        creep.travelTo(target, { movingTarget: true, repath: 0.5 });
      } else {
        creep.travelTo(target, { range: 1 });
      }
    }

    creep.attack(target);
  }
}

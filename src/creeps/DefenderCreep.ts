import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface DefenderTask extends CreepTask {
  type: 'attack' | 'patrol';
}

// Defenders can't spawn until RCL 3 due to body size
export class DefenderCreep extends CreepBase {
  role: CreepRole = 'defender';
  bodyOpts: BodySettings = {
    ordered: true,
    pattern: [
      // Total 750
      TOUGH, // 20
      TOUGH,
      MOVE, // 250
      MOVE,
      MOVE,
      MOVE,
      MOVE,
      ATTACK, // 80
      RANGED_ATTACK, // 150
      HEAL, // 250
    ],
  };

  targetNum(room: Room): number {
    return (room.controller?.level ?? 0) >= 3 && room.memory.defcon ? 5 : 0;
  }

  findTask(creep: Creep, taskManager: TaskManager) {
    if (creep.room.memory.defcon) {
      // Attack tasks simply target closest hostile every tick
      return taskManager.createTask(creep.room.name, '', 'attack');
    } else {
      // Find rampart closest to hostiles
      // Must not have a creep on it or be on a road
      const closestRampart = creep.pos.findClosestByRange<StructureRampart>(
        FIND_MY_STRUCTURES,
        {
          filter: struct =>
            struct.structureType === STRUCTURE_RAMPART &&
            !struct.pos
              .lookFor(LOOK_STRUCTURES)
              .filter(struct => struct.structureType === STRUCTURE_ROAD) &&
            !taskManager.isTaskTaken(creep.room.name, struct.id, 'patrol'),
        }
      );

      if (!closestRampart) return null; // TODO: recycle creep

      return taskManager.createTask(
        creep.room.name,
        closestRampart.id,
        'patrol',
        1
      );
    }
  }

  isValidTask(creep: Creep, task: DefenderTask): boolean {
    if (task.type === 'attack' && !creep.room.memory.defcon) {
      return false;
    } else {
      if (creep.room.memory.defcon) {
        return false;
      }

      const rampart = Game.getObjectById(task.id as Id<StructureRampart>);

      if (
        !rampart ||
        rampart.pos.lookFor(LOOK_CREEPS).filter(crp => crp.name !== creep.name)
          .length
      ) {
        return false;
      }
    }
    return true;
  }

  run(creep: Creep): void {
    if (!creep.memory.task || creep.memory.task.complete) return;

    const task = creep.memory.task as DefenderTask;

    if (task.type === 'attack') {
      const hasRanged = !!creep.getActiveBodyparts(RANGED_ATTACK);

      const closestHostile = creep.room
        .findHostiles()
        .sort((a, b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep))[0];

      if (!closestHostile) {
        creep.memory.task.complete = true;
        return;
      }

      const closestRampart =
        closestHostile.pos.findClosestByRange<StructureRampart>(
          FIND_MY_STRUCTURES,
          {
            filter: struct =>
              struct.structureType === STRUCTURE_RAMPART &&
              !struct.pos.lookFor(LOOK_CREEPS).length,
          }
        );

      const distance = creep.pos.getRangeTo(closestHostile);

      // Heal self, attack, or move to closest rampart to hostile
      if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
      } else if (distance === 1 && creep.getActiveBodyparts(ATTACK)) {
        creep.attack(closestHostile);
      } else if (distance <= 3 && hasRanged) {
        creep.rangedAttack(closestHostile);
      } else {
        if (closestRampart) {
          creep.travelTo(closestRampart);
        } else {
          creep.travelTo(closestHostile, { range: hasRanged ? 3 : 1 });
        }
      }
    } else {
      const rampart = Game.getObjectById(task.id as Id<StructureRampart>);
      if (!rampart) {
        task.complete = true;
        return;
      }

      if (!creep.pos.isEqualTo(rampart.pos.x, rampart.pos.y)) {
        creep.travelTo(rampart);
      }
    }
  }
}

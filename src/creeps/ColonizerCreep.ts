import { recycle } from 'actions/recycle';
import { toggleWorking } from 'actions/toggleWorking';
import config from 'config';
import { TaskManager } from 'TaskManager';
import { isFlagOfType } from 'utils/flag';
import { isInColonyHelpRange } from 'utils/room';
import { BodySettings, CreepBase } from './CreepBase';

interface ColonizerTask extends CreepTask {
  type: 'colonize';
  target: Id<Flag>;
}

const NUM_PER_FLAG = 4;

// Moves to target room, claims controller, creates a spawn construction site
// Then constructs first spawn at flag location and removes flag
// Once complete, call global.empire.addNewColony() and
// switch role to pioneer and homeRoom to new colony room
// Next tick, new colony should pick up and run it as a pioneer
export class ColonizerCreep extends CreepBase {
  role: CreepRole = 'colonizer';
  bodyOpts: BodySettings = {
    pattern: [WORK, CARRY, MOVE, MOVE],
    sizeLimit: 5,
    ordered: true,
  };

  private findFlags(room: Room): Flag[] {
    if ((room.controller?.level ?? 0) < 4) return [];

    return _.filter(
      Game.flags,
      flag =>
        flag.pos.roomName !== room.name &&
        isFlagOfType(flag, 'COLONIZE') &&
        isInColonyHelpRange(room.name, flag.pos.roomName)
    );
  }

  targetNum(room: Room): number {
    return this.findFlags(room).length * NUM_PER_FLAG;
  }

  isValidTask(creep: Creep, task: ColonizerTask): boolean {
    return !!Game.flags[task.target];
  }

  findTask(creep: Creep, taskManager: TaskManager): ColonizerTask | null {
    const flags = this.findFlags(Game.rooms[creep.memory.homeRoom]);

    for (const flag of flags) {
      if (!taskManager.isTaskTaken(flag.pos.roomName, flag.name, 'colonize')) {
        return taskManager.createTask<ColonizerTask>(
          flag.pos.roomName,
          flag.name,
          'colonize',
          NUM_PER_FLAG
        );
      }
    }

    return null;
  }

  run(creep: Creep): void {
    const task = creep.memory.task as ColonizerTask | undefined;

    if (!task) {
      recycle(creep, 50);
      return;
    }

    // Move to target room
    if (creep.room.name !== task.room || creep.pos.isNearEdge(1)) {
      creep.say(task.room);
      creep.travelToRoom(task.room, { allowHostile: false });
      return;
    }

    const flag = Game.flags[task.target];

    if (!flag) {
      recycle(creep, 50);
      return;
    }

    // Make sure we can harvest/build
    if (creep.room.controller?.owner?.username !== config.USERNAME) {
      creep.say('cmon');
      return;
    }

    const spawnConstructionSite = flag.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0];

    // Create a spawn construction site on flag if no site or spawn
    if (
      !spawnConstructionSite &&
      !flag.pos
        .lookFor(LOOK_STRUCTURES)
        .filter(struct => struct.structureType === STRUCTURE_SPAWN).length
    ) {
      flag.pos.createConstructionSite(STRUCTURE_SPAWN);
      return;
    }

    if (spawnConstructionSite) {
      // Build
      if (creep.memory.working) {
        if (creep.pos.getRangeTo(spawnConstructionSite) > 3) {
          creep.travelTo(spawnConstructionSite, { ignoreCreeps: false });
        } else {
          creep.build(spawnConstructionSite);
        }
      } else {
        const source = creep.pos
          .findClosestOpenSources(creep)
          .find(source => source.energy);
        if (!source) {
          creep.say('...');
          return;
        }

        if (creep.pos.getRangeTo(source) > 1) {
          creep.travelTo(source, { ignoreCreeps: false });
        } else {
          creep.harvest(source);
        }
      }

      toggleWorking(creep, false);
      return;
    }

    // Spawn construction complete
    // Remove flag, call global.empire.addNewColony() and
    // switch role to pioneer and homeRoom to new colony room
    // Next tick, new colony should pick up and run it as a pioneer
    creep.say('pioneer');
    global.empire.addNewColony(task.room);
    creep.memory.role = 'pioneer';
    creep.memory.homeRoom = task.room;
    flag.remove();
    delete creep.memory.task;
  }
}

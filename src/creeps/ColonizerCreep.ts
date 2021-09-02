import { recycle } from 'actions/recycle';
import config from 'config';
import { TaskManager } from 'TaskManager';
import { isFlagOfType } from 'utils/flag';
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
    return _.filter(
      Game.flags,
      flag =>
        isFlagOfType(flag, 'COLONIZE') &&
        Game.map.getRoomLinearDistance(room.name, flag.pos.roomName) <= 5
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
      if (!taskManager.isTaskTaken(flag.pos.roomName, flag.name, 'claim')) {
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
      creep.say('...');
      return;
    }

    // Move to target room
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

    if (creep.pos.isNearEdge(2)) {
      creep.travelToRoom(creep.room.name, { range: 20 });
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
          creep.travelTo(spawnConstructionSite);
        } else {
          creep.build(spawnConstructionSite);
        }
      } else {
        const source = creep.room
          .findSources()
          .filter(source => source.energy)
          .sort((a, b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep))[0];
        if (!source) {
          creep.say('...');
          return;
        }

        if (creep.pos.getRangeTo(source) > 1) {
          creep.travelTo(source);
        } else {
          creep.harvest(source);
        }
      }

      if (creep.memory.working && creep.isEmpty()) {
        creep.memory.working = false;
      } else if (!creep.memory.working && creep.isFull()) {
        creep.memory.working = true;
      }
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

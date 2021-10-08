import config from 'config';
import { saveScoutData } from 'utils/scouting';
import { isHighway } from 'utils/room';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface ScoutTask extends CreepTask {
  type: 'scout';
}

function findRoomsToScout(colonyRoom: Room, ignoreLastScan = false): string[] {
  const colonyMem = Memory.colonies?.[colonyRoom.name];
  if (!colonyMem) return []; // Should never happen

  const roomsToScout: { name: string; mem: RoomMemory }[] = [];
  const adjacentRoomNames =
    global.empire.colonies[colonyRoom.name].adjacentRoomNames;

  for (const roomName of adjacentRoomNames) {
    const adjMem = Memory.rooms[roomName];

    // Skip highways after first scouting
    if (adjMem && isHighway(roomName)) continue;

    // If adjacent room not saved in memory or if it's been a while since last scouting
    // or ignoreLastScan=true (for when scout is alive)
    if (
      !adjMem ||
      !adjMem.lastScan ||
      ignoreLastScan ||
      Game.time - adjMem.lastScan > config.ticks.SCOUT_ADJACENT_ROOMS
    ) {
      roomsToScout.push({ name: roomName, mem: adjMem });
    }
  }

  return roomsToScout
    .sort((a, b) => (a.mem?.lastScan ?? 0) - (b.mem?.lastScan ?? 0))
    .map(({ name }) => name);
}

export class ScoutCreep extends CreepBase {
  role: CreepRole = 'scout';
  bodyOpts: BodySettings = {
    pattern: [MOVE],
    sizeLimit: 1,
  };

  // None before RCL 4
  // Spawn 1 if adjacent rooms need exploring
  targetNum(room: Room): number {
    const rcl = room.controller?.level ?? 0;
    if (rcl < 4) return 0;
    return findRoomsToScout(room, true).length ? 1 : 0;
  }

  isValidTask(creep: Creep, task: ScoutTask): boolean {
    return true;
  }

  // Currently will have at most 1 scout, no need to check if task is taken
  findTask(creep: Creep, taskManager: TaskManager): ScoutTask | null {
    const roomToScout = findRoomsToScout(
      Game.rooms[creep.memory.homeRoom],
      true
    ).find(roomName => roomName !== creep.room.name);
    if (!roomToScout) return null;

    return taskManager.createTask<ScoutTask>(roomToScout, roomToScout, 'scout');
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    if (!creep.memory.task) {
      creep.suicide();
      return;
    }

    const targetRoomName = creep.memory.task.target;

    if (creep.room.name === targetRoomName) {
      // Reached target room, scan and save to memory
      saveScoutData(creep.room, creep);
      creep.memory.task.complete = true;
    } else {
      creep.travelToRoom(targetRoomName, { offRoad: true });
      creep.say(targetRoomName);
    }
  }
}

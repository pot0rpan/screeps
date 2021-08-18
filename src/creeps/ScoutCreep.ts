import config from 'config';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

declare global {
  interface RoomMemory {
    colonize?: boolean;

    owner?: string;
    reserver?: string;
    hostiles?: number;
    controller?: {
      id: string;
      pos: [number, number];
      level: number;
    };
    sources?: {
      id: string;
      pos: [number, number];
      distance: number;
    }[];
    lastScan?: number;
  }
}

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
    .sort((a, b) => (a.mem.lastScan ?? 0) - (b.mem.lastScan ?? 0))
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

    // const targetRoomName = task.target;

    // const memory = Memory.rooms[targetRoomName];

    // if (
    //   !memory ||
    //   !memory.lastScan ||
    //   Game.time - memory.lastScan > config.ticks.SCOUT_ADJACENT_ROOMS
    // ) {
    //   return true;
    // }

    // return false;
  }

  // Currently will have at most 1 scout, no need to check if task is taken
  findTask(creep: Creep, taskManager: TaskManager): ScoutTask | null {
    const roomToScout = findRoomsToScout(
      Game.rooms[creep.memory.homeRoom],
      true
    ).filter(roomName => roomName !== creep.room.name)[0];
    if (!roomToScout) return null;

    return taskManager.createTask<ScoutTask>(roomToScout, roomToScout, 'scout');
  }

  run(creep: Creep): void {
    if (!creep.memory.task) {
      global.empire.colonies[creep.memory.homeRoom].handleExpansion();
      creep.suicide();
      return;
    }

    const targetRoomName = creep.memory.task.target;

    if (creep.room.name === targetRoomName) {
      // Reached target room, scan and save to memory
      if (!Memory.colonies?.[creep.memory.homeRoom]) return; // Should never happen

      // Initialize memory if first visit to this room
      if (!Memory.rooms[targetRoomName]) {
        Memory.rooms[targetRoomName] = {};
      }

      const room = creep.room;
      const roomMemory = Memory.rooms[targetRoomName];

      if (roomMemory.lastScan) {
        // Skip some non-changing scans
        roomMemory.owner = room.controller?.owner?.username;
        roomMemory.reserver = room.controller?.reservation?.username;
        if (roomMemory.controller)
          roomMemory.controller.level = (
            room.controller as StructureController
          ).level;
      } else {
        roomMemory.controller = room.controller
          ? {
              id: room.controller.id,
              pos: [room.controller.pos.x, room.controller.pos.y],
              level: room.controller.level,
            }
          : undefined;
        roomMemory.owner = room.controller?.owner?.username;
        roomMemory.reserver = room.controller?.reservation?.username;
        roomMemory.sources = room.findSources(false).map(({ id, pos }) => ({
          id,
          pos: [pos.x, pos.y],
          distance: creep.pos.findPathTo(pos.x, pos.y).length,
        }));
      }

      roomMemory.hostiles = room.findHostiles().length;
      roomMemory.lastScan = Game.time;

      creep.memory.task.complete = true;
      console.log(creep, 'scouted room:', creep.memory.task.room);
    } else {
      creep.travelTo(new RoomPosition(25, 25, targetRoomName));
      creep.say(targetRoomName);
    }
  }
}

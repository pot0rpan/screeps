import config from 'config';
import { isFriendlyOwner } from 'utils';
import { packCoord } from './packrat';
import { getAllResourceAmounts } from './store';

declare global {
  interface RoomMemory {
    colonize?: boolean;

    owner?: string;
    reserver?: string;
    reservationTicks?: number;
    hostiles?: number;
    invaders?: number;
    controller?: {
      id: string;
      pos: string;
      level: number;
    };
    sources?: {
      id: string;
      pos: string;
      distance?: number;
    }[];
    mineral?: {
      id: string;
      type: MineralConstant;
      pos: string;
    };
    tombstones?: {
      id: string;
      pos: string;
      store: Partial<Record<ResourceConstant, number>>;
    }[];
    exits?: string[];
    lastScan?: number;
  }
}

// creep is only supplied for adjacent room scouting
// used for saving path length to sources
// ignored for map exploration
export function saveScoutData(room: Room, creep?: Creep): void {
  // Initialize memory if first visit to this room
  if (!Memory.rooms[room.name]) {
    Memory.rooms[room.name] = {};
  }

  const mem = Memory.rooms[room.name];

  // One-time-only stuff
  if (!mem.lastScan) {
    mem.sources = room.findSources(false).map(({ id, pos }) => ({
      id,
      pos: packCoord(pos),
      distance: creep?.pos.findPathTo(pos.x, pos.y).length,
    }));

    const mineral = room.find(FIND_MINERALS)[0];

    if (mineral) {
      mem.mineral = {
        id: mineral.id,
        type: mineral.mineralType,
        pos: packCoord(mineral.pos),
      };
    }
  }

  // If scouted and has controller, only update level
  // If not scouted, save controller data if available
  // If scouted and no controller, there won't be a new one so skip
  if (mem.controller) {
    mem.controller.level = room.controller!.level;
  } else if (!mem.lastScan) {
    mem.controller = room.controller
      ? {
          id: room.controller.id,
          pos: packCoord(room.controller.pos),
          level: room.controller.level,
        }
      : undefined;
  }

  mem.owner = room.controller?.owner?.username;
  mem.reserver = room.controller?.reservation?.username;
  mem.reservationTicks = room.controller?.reservation?.ticksToEnd;

  mem.exits = Object.values(Game.map.describeExits(room.name)) as string[];

  // Update avoid for Traveler
  if (mem.owner && !isFriendlyOwner(mem.owner)) {
    mem.avoid = 1;
  } else {
    delete mem.avoid;
  }

  const hostiles = room.findDangerousHostiles();

  mem.hostiles = hostiles.length || undefined;
  mem.invaders =
    hostiles.filter(hostile => hostile.owner.username === 'Invader').length ||
    undefined;

  const tombstonesWithResources = room.find(FIND_TOMBSTONES, {
    filter: ts => ts.store.getUsedCapacity(),
  });
  if (tombstonesWithResources.length) {
    mem.tombstones = [];
    for (const ts of tombstonesWithResources) {
      mem.tombstones.push({
        id: ts.id,
        pos: packCoord(ts.pos),
        store: getAllResourceAmounts(ts.store),
      });
    }
  } else {
    delete mem.tombstones;
  }

  // Abandon room if taken by hostiles
  if (mem.colonize && mem.reserver && mem.reserver !== config.USERNAME) {
    delete mem.colonize;
  }

  mem.lastScan = Game.time;
}

/** Deletes room memory of old rooms that haven't been seen for a long time */
function cleanScoutingMemory(): void {
  for (const roomName in Memory.rooms) {
    // If we have visibility, keep
    if (Game.rooms[roomName]) continue;

    // If not scouted, keep
    if (!Memory.rooms[roomName].lastScan) continue;

    // If relatively fresh scout data, keep
    if (Game.time - Memory.rooms[roomName].lastScan! < 20000) continue;

    delete Memory.rooms[roomName];
  }
}

// Clean scouting memory on global reset
cleanScoutingMemory();

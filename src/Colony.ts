import { ColonyDefense } from 'ColonyDefense';
import config from 'config';
import { HumanResources } from 'HumanResources';
import { RoomPlanner } from 'RoomPlanner';
import { TaskManager } from 'TaskManager';
import { isFriendlyOwner, isNthTick } from 'utils';
import { isDamaged } from 'utils/structure';

declare global {
  interface Memory {
    colonies?: {
      [roomName: string]: {};
    };
  }
}

type LinkTransferRequest = {
  from: Id<StructureLink>;
  to: Id<StructureLink>;
  ts: number;
};

// A Colony is a block of 9 rooms, with `room` in the center
// All functionality of a colony stems from here
export class Colony {
  private rcl: number;
  readonly roomName: string;
  readonly adjacentRoomNames: string[];
  readonly hr: HumanResources;
  readonly roomPlanner: RoomPlanner;
  readonly taskManager: TaskManager;
  readonly colonyDefense: ColonyDefense;

  private _colonyCreeps: Creep[] | null = null;
  private _colonyCreepsTimestamp = 0;

  private linkTransferQueue: LinkTransferRequest[] = [];

  constructor(roomName: string) {
    console.log('Colony constructor()', roomName);
    this.roomName = roomName;
    this.adjacentRoomNames =
      roomName === 'sim'
        ? []
        : (Object.values(Game.map.describeExits(roomName)) as string[]); // Build error if not casted
    this.hr = new HumanResources(this);
    this.roomPlanner = new RoomPlanner(this.roomName);
    this.taskManager = new TaskManager(this);
    this.colonyDefense = new ColonyDefense(this);
    this.rcl = Game.rooms[this.roomName].controller?.level ?? 0;
  }

  getColonyCreeps(): Creep[] {
    if (
      !this._colonyCreeps ||
      !this._colonyCreepsTimestamp ||
      Game.time !== this._colonyCreepsTimestamp
    ) {
      this._colonyCreeps = _.filter(
        Game.creeps,
        creep => creep.memory.homeRoom === this.roomName
      );
      this._colonyCreepsTimestamp = Game.time;
    }
    return this._colonyCreeps;
  }

  run() {
    const colonyCpu = Game.cpu.getUsed();
    console.log('Colony run()', this.roomName);

    const rcl = Game.rooms[this.roomName].controller?.level ?? 0;
    const newRcl = rcl !== this.rcl;
    this.rcl = rcl;

    const colonyCreeps = this.getColonyCreeps();

    // Run defense first
    this.colonyDefense.run();

    // Handle task queuing and assignments
    this.taskManager.run(colonyCreeps);

    // Handle spawning
    if (global.isFirstTick || isNthTick(config.ticks.SPAWN_CREEPS)) {
      this.hr.spawnCreeps(colonyCreeps);
    }

    if (isNthTick(4)) {
      this.hr.recycleCreeps();
    }

    // Run links
    if (isNthTick(8)) {
      this.runLinks();
    }

    // Run creeps
    this.hr.runCreeps(colonyCreeps);

    // Run towers
    this.runTowers();

    // Plan main room and place construction sites
    // handles timing on its own
    this.roomPlanner.run();

    // Handle expansion to adjacent mining rooms
    if (
      global.isFirstTick ||
      newRcl ||
      isNthTick(config.ticks.PLAN_EXPANSION)
    ) {
      this.handleExpansion();
    }

    global.stats.profileLog(`Colony ${this.roomName}`, colonyCpu, [
      this.roomName,
    ]);
  }

  private runTowers() {
    const room = Game.rooms[this.roomName];
    if (room.memory.defcon) return; // Attacking handled by ColonyDefense

    // Only repair or heal with towers that are more than half full
    // Need to be prepared for attacks
    const towers = room.findTowers();

    const fullTowers = towers.filter(
      tower => tower.store.getUsedCapacity(RESOURCE_ENERGY) > 500
    );

    if (!towers.length) return;

    const needsHealing = room
      .find(FIND_MY_CREEPS, {
        filter: crp =>
          crp.hits < crp.hitsMax &&
          (room.memory.defcon || !crp.getActiveBodyparts(HEAL)),
      })
      .sort((a, b) => a.hits - b.hits)[0];

    if (needsHealing) {
      for (const tower of towers) {
        tower.heal(needsHealing);
      }
    } else if (
      fullTowers.length &&
      // Don't block spawning!
      room.energyAvailable === room.energyCapacityAvailable &&
      !room.find(FIND_MY_CREEPS, {
        filter: crp => crp.memory.role === 'builder',
      }).length
    ) {
      const damagedStructure = room
        .find(FIND_STRUCTURES, {
          filter: isDamaged,
        })
        .sort((a, b) => a.hits - b.hits)[0];

      if (damagedStructure) {
        for (const tower of fullTowers) {
          tower.repair(damagedStructure);
        }
      }
    }
  }

  private handleExpansion(): void {
    if (!Game.rooms[this.roomName].storage) return;

    // Get rooms we have scouted and aren't colonizing yet
    const adjRoomMems = this.adjacentRoomNames
      .filter(roomName => !!Memory.rooms[roomName])
      .map(roomName => ({
        name: roomName,
        mem: Memory.rooms[roomName],
      }));

    const numInProgress = adjRoomMems.filter(({ mem }) => mem.colonize).length;

    if (
      numInProgress >=
      config.MAX_REMOTES(Game.rooms[this.roomName].controller?.level ?? 0)
    ) {
      return;
    }

    // Rooms we aren't colonizing and no hostiles (Source Keepers most likely)
    const availableAdjRoomMems = adjRoomMems.filter(
      ({ mem }) => !mem.colonize && !mem.hostiles && !mem.highway
    );

    // Rooms not owned or reserved by hostiles, 2 sources
    let possibleRooms = availableAdjRoomMems.filter(
      ({ mem }) =>
        !mem.owner &&
        (!mem.reserver || mem.reserver === config.USERNAME) &&
        (mem.sources?.length ?? 0) === 2
    );

    // Rooms not owned or reserved by hostiles, 1 source
    if (!possibleRooms.length) {
      possibleRooms = availableAdjRoomMems.filter(
        ({ mem }) =>
          !mem.owner &&
          (!mem.reserver || mem.reserver === config.USERNAME) &&
          mem.sources?.length
      );
    }

    // Rooms reserved by hostiles, 1+ source
    if (!possibleRooms.length) {
      possibleRooms = availableAdjRoomMems.filter(
        ({ mem }) =>
          !mem.owner &&
          mem.reserver &&
          !isFriendlyOwner(mem.reserver) &&
          mem.sources?.length
      );
    }

    if (!possibleRooms.length) {
      console.log(this.roomName, 'no available rooms to expand to');
      return;
    }

    // Sort rooms by total distance to sources
    const sortedRooms = possibleRooms.sort((a, b) => {
      const totalA = a.mem.sources
        ?.map(src => src.distance)
        .reduce((prev, curr) => prev + curr, 0) as number;
      const totalB = b.mem.sources
        ?.map(src => src.distance)
        .reduce((prev, curr) => prev + curr, 0) as number;

      return totalA - totalB;
    });

    const bestRoom = sortedRooms[0];

    console.log(JSON.stringify(sortedRooms, null, 2));
    console.log('Expanding to room', bestRoom.name);

    bestRoom.mem.colonize = true;
  }

  public queueLinkTransfer(
    from: LinkTransferRequest['from'],
    to: LinkTransferRequest['to']
  ): void {
    if (
      !this.linkTransferQueue.find(req => req.from === from && req.to === to)
    ) {
      this.linkTransferQueue.push({ from, to, ts: Game.time });
    }
  }

  private runLinks(): void {
    const request = this.linkTransferQueue[0];
    if (!request) return;

    // Remove stale request
    if (Game.time - request.ts > 40) {
      this.linkTransferQueue.shift();
      return;
    }

    const from = Game.getObjectById(request.from);
    if (!from || from.cooldown) return;

    const to = Game.getObjectById(request.to);

    // Make sure `to` isn't full, and `from` can fully fill `to`
    if (
      !to?.store.getFreeCapacity(RESOURCE_ENERGY) ||
      from.store.getUsedCapacity(RESOURCE_ENERGY) <
        to.store.getFreeCapacity(RESOURCE_ENERGY)
    ) {
      return;
    }

    from.transferEnergy(to);
    this.linkTransferQueue.shift();
  }
}

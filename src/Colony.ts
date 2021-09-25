import config from 'config';
import { average, isFriendlyOwner, isNthTick } from 'utils';
import { ColonyDefense } from 'ColonyDefense';
import { HumanResources } from 'HumanResources';
import { RoomPlanner } from 'RoomPlanner';
import { TaskManager } from 'TaskManager';

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
    this.runLinks();

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
          crp.memory.recycle === undefined &&
          crp.hits < crp.hitsMax &&
          !crp.getActiveBodyparts(HEAL),
      })
      .sort((a, b) => a.hits - b.hits)[0];

    if (needsHealing) {
      for (const tower of towers) {
        tower.heal(needsHealing);
      }
    } else if (
      // Uses almost 0.1 CPU even with no repair intents, so space it out a bit
      isNthTick(3) &&
      fullTowers.length &&
      // // Don't block spawning!
      // room.energyAvailable === room.energyCapacityAvailable &&
      !room.find(FIND_MY_CREEPS, {
        filter: crp => crp.memory.role === 'builder',
      }).length
    ) {
      // If we don't have builders, it's probably because we're very low on energy
      // So don't waste too much energy on repairs, just make sure nothing fully decays
      const damagedStructure = room
        .find(FIND_STRUCTURES)
        .filter(struct => struct.hits < struct.hitsMax && struct.hits < 5000)
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
    // Explicitly check for 1 source to avoid center 4 source rooms for now
    if (!possibleRooms.length) {
      possibleRooms = availableAdjRoomMems.filter(
        ({ mem }) =>
          !mem.owner &&
          (!mem.reserver || mem.reserver === config.USERNAME) &&
          (mem.sources?.length ?? 0) === 1
      );
    }

    if (!possibleRooms.length) {
      console.log(this.roomName, 'no available rooms to expand to');
      return;
    }

    // Sort rooms by average distance to sources
    const sortedRooms = possibleRooms.sort((a, b) => {
      const distancesA = a.mem.sources!.map(src => src.distance);
      const distancesB = b.mem.sources!.map(src => src.distance);

      return average(...distancesA) - average(...distancesB);
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

    // Make sure `from` is valid
    if (!from || from.store.getUsedCapacity(RESOURCE_ENERGY) < 200) {
      this.linkTransferQueue.shift();
      return;
    }

    if (from.cooldown) return; // Still valid most likely, just need to wait

    const to = Game.getObjectById(request.to);

    // Make sure `to` is valid
    if (!to) {
      this.linkTransferQueue.shift();
      return;
    }

    if (!to.store.getFreeCapacity(RESOURCE_ENERGY)) {
      // Still valid most likely,
      // just need to wait for `to` to get emptied by Operator
      return;
    }

    // Make sure from actually has energy to send
    if (from.store.getUsedCapacity(RESOURCE_ENERGY)) {
      from.transferEnergy(to);
    }

    // If it makes it this far, we either fulfilled the request,
    // or it's invalid due to `from` being empty
    this.linkTransferQueue.shift();
  }
}

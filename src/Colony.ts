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

// A Colony is a block of 9 rooms, with `room` in the center
// All functionality of a colony stems from here
export class Colony {
  readonly roomName: string;
  readonly adjacentRoomNames: string[];
  readonly hr: HumanResources;
  readonly roomPlanner: RoomPlanner;
  readonly taskManager: TaskManager;
  readonly colonyDefense: ColonyDefense;

  constructor(roomName: string) {
    console.log('Colony constructor()', roomName);
    this.roomName = roomName;
    this.adjacentRoomNames = Object.values(
      Game.map.describeExits(roomName)
    ) as string[]; // Build error if not casted
    this.hr = new HumanResources(roomName, this.adjacentRoomNames);
    this.roomPlanner = new RoomPlanner(this.roomName);
    this.taskManager = new TaskManager(this);
    this.colonyDefense = new ColonyDefense(this);
  }

  getColonyCreeps(): Creep[] {
    return _.filter(
      Game.creeps,
      creep =>
        creep.pos.roomName === this.roomName ||
        this.adjacentRoomNames.includes(creep.pos.roomName)
    );
  }

  run() {
    console.log('Colony run()', this.roomName);

    const colonyCreeps = this.getColonyCreeps();

    // Run defense first
    this.colonyDefense.run();

    // Handle task queuing and assignments
    this.taskManager.run(colonyCreeps);

    // Handle spawning
    if (global.isFirstTick || isNthTick(config.ticks.SPAWN_CREEPS)) {
      this.hr.spawnCreeps(colonyCreeps);
      this.hr.recycleCreeps();
    }

    // Run creeps
    this.hr.runCreeps(colonyCreeps);

    // Run towers
    this.runTowers();

    // Handle construction
    // TODO: Check if enough cpu left
    if (global.isFirstTick || isNthTick(config.ticks.PLAN_ROOMS)) {
      this.roomPlanner.run();
      this.handleExpansion();
    }
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

    if (fullTowers.length) {
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
    } else {
      const needsHealing = room
        .find(FIND_MY_CREEPS, { filter: crp => crp.hits < crp.hitsMax })
        .sort((a, b) => a.hits - b.hits)[0];
      if (needsHealing) {
        for (const tower of towers) {
          tower.heal(needsHealing);
        }
      }
    }
  }

  private handleExpansion(): void {
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

    // Get rooms we aren't in yet, not owned or reserved, 2 sources
    let possibleRooms = adjRoomMems.filter(
      ({ mem }) =>
        !mem.colonize &&
        !mem.owner &&
        !mem.reserver &&
        (mem.sources?.length ?? 0) === 2
    );

    // Check for rooms reserved by hostiles
    if (!possibleRooms.length) {
      possibleRooms = adjRoomMems.filter(
        ({ mem }) => mem.reserver && !isFriendlyOwner(mem.reserver)
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
}

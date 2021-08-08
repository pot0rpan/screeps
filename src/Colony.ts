import { ColonyDefense } from 'ColonyDefense';
import config from 'config';
import { HumanResources } from 'HumanResources';
import { RoomPlanner } from 'RoomPlanner';
import { TaskManager } from 'TaskManager';
import { isNthTick } from 'utils';
import { isDamaged } from 'utils/structure';

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
    }

    // Run creeps
    this.hr.runCreeps(colonyCreeps);

    // Run towers
    this.runTowers();

    // Handle construction
    // TODO: Check if enough cpu left
    if (global.isFirstTick || isNthTick(config.ticks.PLAN_ROOMS)) {
      this.roomPlanner.run();
    }
  }

  private runTowers() {
    const room = Game.rooms[this.roomName];
    if (room.memory.defcon) return; // Attacking handled by ColonyDefense

    const towers = room
      .findTowers()
      .filter(tower => tower.store.getUsedCapacity(RESOURCE_ENERGY) >= 10);
    if (!towers.length) return;

    const damagedStructure = room
      .find(FIND_STRUCTURES, {
        filter: isDamaged,
      })
      .sort((a, b) => a.hits - b.hits)[0];

    if (!damagedStructure) return;

    for (const tower of towers) {
      tower.repair(damagedStructure);
    }
  }
}

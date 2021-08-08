import { ColonyDefense } from 'ColonyDefense';
import config from 'config';
import { HumanResources } from 'HumanResources';
import { RoomPlanner } from 'RoomPlanner';
import { TaskManager } from 'TaskManager';
import { isNthTick } from 'utils';

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
    this.adjacentRoomNames = []; // TODO
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

    // Handle construction
    // TODO: Check if enough cpu left
    if (global.isFirstTick || isNthTick(config.ticks.PLAN_ROOMS)) {
      this.roomPlanner.run();
    }
  }
}

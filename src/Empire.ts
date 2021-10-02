import { isNthTick } from 'utils';
import { Colony } from 'Colony';
import { Market } from 'Market';
import config from 'config';

// This is the top-level class, everything stems from here
export class Empire {
  colonies: { [roomName: string]: Colony } = {};
  market: Market;

  constructor() {
    console.log(
      '<span style="color:red">----------------------- GLOBAL RESET ----------------------</span>'
    );

    this.market = new Market(this);

    // Read colony room names from Memory
    if (Array.isArray(Memory.colonies)) delete Memory.colonies;

    // Filter out rooms with no visibility, either old or lost
    const colonyNames = Object.keys(Memory.colonies ?? {}).filter(
      roomName => !!Game.rooms[roomName]
    );

    if (colonyNames.length) {
      for (const roomName of colonyNames) {
        this.colonies[roomName] = new Colony(roomName);
      }
    } else {
      // No colonies in Memory, must be first game tick of new game
      Memory.colonies = {};

      for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (room.controller?.my && room.controller?.level > 0) {
          this.colonies[roomName] = new Colony(roomName);
          Memory.colonies[roomName] = {};
        }
      }
    }
  }

  public addNewColony(roomName: string): void {
    if (!Game.rooms[roomName]) return;
    this.colonies[roomName] = new Colony(roomName);
    if (!Memory.colonies) Memory.colonies = {};
    Memory.colonies[roomName] = {};
  }

  run() {
    console.log('Empire run()');

    for (const roomName in this.colonies) {
      if (!Game.rooms[roomName]) {
        delete this.colonies[roomName];
        delete Memory.colonies?.[roomName];
        continue;
      }
      this.colonies[roomName].run();
    }

    if (
      isNthTick(config.ticks.RUN_MARKET) &&
      Game.cpu.bucket > Object.keys(this.colonies).length * 5 // Each colony uses 1-2, extra to be safe
    ) {
      this.market.run();
    }
  }
}

import { isNthTick } from 'utils';
import { Colony } from 'Colony';
import { Market } from 'Market';

// This is the top-level class, everything stems from here
export class Empire {
  colonies: { [roomName: string]: Colony } = {};
  market: Market;

  constructor() {
    console.log(
      '<span style="color:red">----------------------- GLOBAL RESET ----------------------</span>'
    );

    this.market = new Market();

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
          Memory.colonies[roomName] = { adjacentRooms: [] };
        }
      }
    }
  }

  run() {
    console.log('Empire run()');

    for (const roomName in this.colonies) {
      this.colonies[roomName].run();
    }

    if (isNthTick(100) && Game.cpu.bucket > 200) {
      this.market.run(this);
    }
  }
}

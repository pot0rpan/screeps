import { Colony } from 'Colony';

// This is the top-level class, everything stems from here
export class Empire {
  colonies: { [roomName: string]: Colony } = {};

  constructor() {
    console.log('----------------------- GLOBAL RESET ----------------------');
    console.log('Empire constructor()');

    // Read colony room names from Memory
    if (Array.isArray(Memory.colonies)) delete Memory.colonies;

    if (Memory.colonies && Object.keys(Memory.colonies).length) {
      for (const roomName in Memory.colonies) {
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
  }
}

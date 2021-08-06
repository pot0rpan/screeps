import { Colony } from 'Colony';

// This is the top-level class, everything stems from here
export class Empire {
  colonies: { [roomName: string]: Colony } = {};

  constructor() {
    console.log('----------------------- GLOBAL RESET ----------------------');
    console.log('Empire constructor()');

    // Read colony room names from Memory
    if (Memory.colonies?.length) {
      for (const { roomName } of Memory.colonies) {
        this.colonies[roomName] = new Colony(roomName);
      }
    } else {
      // No colonies in Memory, must be first game tick of new game
      Memory.colonies = [];

      for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (room.controller?.my && room.controller?.level > 0) {
          this.colonies[roomName] = new Colony(roomName);
          Memory.colonies.push({ roomName });
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

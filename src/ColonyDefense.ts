import { Colony } from 'Colony';
import config from 'config';
import { isNthTick } from 'utils';

declare global {
  interface RoomMemory {
    defcon?: boolean;
  }
}

export class ColonyDefense {
  private colony: Colony;
  private roomName: string;
  private adjacentRoomNames: string[];
  private safeModeTimer: number | null = null;

  // Reset every run to avoid stale objects
  private mainRoom: Room = null!;
  private adjacentRooms: Room[] = [];
  private defconRoomNames: string[] = [];

  constructor(colony: Colony) {
    this.colony = colony;
    this.roomName = colony.roomName;
    this.adjacentRoomNames = colony.adjacentRoomNames;
  }

  public run() {
    // Always run if hostiles were around last tick,
    // Otherwise only check for hostiles every few ticks
    if (!this.defconRoomNames.length && !isNthTick(10)) {
      return;
    }

    console.log(this.colony.roomName, 'ColonyDefense run()');
    const start = Game.cpu.getUsed();

    // Load real room objects
    this.mainRoom = Game.rooms[this.roomName];
    this.adjacentRooms = this.adjacentRoomNames.map(
      roomName => Game.rooms[roomName]
    );

    // Rescan rooms for hostiles
    this.defconRoomNames = [];
    const allRooms = [this.mainRoom, ...this.adjacentRooms];

    for (const room of allRooms) {
      if (room.findHostiles().length) {
        this.defconRoomNames.push(room.name);
        room.memory.defcon = true;
      } else {
        room.memory.defcon = false;
      }
    }

    if (this.defconRoomNames.length) {
      const defendMain = this.defconRoomNames.includes(this.roomName);
      const defendOthers = defendMain ? this.defconRoomNames.length > 1 : true;

      if (defendMain) this.defendMainRoom();
      if (defendOthers) this.defendOtherRooms();
    }
    console.log(
      this.colony.roomName,
      'ColonyDefense CPU:',
      Game.cpu.getUsed() - start
    );
  }

  private defendMainRoom() {
    this.runTowers();
    this.handleSafeMode();
  }

  private defendOtherRooms() {
    // TODO: Send defense creeps from main room
  }

  private handleSafeMode() {
    const controller = this.mainRoom.controller;
    if (!controller || controller.safeMode || !controller.safeModeAvailable) {
      if (this.safeModeTimer) this.safeModeTimer = null;
      return;
    }

    // Activate safe mode if creeps made it to base center
    // Set timer to not activate too eagerly
    if (
      this.colony.roomPlanner.baseCenter?.findInRange(FIND_HOSTILE_CREEPS, 5)
        .length
    ) {
      if (this.safeModeTimer === null) {
        this.safeModeTimer = config.ticks.SAFE_MODE_DELAY;
      } else if (this.safeModeTimer <= 0) {
        this.safeModeTimer = null;
        controller.activateSafeMode();
        Game.notify(
          `Activated safe mode on tick ${Game.time}, hostiles too close to base center`
        );
      } else {
        this.safeModeTimer--;
      }
    } else {
      this.safeModeTimer = null;
    }
  }

  private runTowers() {
    const towers = this.mainRoom.findTowers();

    const mostInjuredHostile = this.mainRoom
      .findHostiles()
      .sort((a, b) => a.hits - b.hits)[0];

    for (const tower of towers) {
      tower.attack(mostInjuredHostile);
    }
  }
}

import { Colony } from 'Colony';
import { Empire } from 'Empire';

type CreepStats = {
  [role: string]: { target: number; actual: number };
};

type SpawnStats = {
  name: string;
  ticksTotal: number;
  ticksComplete: number;
};

function printText(
  roomName: string,
  text: string,
  x: number,
  y: number,
  style: TextStyle = {}
) {
  const defaultStyle = {
    align: 'left',
    opacity: 0.8,
  };
  const opts = Object.assign(defaultStyle, style);
  new RoomVisual(roomName).text(text, x, y, opts);
}

function printProgressBar(
  roomName: string,
  percent: number,
  x: number,
  y: number
): void {
  const textPercent = Math.round(percent * 100);
  const room = Game.rooms[roomName];
  const width = 5;
  room.visual.text(`${textPercent}%`, x + width / 2, y - 0.1, {
    font: 0.6,
  });
  room.visual.rect(x, y - 0.8, width, 1, {
    stroke: '#ffffff',
    fill: 'transparent',
  });
  room.visual.rect(x, y - 0.8, percent * width, 1, {
    fill: '#ffffff88',
  });
}

export class Stats {
  _show: boolean;

  constructor() {
    this._show = this.show;
  }

  get show() {
    if (typeof Memory._showStats === 'undefined') {
      Memory._showStats = true;
    }
    this._show = Memory._showStats;
    return this._show;
  }

  set show(bool: boolean) {
    Memory._showStats = bool;
    this._show = bool;
  }

  run(empire: Empire): void {
    if (!this.show) return;

    for (const roomName in empire.colonies) {
      const room = Game.rooms[roomName];
      if (!room) continue;

      const creepStats = this.getCreepStats(empire.colonies[roomName]);
      const spawnStats = this.getSpawningStats(room);

      let y = 1;
      for (const role in creepStats) {
        const stats = creepStats[role];
        printText(
          roomName,
          `${role}: [${stats.actual}/${stats.target}]`,
          1,
          y++
        );
      }

      for (const stats of spawnStats) {
        printText(
          roomName,
          `Spawning ${stats.name.split('-')[0]}: [${stats.ticksComplete}/${
            stats.ticksTotal
          }]`,
          1,
          ++y
        );
      }

      if (room.memory.defcon) {
        printText(roomName, 'DEFCON', 24.5, 4, {
          align: 'center',
          color: 'red',
          font: 2.5,
        });
      }

      this.showEnergyStats(room);

      this.showCpuStats(roomName);
    }
  }

  getCreepStats(colony: Colony): CreepStats {
    const mainRoom = Game.rooms[colony.roomName];
    const creeps = colony.getColonyCreeps();
    const nums: CreepStats = {};

    // Populate target num
    for (const [role, Creep] of Object.entries(global.Creeps)) {
      nums[role] = { target: Creep.targetNum(mainRoom), actual: 0 };
    }

    // Populate actual num
    for (const creep of creeps) {
      if (creep.spawning) continue;
      nums[creep.memory.role].actual++;
    }

    return nums;
  }

  getSpawningStats(room: Room): SpawnStats[] {
    const spawns = room.findSpawns().filter(spawn => spawn.spawning);
    const stats: SpawnStats[] = [];

    for (const spawn of spawns) {
      const spawning = spawn.spawning as Spawning;
      const ticksTotal = spawning.needTime;
      const ticksComplete = ticksTotal - spawning.remainingTime + 1;
      stats.push({ name: spawning.name, ticksTotal, ticksComplete });
    }

    return stats;
  }

  showCpuStats(roomName: string) {
    printText(roomName, 'Bucket:', 9.5, 1, { align: 'right' });
    printProgressBar(roomName, Game.cpu.bucket / 10000, 10, 1);

    printText(roomName, 'CPU:', 9.5, 2.5, { align: 'right' });
    printProgressBar(roomName, Game.cpu.getUsed() / 20, 10, 2.5);
  }

  showEnergyStats(room: Room) {
    printText(
      room.name,
      `Energy: [${room.energyAvailable}/${room.energyCapacityAvailable}]`,
      8,
      4
    );
  }
}

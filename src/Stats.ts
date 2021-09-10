import { minToStoreOfResource } from 'utils/room';
import { Colony } from 'Colony';
import { Empire } from 'Empire';
import { CreepNums } from 'HumanResources';

declare global {
  interface Memory {
    _showStats?: boolean;
    _profile?: boolean;
    _showTasks?: boolean;
  }
}

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
  _profile: boolean;
  _profileFilter: string[] = [];
  _showTasks: boolean;

  constructor() {
    this._show = this.show;
    this._profile = this.profile;
    this._showTasks = this.tasks;
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

  get profile() {
    if (typeof Memory._profile === 'undefined') {
      Memory._profile = false;
    }
    this._profile = Memory._profile;
    return this._profile;
  }

  set profile(bool: boolean) {
    Memory._profile = bool;
    this._profile = bool;
  }

  get tasks() {
    if (typeof Memory._showTasks === 'undefined') {
      Memory._showTasks = false;
    }
    this._showTasks = Memory._showTasks;
    return this._showTasks;
  }

  set tasks(bool: boolean) {
    Memory._showTasks = bool;
    this._showTasks = bool;
  }

  public filter(...categories: string[]): string {
    this._profileFilter = categories;
    return categories.toString();
  }

  private filterLog(categories: string[]): boolean {
    if (!this._profileFilter.length || !categories.length) {
      return true;
    }

    for (const mustMatch of this._profileFilter) {
      if (!categories.includes(mustMatch)) return false;
    }

    return true;
  }

  public profileLog(
    description: any,
    startCpu: number,
    categories: string[] = []
  ) {
    if (this.profile && this.filterLog(categories)) {
      const cpuUsed = Game.cpu.getUsed() - startCpu;
      if (cpuUsed <= 0) return; // Sim room
      console.log(
        `<span style="color: #4488ff">${description} CPU: <span style="color: ${
          cpuUsed >= 0.5
            ? 'red'
            : cpuUsed >= 0.3
            ? 'yellow'
            : cpuUsed < 0.2
            ? 'green'
            : 'white'
        }">${cpuUsed.toFixed(3)}</span></span>`
      );
    }
  }

  run(empire: Empire): void {
    if (!this.show) return;

    for (const roomName in empire.colonies) {
      const room = Game.rooms[roomName];
      if (!room) continue;
      if (Game.cpu.bucket < 100) {
        printText(roomName, 'Low bucket, skipping stats visuals', 0, 0.5, {
          color: 'yellow',
        });
        continue;
      }

      const creepStats = this.getCreepStats(empire.colonies[roomName]);
      const spawnStats = this.getSpawningStats(room);

      let y = 1;
      for (const role in creepStats) {
        const stats = creepStats[role];
        if (stats.actual + stats.target + stats.spawning === 0) continue;

        const color =
          stats.spawning > 0
            ? '#ffff88'
            : stats.actual < stats.target
            ? '#ff4488'
            : stats.actual > stats.target
            ? '#44ff88'
            : stats.dying > 0
            ? '#ff8844'
            : undefined;
        printText(
          roomName,
          `${role}: [${stats.actual}/${stats.target}]`,
          1,
          y++,
          { color }
        );
      }

      y += 0.5;

      for (const stats of spawnStats) {
        printText(
          roomName,
          `Spawning ${stats.name.split('-')[0]}: [${stats.ticksComplete}/${
            stats.ticksTotal
          }]`,
          1,
          y++
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

      if (this.tasks) {
        this.showTasks(room);
      }

      this.showCpuStats(roomName);
    }
  }

  getCreepStats(colony: Colony): CreepNums {
    return colony.hr.getCreepNums(colony.getColonyCreeps());
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

  showTasks(room: Room): void {
    const start = Game.cpu.getUsed();
    const { tasks } = global.empire.colonies[room.name].taskManager;
    let y = 1;

    printText(room.name, 'Colony Tasks', 40, y++);

    for (const id in tasks) {
      const { task, creeps } = tasks[id];
      printText(
        room.name,
        `${task.room} ${task.type} [${creeps.length}/${task.limit}]`,
        46,
        y++,
        { color: '#ccc', align: 'right' }
      );
    }
    console.log(room, 'Task Stats CPU:', Game.cpu.getUsed() - start);
  }

  showCpuStats(roomName: string) {
    printText(roomName, 'Bucket:', 9.5, 1, { align: 'right' });
    printProgressBar(roomName, Game.cpu.bucket / 10000, 10, 1);

    printText(roomName, 'CPU:', 9.5, 2.5, { align: 'right' });
    printProgressBar(roomName, Game.cpu.getUsed() / Game.cpu.limit, 10, 2.5);
  }

  showEnergyStats(room: Room) {
    let energy = room.energyAvailable;
    let totalEnergy = room.energyCapacityAvailable;

    printText(room.name, 'Spawn Energy:', 12, 4.5, { align: 'right' });
    printText(room.name, `[${energy}/${totalEnergy}]`, 12.5, 4.5, {
      color: energy < totalEnergy ? '#ff4488' : undefined,
    });

    if (!room.storage) return;

    energy = room.storage.store.getUsedCapacity(RESOURCE_ENERGY);
    totalEnergy =
      energy + (room.terminal?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0);

    printText(room.name, 'Total Energy:', 12, 5.5, { align: 'right' });
    printText(room.name, totalEnergy.toLocaleString('en-US'), 12.5, 5.5, {
      color:
        energy < minToStoreOfResource(room, RESOURCE_ENERGY)
          ? '#ff4488'
          : undefined,
    });
  }
}

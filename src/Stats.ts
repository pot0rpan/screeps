import { formatNumber } from 'utils';
import { targetResourceAmount } from 'utils/room';
import { Colony } from 'Colony';
import { Empire } from 'Empire';
import { CreepNums } from 'HumanResources';

declare global {
  interface Memory {
    _showStats?: boolean;
    _profile?: string[] | false;
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
  numerator: number,
  denominator: number,
  x: number,
  y: number
): void {
  const room = Game.rooms[roomName];
  const width = 6;
  room.visual.text(
    `${
      Number.isInteger(numerator) ? numerator : numerator.toFixed(2)
    } / ${denominator}`,
    x + width / 2,
    y - 0.1,
    {
      font: 0.6,
    }
  );
  room.visual.rect(x, y - 0.8, width, 1, {
    stroke: '#ffffff',
    fill: 'transparent',
  });
  room.visual.rect(x, y - 0.8, (numerator / denominator) * width, 1, {
    fill: '#ffffff88',
  });
}

export class Stats {
  _show: boolean;
  _profile: string[] | false;
  _showTasks: boolean;

  constructor() {
    if (!Memory._profile) {
      Memory._profile = false;
    }

    this._show = this.show;
    this._profile = Memory._profile;
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

  // To turn profiling off, `profile(false)`
  // To turn profiling on, `profile()`
  // To turn profiling on with filters, `profile('filter1', 'filter2')`
  public profile(...filters: string[] | [false]): string {
    if (filters.length === 1 && filters[0] === false) {
      this._profile = false;
    } else {
      this._profile = filters as string[];
    }
    Memory._profile = this._profile;
    return '' + this._profile;
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

  private filterLog(categories: string[]): boolean {
    if (this._profile === false) return false;

    if (!this._profile.length || !categories.length) {
      return true;
    }

    for (const mustMatch of this._profile) {
      if (!categories.includes(mustMatch)) return false;
    }

    return true;
  }

  public profileLog(
    description: any,
    startCpu: number,
    categories: string[] = []
  ) {
    if (this.filterLog(categories)) {
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

      printText(roomName, `Tick: ${Game.time}`, 48, 1, {
        align: 'right',
        color: '#44ff88',
      });

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

      this.showMarketBudget(roomName);

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
    printText(roomName, 'Bucket:', 11.5, 1, { align: 'right' });
    printProgressBar(roomName, Game.cpu.bucket, 10000, 12, 1);

    printText(roomName, 'CPU:', 11.5, 2.5, { align: 'right' });
    printProgressBar(roomName, Game.cpu.getUsed(), Game.cpu.limit, 12, 2.5);
  }

  showEnergyStats(room: Room) {
    const energy = room.energyAvailable;
    let totalEnergy = room.energyCapacityAvailable;

    printText(room.name, 'Spawn Energy:', 14, 4.5, { align: 'right' });
    printText(room.name, `[${energy}/${totalEnergy}]`, 14.5, 4.5, {
      color: energy < totalEnergy ? '#ff4488' : undefined,
    });

    if (!room.storage) return;

    const storageEnergy = room.storage.store.getUsedCapacity(RESOURCE_ENERGY);
    const terminalEnergy =
      room.terminal?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    totalEnergy = storageEnergy + terminalEnergy;
    const targetEnergy = targetResourceAmount(room, RESOURCE_ENERGY);

    printText(room.name, 'Total Energy:', 14, 5.5, { align: 'right' });
    printText(
      room.name,
      terminalEnergy
        ? `${formatNumber(totalEnergy)} (${formatNumber(
            terminalEnergy
          )} + ${formatNumber(storageEnergy)})`
        : formatNumber(totalEnergy),
      14.5,
      5.5,
      {
        color:
          storageEnergy < targetEnergy
            ? storageEnergy < targetEnergy * 0.9
              ? '#ff4488'
              : '#ffff88'
            : undefined,
      }
    );
  }

  showMarketBudget(roomName: string): void {
    const budget = Memory.colonies?.[roomName].budget;
    if (budget) {
      printText(roomName, 'Market Budget:', 14, 6.5, { align: 'right' });
      printText(
        roomName,
        formatNumber(budget),
        14.5,
        6.5,
        budget < 0 ? { color: '#ff4488' } : undefined
      );
    }
  }
}

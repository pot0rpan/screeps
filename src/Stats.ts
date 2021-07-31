import { Empire } from 'Empire';

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

  run(empire: Empire) {
    if (!this.show) return;

    // TODO: Check CPU bucket

    for (const roomName in empire.colonies) {
      // console.log(roomName, 'stats');
    }
  }
}

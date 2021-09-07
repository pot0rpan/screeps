import config from 'config';

export function isNthTick(number: number): boolean {
  return Game.time % number === 0;
}

export function isFriendlyOwner(username: string): boolean {
  return (
    config.USERNAME === username || config.FRIENDLY_NAMES.includes(username)
  );
}

export function average(...numbers: number[]): number {
  if (!numbers.length) return 0;
  return numbers.reduce((total, num) => total + num, 0) / numbers.length;
}

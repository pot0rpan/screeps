import config from 'config';

export function isNthTick(number: number): boolean {
  return Game.time % number === 0;
}

export function isFriendlyOwner(username: string): boolean {
  return (
    config.USERNAME === username || config.FRIENDLY_NAMES.includes(username)
  );
}

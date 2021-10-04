// https://github.com/Arcath/screeps-fns/blob/master/src/cache-in-tick/index.ts

let cache: { [key: string]: any } = {};
let cacheTick = 0;

/**
 * Stores the computed value for the duration of the tick.
 *
 * @param key The key to store the value under (must be unique)
 * @param create A function that returns the value to store, will only be called once in a tick.
 */
export default function cacheInTick<T>(key: string, create: () => T): T {
  if (cacheTick !== Game.time) {
    cache = {};
    cacheTick = Game.time;
  }

  if (cache[key]) {
    return cache[key];
  }

  cache[key] = create();
  return cache[key];
}

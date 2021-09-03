export function isDamaged(struct: Structure): boolean {
  if (struct.hits === undefined) return false;
  return struct.hits < struct.hitsMax;
}

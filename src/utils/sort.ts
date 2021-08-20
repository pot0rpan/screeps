export const sortByRange =
  (target: _HasRoomPosition) =>
  (a: _HasRoomPosition, b: _HasRoomPosition): number => {
    return a.pos.getRangeTo(target) - b.pos.getRangeTo(target);
  };

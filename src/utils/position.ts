export function reverseDirection(direction: DirectionConstant) {
  const directions = [
    TOP,
    TOP_RIGHT,
    RIGHT,
    BOTTOM_RIGHT,
    TOP_LEFT,
    LEFT,
    BOTTOM_LEFT,
    BOTTOM,
  ];

  return directions[directions.length - directions.indexOf(direction) - 1];
}

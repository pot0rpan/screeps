import { average } from 'utils';

export class RoomVisuals {
  roomName: string;

  constructor(roomName: string) {
    this.roomName = roomName;
  }

  public printText(text: string, x: number, y: number, style: TextStyle = {}) {
    const defaultStyle = {
      align: 'left',
      opacity: 0.8,
    };
    const opts = Object.assign(defaultStyle, style);
    new RoomVisual(this.roomName).text(text, x, y, opts);
  }

  public printProgressBar(
    numerator: number,
    denominator: number,
    x: number,
    y: number
  ): void {
    const visual = new RoomVisual(this.roomName);
    const width = 6;
    visual.text(
      `${
        Number.isInteger(numerator) ? numerator : numerator.toFixed(1)
      } / ${denominator}`,
      x + width / 2,
      y - 0.1,
      {
        font: 0.6,
      }
    );
    visual.rect(x, y - 0.8, width, 1, {
      stroke: '#ffffff',
      fill: 'transparent',
    });
    visual.rect(x, y - 0.8, (numerator / denominator) * width, 1, {
      fill: '#ffffff88',
    });
  }

  // Create scale function to map number to range
  public createScale(
    oldMin: number,
    oldMax: number,
    newMin: number,
    newMax: number
  ): (num: number) => number {
    return (num: number) =>
      ((num - oldMin) * (newMax - newMin)) / (oldMax - oldMin) + newMin;
  }

  public printGraph(
    x: number,
    y: number,
    width: number,
    height: number,
    data: number[],
    min?: number,
    max?: number
  ) {
    const visual = new RoomVisual(this.roomName);

    // // Print background
    // visual.rect(x, y, width, height, {
    //   fill: '#ffffff88',
    // });

    const minY = min ?? _.min(data);
    const maxY = max ?? _.max(data);

    const scaleY = this.createScale(minY, maxY, y + height, y);

    const xWidth = width / data.length;
    const startX = x + xWidth / 2;
    let currentX = startX;

    // Print line
    const points: [number, number][] = [];

    for (const yVal of data) {
      points.push([currentX, scaleY(yVal)]);
      currentX += xWidth;
    }

    visual.poly(points, {
      stroke: 'white',
      fill: 'transparent',
      strokeWidth: 0.1,
      opacity: 1,
    });

    // Axes
    const TICK_LENGTH = 0.25;

    // X axis
    visual.line(x, y + height, x + width, y + height, { opacity: 1 });
    // for (const [x] of points) {
    //   visual.line(x, y + height - TICK_LENGTH, x, y + height + TICK_LENGTH, {
    //     opacity: 1,
    //   });
    // }
    visual.line(startX, y + height, startX, y + height + TICK_LENGTH, {
      opacity: 1,
    });
    this.printText(
      '' + data.length * -1,
      startX,
      y + height + TICK_LENGTH + 0.75,
      { align: 'center' }
    );
    visual.line(
      startX + xWidth * (data.length - 1),
      y + height,
      startX + xWidth * (data.length - 1),
      y + height + TICK_LENGTH,
      {
        opacity: 1,
      }
    );
    this.printText(
      '0',
      startX + xWidth * (data.length - 1),
      y + height + TICK_LENGTH + 0.75,
      { align: 'center' }
    );

    // Y axis
    visual.line(x, y, x, y + height, { opacity: 1 });
    visual.line(x - TICK_LENGTH, y, x, y, { opacity: 1 });
    this.printText('' + maxY, x - TICK_LENGTH - 0.25, y + 0.25, {
      align: 'right',
    });
    visual.line(x - TICK_LENGTH, y + height, x, y + height, { opacity: 1 });
    this.printText('' + minY, x - TICK_LENGTH - 0.25, y + height + 0.25, {
      align: 'right',
    });

    // Average line
    const avg = Math.round(average(...data));
    const avgScaled = scaleY(avg);
    visual.line(x - TICK_LENGTH, avgScaled, x + width, avgScaled, {
      width: 0.05,
      opacity: 0.6,
    });
    this.printText('' + avg, x - TICK_LENGTH - 0.25, avgScaled + 0.25, {
      align: 'right',
    });
  }
}

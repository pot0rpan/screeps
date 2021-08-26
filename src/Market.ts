import { Empire } from 'Empire';
import { maxToStoreOfResource } from 'utils/room';

type ResourceCache = {
  [roomName: string]: { [resourceType: string]: number };
};

export class Market {
  private cache: ResourceCache = {};
  private lastCache: number = 0;
  private RENEW_CACHE = 50;
  private MIN_TO_SELL = 1000;

  private populateCache(empire: Empire): void {
    for (const roomName in empire.colonies) {
      const room = Game.rooms[roomName];
      if (!room.terminal || !room.terminal.isActive()) continue;

      if (!this.cache[roomName]) this.cache[roomName] = {};

      for (const resourceType in room.terminal.store) {
        this.cache[roomName][resourceType] =
          room.terminal.store[resourceType as ResourceConstant];
      }
    }

    this.lastCache = Game.time;
  }

  public run(empire: Empire) {
    const start = Game.cpu.getUsed();
    if (Game.time - this.lastCache > this.RENEW_CACHE) {
      this.populateCache(empire);
    }

    for (const roomName in empire.colonies) {
      this.handleSellingExcessResources(roomName);
    }

    console.log('Market CPU:', Game.cpu.getUsed() - start);
  }

  private handleSellingExcessResources(roomName: string): void {
    const cache = this.cache[roomName];
    const excessResources: { type: ResourceConstant; amount: number }[] = [];
    const terminal = Game.rooms[roomName].terminal;
    if (!terminal) return;
    if (terminal.cooldown) return;

    for (const resourceType in cache) {
      // Energy unloaded on controller or other colonies in need
      if (resourceType === RESOURCE_ENERGY) continue;

      const amount = cache[resourceType];
      const excess =
        amount -
        maxToStoreOfResource(
          Game.rooms[roomName],
          resourceType as ResourceConstant,
          true
        );

      if (excess > this.MIN_TO_SELL) {
        excessResources.push({
          type: resourceType as ResourceConstant,
          amount: excess,
        });
      }
    }

    if (!excessResources.length) {
      console.log('Market: no surplus resources to sell');
      return;
    }

    // Try to sell resource with most excess first
    for (const toSell of excessResources.sort((a, b) => b.amount - a.amount)) {
      const transactionCostCache: Record<string, number> = {};

      // Look for best sell order which can take the full amount
      const bestBuyOrder = this.getBuyOrders(toSell.type)
        .filter(order => {
          if (!order.roomName) return false;
          if (order.remainingAmount < toSell.amount) return false;

          // Make sure transaction won't cost too much to be worth it
          // Cache it for sorting in next step
          transactionCostCache[order.id] = Game.market.calcTransactionCost(
            toSell.amount,
            roomName,
            order.roomName
          );

          // Filter out orders where transaction cost is too high
          if (
            transactionCostCache[order.id] >
            (toSell.amount * order.price) / 3
          ) {
            return false;
          }
          return true;
        })
        // Sort by max sell profit by subtracting cost
        .sort(
          (a, b) =>
            b.price * toSell.amount -
            transactionCostCache[b.id] -
            (a.price * toSell.amount - transactionCostCache[a.id])
        )[0];

      if (!bestBuyOrder) {
        console.log('No buy orders found for', toSell.type);
        return;
      }

      console.log(
        `Found buy order to sell to, will make ${
          bestBuyOrder.price * toSell.amount
        } revenue selling ${toSell.amount} ${toSell.type} with ${
          transactionCostCache[bestBuyOrder.id]
        } energy cost`,
        JSON.stringify(bestBuyOrder, null, 2)
      );

      Game.market.deal(bestBuyOrder.id, toSell.amount, roomName);
    }
  }

  private getBuyOrders(resourceType: ResourceConstant): Order[] {
    return Game.market.getAllOrders({ type: ORDER_BUY, resourceType });
  }
}

// [
//   {
//     resourceType: 'O',
//     date: '2021-08-09',
//     transactions: 3197,
//     volume: 2874522,
//     avgPrice: 0.977,
//     stddevPrice: 0.237,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-10',
//     transactions: 2919,
//     volume: 2779106,
//     avgPrice: 0.955,
//     stddevPrice: 0.277,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-11',
//     transactions: 2466,
//     volume: 2618656,
//     avgPrice: 1.05,
//     stddevPrice: 0.257,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-12',
//     transactions: 2524,
//     volume: 2016999,
//     avgPrice: 0.864,
//     stddevPrice: 0.199,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-13',
//     transactions: 1795,
//     volume: 1910302,
//     avgPrice: 0.858,
//     stddevPrice: 0.29,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-14',
//     transactions: 2404,
//     volume: 2591812,
//     avgPrice: 0.999,
//     stddevPrice: 0.246,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-15',
//     transactions: 2909,
//     volume: 2578603,
//     avgPrice: 0.956,
//     stddevPrice: 0.276,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-16',
//     transactions: 2842,
//     volume: 2661013,
//     avgPrice: 1.232,
//     stddevPrice: 0.466,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-17',
//     transactions: 2069,
//     volume: 2365572,
//     avgPrice: 0.944,
//     stddevPrice: 0.286,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-18',
//     transactions: 2769,
//     volume: 2490321,
//     avgPrice: 0.887,
//     stddevPrice: 0.228,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-19',
//     transactions: 2775,
//     volume: 2696549,
//     avgPrice: 1.037,
//     stddevPrice: 0.237,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-20',
//     transactions: 1941,
//     volume: 2460572,
//     avgPrice: 0.972,
//     stddevPrice: 0.244,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-21',
//     transactions: 3110,
//     volume: 2959249,
//     avgPrice: 0.935,
//     stddevPrice: 0.253,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-22',
//     transactions: 1627,
//     volume: 1711930,
//     avgPrice: 0.926,
//     stddevPrice: 0.304,
//   },
//   {
//     resourceType: 'O',
//     date: '2021-08-23',
//     transactions: 12,
//     volume: 9498,
//     avgPrice: 0.964,
//     stddevPrice: 0.03,
//   },
// ];

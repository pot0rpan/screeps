import { Empire } from 'Empire';
import { average } from 'utils';
import { targetResourceAmount } from 'utils/room';

type ResourceCache = {
  [roomName: string]: { [resourceType: string]: number };
};

type ColonyNeeds = {
  [resourceType: string]: {
    needs: { roomName: string; amount: number }[];
    has: { roomName: string; amount: number }[];
  };
};

// Share only basic resources with each other,
// Rely on own labs for other resources for now
const RESOURCES_TO_SHARE: ResourceConstant[] = [
  RESOURCE_ENERGY,
  RESOURCE_HYDROGEN,
  RESOURCE_OXYGEN,
  RESOURCE_UTRIUM,
  RESOURCE_LEMERGIUM,
  RESOURCE_KEANIUM,
  RESOURCE_ZYNTHIUM,
  RESOURCE_CATALYST,
];

export class Market {
  private cache: ResourceCache = {};
  private MIN_TO_SEND = 1000;

  // Counts all resources in each room's terminal - NOT storage
  // Operator creep should keep both roughly even so no need to check both
  private populateResourceCache(empire: Empire): void {
    for (const roomName in empire.colonies) {
      const room = Game.rooms[roomName];
      if (!room.terminal || !room.terminal.isActive()) continue;

      if (!this.cache[roomName]) this.cache[roomName] = {};

      for (const resourceType in room.terminal.store) {
        if (room.terminal.store[resourceType as ResourceConstant]) {
          this.cache[roomName][resourceType] =
            room.terminal.store[resourceType as ResourceConstant];
        }
      }
    }
  }

  public run(empire: Empire) {
    const start = Game.cpu.getUsed();

    this.populateResourceCache(empire);

    const colonyNeeds = this.getColonyNeeds(empire);

    console.log(JSON.stringify(colonyNeeds, null, 2));

    const isSharingBetweenColonies = this.handleColonyNeeds(colonyNeeds);

    if (!isSharingBetweenColonies) {
      const takenOrders: { [orderId: string]: true } = {};

      for (const roomName in empire.colonies) {
        const orderId = this.handleSellingExcessResources(
          roomName,
          takenOrders
        );

        if (orderId) takenOrders[orderId] = true;
      }
    }

    global.stats.profileLog('Empire Market', start, ['market']);
  }

  private getColonyNeeds(empire: Empire): ColonyNeeds {
    const count: ColonyNeeds = {};

    for (const roomName in empire.colonies) {
      const cache = this.cache[roomName];
      if (!cache) continue; // Room must not have terminal yet

      for (const resourceType of RESOURCES_TO_SHARE) {
        const amount = cache[resourceType] ?? 0;
        const targetAmount = targetResourceAmount(
          Game.rooms[roomName],
          resourceType
        );

        if (Math.abs(amount - targetAmount) < this.MIN_TO_SEND) continue;

        // Initialize count object
        if (!count[resourceType]) {
          count[resourceType] = { needs: [], has: [] };
        }

        if (amount > targetAmount) {
          count[resourceType].has.push({
            roomName,
            amount: amount - targetAmount,
          });
        } else {
          count[resourceType].needs.push({
            roomName,
            amount: targetAmount - amount,
          });
        }
      }
    }

    return count;
  }

  // Returns true if any colony transfers are performed
  // It may take a few runs to fully balance all colonies,
  // since Operators will move some from terminal to storage after receiving.
  // So this way we know if we're free to sell excess on market or wait for more balancing
  private handleColonyNeeds(colonyNeeds: ColonyNeeds): boolean {
    const willSendThisTick: string[] = [];

    for (const resourceType in colonyNeeds) {
      const resource = colonyNeeds[resourceType];
      if (resource.has.length && resource.needs.length) {
        // Get colony which has the most to spare and isn't already sending this tick
        const has = resource.has
          .filter(({ roomName }) => !willSendThisTick.includes(roomName))
          .sort((a, b) => b.amount - a.amount)[0];

        if (!has) continue;

        // Get colony most in need of the resource
        const needs = resource.needs.sort((a, b) => b.amount - a.amount)[0];

        // Perform transfer
        const fromTerminal = Game.rooms[has.roomName].terminal!;
        const amount = Math.min(has.amount, needs.amount);

        console.log(
          `<span style="color: yellow">[Market] Sending ${amount} excess ${resourceType} from ${has.roomName} to ${needs.roomName}</span>`
        );

        fromTerminal.send(
          resourceType as ResourceConstant,
          amount,
          needs.roomName
        );

        willSendThisTick.push(has.roomName);
      }
    }

    return !!willSendThisTick.length;
  }

  // This only gets called if no inter-colony transfers are made
  // That means any excess is fine to sell on the market
  // Return order.id if selling so other rooms don't use same order
  private handleSellingExcessResources(
    roomName: string,
    takenOrders: { [orderId: string]: true }
  ): string | void {
    const cache = this.cache[roomName];
    const excessResources: { type: ResourceConstant; amount: number }[] = [];
    const terminal = Game.rooms[roomName].terminal;
    if (!terminal || terminal.cooldown) return;

    for (const resourceType in cache) {
      // Save energy for controller or other colonies in need
      if (resourceType === RESOURCE_ENERGY) continue;

      const amount = cache[resourceType];
      const excess =
        amount -
        targetResourceAmount(
          Game.rooms[roomName],
          resourceType as ResourceConstant
        );

      if (excess > this.MIN_TO_SEND) {
        excessResources.push({
          type: resourceType as ResourceConstant,
          amount: excess,
        });
      }
    }

    if (!excessResources.length) return;

    // Try to sell resource with most excess first
    for (const toSell of excessResources.sort((a, b) => b.amount - a.amount)) {
      const transactionCostCache: Record<string, number> = {};

      // Look for best sell order based on total profit
      const bestBuyOrder = this.getBuyOrders(toSell.type)
        .filter(order => {
          if (!order.roomName) return false;
          if (takenOrders[order.id]) return false;

          // Make sure price isn't too far below average of last 3 days
          const avgPrice = average(
            ...Game.market
              .getHistory(toSell.type)
              .slice(11) // Last 3 of 14 days: 11, 12, 13
              .map(history => history.avgPrice)
          );

          if (order.price < avgPrice * 0.75) return false;

          const maxCanSell = Math.min(toSell.amount, order.remainingAmount);

          // Make sure transaction won't cost too much to be worth it
          // Cache it for sorting in next step
          transactionCostCache[order.id] = Game.market.calcTransactionCost(
            maxCanSell,
            roomName,
            order.roomName
          );

          // Filter out orders where transaction cost is too high
          if (transactionCostCache[order.id] > maxCanSell * order.price) {
            return false;
          }
          return true;
        })
        // Sort by max sell profit by subtracting cost
        .sort(
          (a, b) =>
            b.price * Math.min(toSell.amount, b.remainingAmount) -
            transactionCostCache[b.id] -
            (a.price * Math.min(toSell.amount, a.remainingAmount) -
              transactionCostCache[a.id])
        )[0];

      if (!bestBuyOrder) {
        console.log(
          `[Market] [${roomName}] No good buy orders found for ${toSell.amount} excess ${toSell.type}`
        );
        return;
      }

      const sellAmount = Math.min(toSell.amount, bestBuyOrder.remainingAmount);

      console.log(
        `<span style="color: yellow">[Market] [${roomName}] Initiating sale of ${sellAmount} ${
          toSell.type
        }: will make ${bestBuyOrder.price * sellAmount} credits with ${
          transactionCostCache[bestBuyOrder.id]
        } energy cost</span>`
      );

      Game.market.deal(bestBuyOrder.id, sellAmount, roomName);
      return bestBuyOrder.id;
    }
  }

  private getBuyOrders(resourceType: ResourceConstant): Order[] {
    return Game.market.getAllOrders({ type: ORDER_BUY, resourceType });
  }
}

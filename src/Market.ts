import { Empire } from 'Empire';
import { average, formatNumber } from 'utils';
import { printTable } from 'utils/console';
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
  private empire: Empire;
  private cache: ResourceCache = {};
  private MIN_TO_SEND = 1000;

  constructor(empire: Empire) {
    this.empire = empire;
  }

  // Counts all resources in each room's terminal - NOT storage
  // Operator creep should keep both roughly even so no need to check both
  private populateResourceCache(): void {
    for (const roomName in this.empire.colonies) {
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

  public run() {
    const start = Game.cpu.getUsed();

    this.populateResourceCache();

    const colonyNeeds = this.getColonyNeeds();

    console.log(JSON.stringify(colonyNeeds, null, 2));

    const terminalsUsedThisTick: { [roomName: string]: true } = {};

    this.handleColonyNeeds(colonyNeeds, terminalsUsedThisTick);

    this.handleBuyingLowResources(colonyNeeds, terminalsUsedThisTick);

    this.handleSellingExcessResources(terminalsUsedThisTick);

    this.printColonyBudgets();

    global.stats.profileLog('Empire Market', start, ['market']);
  }

  private getColonyNeeds(): ColonyNeeds {
    const count: ColonyNeeds = {};

    for (const roomName in this.empire.colonies) {
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

  // Edits provided map of used terminals if any colony transfers are performed
  // It may take a few runs to fully balance all colonies,
  // since Operators will move some from terminal to storage after receiving.
  // So this way we know if we're free to sell excess on market or wait for more balancing
  private handleColonyNeeds(
    colonyNeeds: ColonyNeeds,
    terminalsUsedThisTick: { [roomName: string]: true }
  ): void {
    for (const resourceType in colonyNeeds) {
      const resource = colonyNeeds[resourceType];
      if (resource.has.length && resource.needs.length) {
        // Get colony which has the most to spare and isn't already sending this tick
        const has = resource.has
          .filter(({ roomName }) => !terminalsUsedThisTick[roomName])
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

        terminalsUsedThisTick[has.roomName] = true;
      }
    }
  }

  // This only gets called if no inter-colony transfers are made
  private handleBuyingLowResources(
    colonyNeeds: ColonyNeeds,
    terminalsUsedThisTick: {
      [roomName: string]: true;
    }
  ): void {
    const takenOrders: { [orderId: string]: true } = {};
    let creditsRemaining = Game.market.credits;
    if (creditsRemaining < 1000) return;

    for (const roomName in this.empire.colonies) {
      if (creditsRemaining < 1000) return; // Don't overspend

      if (terminalsUsedThisTick[roomName]) continue;
      if ((Memory.colonies![roomName]!.budget ?? -1) < 0) continue;
      const terminal = Game.rooms[roomName].terminal;
      if (!terminal || terminal.cooldown) return;

      for (const resourceType in colonyNeeds) {
        // TODO: Implement creating our own orders for buying energy
        // Otherwise the transaction cost is too high to be worth it
        if (resourceType === RESOURCE_ENERGY) continue;

        const { has, needs } = colonyNeeds[resourceType];

        // Make sure colony isn't possibly receiving from other colony this tick
        if (has.length) continue;

        // Make sure colony needs this resource
        const needsAmount = needs.find(
          colony => colony.roomName === roomName
        )?.amount;
        if (!needsAmount || needsAmount < this.MIN_TO_SEND) continue;

        const transactionCostCache: { [orderId: string]: number } = {};

        // Colony needs this resource, and no other colonies have it to share: buy it
        const bestSellOrder = this.getSellOrders(
          resourceType as ResourceConstant
        )
          .filter(order => {
            // Make sure we can use this order
            if (!order.roomName) return false;
            if (takenOrders[order.id]) return false;

            // Make sure price isn't too far above average of last 3 days
            const avgPrice = average(
              ...Game.market
                .getHistory(resourceType as ResourceConstant)
                .slice(11) // Last 3 of 14 days: 11, 12, 13
                .map(history => history.avgPrice)
            );

            if (order.price > avgPrice * 1.25) return false;

            const maxCanBuy = Math.min(
              needsAmount,
              order.remainingAmount,
              Math.floor(creditsRemaining / order.price)
            );

            if (maxCanBuy < 500) return false;

            // Make sure transaction won't cost too much to be worth it
            // Cache it for sorting in next step
            transactionCostCache[order.id] = Game.market.calcTransactionCost(
              maxCanBuy,
              roomName,
              order.roomName
            );

            // Filter out orders where transaction cost is too high
            if (
              transactionCostCache[order.id] > maxCanBuy * order.price ||
              (resourceType === RESOURCE_ENERGY &&
                transactionCostCache[order.id] > maxCanBuy) // Don't spend more energy than we buy
            ) {
              return false;
            }
            return true;
          })
          // Sort by lowest credit + transaction cost
          .sort(
            (a, b) =>
              a.price * Math.min(needsAmount, a.remainingAmount) +
              transactionCostCache[a.id] -
              (b.price * Math.min(needsAmount, b.remainingAmount) +
                transactionCostCache[b.id])
          )[0];

        if (!bestSellOrder) {
          console.log(
            `[Market] [${roomName}] No good sell orders found for ${formatNumber(
              needsAmount
            )} needed ${resourceType}`
          );
          continue;
        }

        const buyAmount = Math.min(needsAmount, bestSellOrder.remainingAmount);

        console.log(
          `<span style="color: yellow">[Market] [${roomName}] Initiating purchase of ${formatNumber(
            buyAmount
          )} ${resourceType}: will cost ${formatNumber(
            bestSellOrder.price * buyAmount
          )} credits plus ${
            transactionCostCache[bestSellOrder.id]
          } energy cost</span>`
        );

        if (Game.market.deal(bestSellOrder.id, buyAmount, roomName) === OK) {
          this.updateColonyBudget(
            roomName,
            bestSellOrder.price * buyAmount * -1
          );
          takenOrders[bestSellOrder.id] = true;
          terminalsUsedThisTick[roomName] = true;
          break;
        }
      }
    }
  }

  private handleSellingExcessResources(terminalsUsedThisTick: {
    [roomName: string]: true;
  }): void {
    const takenOrders: { [orderId: string]: true } = {};

    for (const roomName in this.empire.colonies) {
      if (terminalsUsedThisTick[roomName]) continue;
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

      if (!excessResources.length) continue;

      // Try to sell resource with most excess first
      for (const toSell of excessResources.sort(
        (a, b) => b.amount - a.amount
      )) {
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
            `[Market] [${roomName}] No good buy orders found for ${formatNumber(
              toSell.amount
            )} excess ${toSell.type}`
          );
          continue;
        }

        const sellAmount = Math.min(
          toSell.amount,
          bestBuyOrder.remainingAmount
        );

        console.log(
          `<span style="color: yellow">[Market] [${roomName}] Initiating sale of ${formatNumber(
            sellAmount
          )} ${toSell.type}: will make ${formatNumber(
            bestBuyOrder.price * sellAmount
          )} credits with ${
            transactionCostCache[bestBuyOrder.id]
          } energy cost</span>`
        );

        if (Game.market.deal(bestBuyOrder.id, sellAmount, roomName) === OK) {
          this.updateColonyBudget(roomName, bestBuyOrder.price * sellAmount);
          takenOrders[bestBuyOrder.id] = true;
          terminalsUsedThisTick[roomName] = true;
          break;
        }
      }
    }
  }

  private getBuyOrders(resourceType: ResourceConstant): Order[] {
    return Game.market.getAllOrders({ type: ORDER_BUY, resourceType });
  }

  private getSellOrders(resourceType: ResourceConstant): Order[] {
    return Game.market.getAllOrders({ type: ORDER_SELL, resourceType });
  }

  private updateColonyBudget(roomName: string, transactionValue: number): void {
    if (Memory.colonies![roomName].budget === undefined) {
      Memory.colonies![roomName].budget = 0;
    }
    Memory.colonies![roomName].budget! += Math.round(transactionValue);
  }

  private printColonyBudgets(): void {
    printTable(
      ['Room', 'Budget'],
      Object.keys(this.empire.colonies)
        .filter(roomName => Memory.colonies?.[roomName]?.budget)
        .map(roomName => [
          roomName,
          formatNumber(Memory.colonies![roomName].budget!),
        ])
    );
  }
}

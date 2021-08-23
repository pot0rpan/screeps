declare global {
  interface StructureTerminal {
    getSellOrders(resourceType: ResourceConstant): Order[];
  }
}

export default (() => {
  StructureTerminal.prototype.getSellOrders = function (
    resourceType: ResourceConstant
  ) {
    const orders: Order[] = [];
    for (const id in Game.market.orders) {
      const order = Game.market.orders[id];
      if (
        order.type === ORDER_SELL &&
        order.roomName === this.pos.roomName &&
        order.resourceType === resourceType
      ) {
        orders.push(order);
      }
    }
    return orders;
  };
})();

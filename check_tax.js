const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // Get latest order
  const latestOrder = await prisma.order.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      orderItems: true,
    }
  });
  
  if (!latestOrder) {
    return;
  }

  
  let itemTaxSum = 0;
  for (const item of latestOrder.orderItems) {
    itemTaxSum += parseFloat(item.taxAmount);
  }
  
  await prisma.$disconnect();
})();

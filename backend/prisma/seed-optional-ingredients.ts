import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting optional ingredients seeding...");

  // Optional ingredients to seed
  const optionalIngredients = [
    {
      name: "Onion",
      description: "Fresh sliced or diced onions",
    },
    {
      name: "Mushroom",
      description: "Sautéed or fresh mushrooms",
    },
    {
      name: "Cheese",
      description: "Extra cheese topping",
    },
    {
      name: "Tomato",
      description: "Fresh sliced tomatoes",
    },
    {
      name: "Lettuce",
      description: "Crisp fresh lettuce",
    },
    {
      name: "Pickles",
      description: "Dill pickles",
    },
    {
      name: "Bacon",
      description: "Crispy bacon strips",
    },
    {
      name: "Jalapeños",
      description: "Spicy jalapeño peppers",
    },
    {
      name: "Olives",
      description: "Black or green olives",
    },
    {
      name: "Peppers",
      description: "Bell peppers (red, green, yellow)",
    },
    {
      name: "Avocado",
      description: "Fresh sliced avocado",
    },
    {
      name: "Cucumber",
      description: "Fresh cucumber slices",
    },
    {
      name: "Corn",
      description: "Sweet corn kernels",
    },
    {
      name: "Black Beans",
      description: "Seasoned black beans",
    },
    {
      name: "Pineapple",
      description: "Fresh pineapple chunks",
    },
    {
      name: "Spinach",
      description: "Fresh baby spinach leaves",
    },
    {
      name: "Red Onion",
      description: "Sliced red onions",
    },
    {
      name: "Cilantro",
      description: "Fresh cilantro leaves",
    },
    {
      name: "Garlic",
      description: "Minced or roasted garlic",
    },
    {
      name: "Carrots",
      description: "Shredded or sliced carrots",
    },
    {
      name: "Broccoli",
      description: "Steamed or fresh broccoli florets",
    },
    {
      name: "Cauliflower",
      description: "Roasted or fresh cauliflower",
    },
    {
      name: "Zucchini",
      description: "Grilled or fresh zucchini",
    },
    {
      name: "Bell Peppers",
      description: "Mixed bell peppers",
    },
    {
      name: "Sun-dried Tomatoes",
      description: "Sun-dried tomato pieces",
    },
  ];

  let createdCount = 0;
  let skippedCount = 0;

  for (const ingredient of optionalIngredients) {
    // Check if ingredient already exists
    const existing = await prisma.optionalIngredient.findFirst({
      where: {
        name: ingredient.name,
      },
    });

    if (existing) {
      console.log(`⏭️  Skipped (already exists): ${ingredient.name}`);
      skippedCount++;
    } else {
      await prisma.optionalIngredient.create({
        data: ingredient,
      });
      console.log(`✅ Created optional ingredient: ${ingredient.name}`);
      createdCount++;
    }
  }

  console.log("\n🎉 Optional ingredients seeding completed!");
  console.log(`📊 Summary:`);
  console.log(`   - Created: ${createdCount} optional ingredients`);
  console.log(
    `   - Skipped: ${skippedCount} optional ingredients (already exist)`
  );
  console.log(`   - Total: ${optionalIngredients.length} optional ingredients`);
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

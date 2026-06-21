import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...");

  // Clear existing data
  await prisma.orderItemAddOn.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.mealAddOn.deleteMany();
  await prisma.mealSize.deleteMany();
  await prisma.mealDeclaration.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.addOn.deleteMany();
  await prisma.declaration.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  console.log("🧹 Cleared existing data");

  // Create 12 Declarations
  const declarations = [
    {
      name: "Vegan",
      type: "Dietary",
      description: "Contains no animal products or by-products",
      icon: "🌱",
    },
    {
      name: "Vegetarian",
      type: "Dietary",
      description: "Contains no meat or fish, but may contain dairy or eggs",
      icon: "🥗",
    },
    {
      name: "Gluten-Free",
      type: "Dietary",
      description: "Does not contain gluten",
      icon: "🌾",
    },
    {
      name: "Contains Nuts",
      type: "Allergen",
      description: "Contains tree nuts or peanuts",
      icon: "🥜",
    },
    {
      name: "Contains Dairy",
      type: "Allergen",
      description: "Contains milk or dairy products",
      icon: "🥛",
    },
    {
      name: "Halal",
      type: "Label",
      description: "Prepared according to Islamic dietary laws",
      icon: "🕌",
    },
    {
      name: "Spicy",
      type: "Label",
      description: "Contains spicy ingredients or hot peppers",
      icon: "🌶️",
    },
    {
      name: "Low Calorie",
      type: "Label",
      description: "Contains fewer calories than standard servings",
      icon: "💚",
    },
    {
      name: "Contains Shellfish",
      type: "Allergen",
      description: "Contains crustaceans or mollusks",
      icon: "🦐",
    },
    {
      name: "Keto-Friendly",
      type: "Dietary",
      description: "Suitable for ketogenic diet (low carb, high fat)",
      icon: "🥑",
    },
    {
      name: "Organic",
      type: "Label",
      description: "Made with organic ingredients",
      icon: "🌿",
    },
    {
      name: "Sugar-Free",
      type: "Label",
      description: "Contains no added sugars",
      icon: "🍯",
    },
  ];

  const createdDeclarations = [];
  for (const declaration of declarations) {
    const created = await prisma.declaration.create({
      data: declaration,
    });
    createdDeclarations.push(created);
    console.log(`✅ Created declaration: ${declaration.name}`);
  }

  // Create 8 Categories
  const categories = [
    {
      name: "Burgers",
      description: "Juicy, flavorful burgers made with premium ingredients",
      image:
        "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500",
    },
    {
      name: "Pizza",
      description: "Authentic wood-fired pizzas with fresh toppings",
      image:
        "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500",
    },
    {
      name: "Pasta",
      description: "Classic Italian pasta dishes with homemade sauces",
      image:
        "https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?w=500",
    },
    {
      name: "Salads",
      description: "Fresh, healthy salads with seasonal ingredients",
      image:
        "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500",
    },
    {
      name: "Seafood",
      description: "Fresh catches from the ocean, prepared to perfection",
      image: "https://images.unsplash.com/photo-1553909489-cd47e0ef937f?w=500",
    },
    {
      name: "Desserts",
      description: "Sweet treats and decadent desserts to end your meal",
      image: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=500",
    },
    {
      name: "Beverages",
      description: "Refreshing drinks, smoothies, and specialty beverages",
      image: "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=500",
    },
    {
      name: "Appetizers",
      description: "Perfect starters to kick off your dining experience",
      image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=500",
    },
  ];

  const createdCategories = [];
  for (const category of categories) {
    const created = await prisma.category.create({
      data: category,
    });
    createdCategories.push(created);
    console.log(`✅ Created category: ${category.name}`);
  }

  // Create meals for each category
  const mealsData = [
    // BURGERS
    {
      categoryName: "Burgers",
      meals: [
        {
          name: "Classic Cheeseburger",
          description:
            "Juicy beef patty with melted cheddar cheese, lettuce, tomato, and our special sauce",
          basePrice: 12.99,
          image:
            "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 3.0 },
          ],
          addOns: [
            { name: "Extra Cheese", price: 1.5 },
            { name: "Bacon", price: 2.5 },
            { name: "Avocado", price: 2.0 },
            { name: "Mushrooms", price: 1.5 },
            { name: "Onion Rings", price: 2.0 },
          ],
        },
        {
          name: "BBQ Bacon Burger",
          description:
            "Smoky BBQ sauce, crispy bacon, caramelized onions, and Swiss cheese",
          basePrice: 15.99,
          image:
            "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 3.0 },
          ],
          addOns: [
            { name: "Extra Bacon", price: 2.5 },
            { name: "Jalapeños", price: 1.0 },
            { name: "Fried Egg", price: 2.0 },
            { name: "Guacamole", price: 2.5 },
          ],
        },
        {
          name: "Veggie Burger",
          description:
            "Plant-based patty with fresh vegetables, hummus, and tahini sauce",
          basePrice: 13.99,
          image:
            "https://images.unsplash.com/photo-1525059696034-4967a729002e?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 3.0 },
          ],
          addOns: [
            { name: "Extra Hummus", price: 1.5 },
            { name: "Grilled Portobello", price: 2.5 },
            { name: "Sun-dried Tomatoes", price: 1.5 },
            { name: "Vegan Cheese", price: 2.0 },
          ],
        },
      ],
    },
    // PIZZA
    {
      categoryName: "Pizza",
      meals: [
        {
          name: "Margherita Pizza",
          description:
            "Classic Italian pizza with fresh mozzarella, basil, and San Marzano tomatoes",
          basePrice: 16.99,
          image:
            "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500",
          sizes: [
            { name: 'Small (10")', price: 0 },
            { name: 'Medium (12")', price: 4.0 },
            { name: 'Large (14")', price: 7.0 },
          ],
          addOns: [
            { name: "Extra Mozzarella", price: 2.5 },
            { name: "Fresh Basil", price: 1.5 },
            { name: "Garlic", price: 1.0 },
            { name: "Olive Oil Drizzle", price: 1.0 },
          ],
        },
        {
          name: "Pepperoni Supreme",
          description:
            "Loaded with pepperoni, sausage, bell peppers, onions, and mushrooms",
          basePrice: 19.99,
          image:
            "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500",
          sizes: [
            { name: 'Small (10")', price: 0 },
            { name: 'Medium (12")', price: 4.0 },
            { name: 'Large (14")', price: 7.0 },
          ],
          addOns: [
            { name: "Extra Pepperoni", price: 2.5 },
            { name: "Extra Cheese", price: 2.5 },
            { name: "Jalapeños", price: 1.5 },
            { name: "Black Olives", price: 1.5 },
          ],
        },
        {
          name: "BBQ Chicken Pizza",
          description:
            "Grilled chicken, BBQ sauce, red onions, and cilantro on our signature crust",
          basePrice: 18.99,
          image:
            "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=500",
          sizes: [
            { name: 'Small (10")', price: 0 },
            { name: 'Medium (12")', price: 4.0 },
            { name: 'Large (14")', price: 7.0 },
          ],
          addOns: [
            { name: "Extra Chicken", price: 3.0 },
            { name: "Bacon", price: 2.5 },
            { name: "Pineapple", price: 1.5 },
            { name: "Cheddar Cheese", price: 2.0 },
          ],
        },
      ],
    },
    // PASTA
    {
      categoryName: "Pasta",
      meals: [
        {
          name: "Spaghetti Carbonara",
          description:
            "Classic Roman pasta with eggs, pancetta, pecorino cheese, and black pepper",
          basePrice: 17.99,
          image:
            "https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 4.0 },
          ],
          addOns: [
            { name: "Extra Pancetta", price: 3.0 },
            { name: "Parmesan Cheese", price: 2.0 },
            { name: "Truffle Oil", price: 4.0 },
            { name: "Fresh Herbs", price: 1.5 },
          ],
        },
        {
          name: "Chicken Alfredo",
          description:
            "Creamy Alfredo sauce with grilled chicken breast and fettuccine",
          basePrice: 16.99,
          image:
            "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 4.0 },
          ],
          addOns: [
            { name: "Extra Chicken", price: 3.0 },
            { name: "Broccoli", price: 2.0 },
            { name: "Mushrooms", price: 2.0 },
            { name: "Sun-dried Tomatoes", price: 2.5 },
          ],
        },
        {
          name: "Penne Arrabbiata",
          description:
            "Spicy tomato sauce with garlic, red peppers, and fresh basil",
          basePrice: 15.99,
          image:
            "https://images.unsplash.com/photo-1551892374-ecf8754cf8b0?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 4.0 },
          ],
          addOns: [
            { name: "Extra Spice", price: 1.0 },
            { name: "Italian Sausage", price: 3.5 },
            { name: "Olives", price: 2.0 },
            { name: "Fresh Basil", price: 1.5 },
          ],
        },
      ],
    },
    // SALADS
    {
      categoryName: "Salads",
      meals: [
        {
          name: "Caesar Salad",
          description:
            "Crisp romaine lettuce, parmesan cheese, croutons, and our house Caesar dressing",
          basePrice: 12.99,
          image:
            "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 3.0 },
          ],
          addOns: [
            { name: "Grilled Chicken", price: 4.0 },
            { name: "Shrimp", price: 5.0 },
            { name: "Avocado", price: 2.5 },
            { name: "Extra Parmesan", price: 2.0 },
          ],
        },
        {
          name: "Mediterranean Salad",
          description:
            "Mixed greens, feta cheese, olives, tomatoes, cucumbers, and balsamic vinaigrette",
          basePrice: 14.99,
          image:
            "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 3.0 },
          ],
          addOns: [
            { name: "Grilled Salmon", price: 6.0 },
            { name: "Extra Feta", price: 2.0 },
            { name: "Artichoke Hearts", price: 2.5 },
            { name: "Hummus", price: 2.0 },
          ],
        },
        {
          name: "Asian Chicken Salad",
          description:
            "Mixed greens, grilled chicken, mandarin oranges, almonds, and sesame dressing",
          basePrice: 15.99,
          image:
            "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 3.0 },
          ],
          addOns: [
            { name: "Extra Chicken", price: 3.0 },
            { name: "Crispy Wontons", price: 2.0 },
            { name: "Edamame", price: 2.0 },
            { name: "Sesame Seeds", price: 1.0 },
          ],
        },
      ],
    },
    // SEAFOOD
    {
      categoryName: "Seafood",
      meals: [
        {
          name: "Grilled Salmon",
          description:
            "Fresh Atlantic salmon grilled to perfection with lemon herb butter",
          basePrice: 22.99,
          image:
            "https://images.unsplash.com/photo-1553909489-cd47e0ef937f?w=500",
          sizes: [
            { name: "6oz", price: 0 },
            { name: "8oz", price: 4.0 },
            { name: "10oz", price: 7.0 },
          ],
          addOns: [
            { name: "Lemon Butter Sauce", price: 2.0 },
            { name: "Herb Crust", price: 2.5 },
            { name: "Caper Sauce", price: 2.0 },
            { name: "Grilled Asparagus", price: 3.0 },
          ],
        },
        {
          name: "Fish & Chips",
          description: "Beer-battered cod with crispy fries and tartar sauce",
          basePrice: 18.99,
          image:
            "https://images.unsplash.com/photo-1579952363873-27d3bfad9c0d?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 4.0 },
          ],
          addOns: [
            { name: "Extra Fish", price: 5.0 },
            { name: "Sweet Potato Fries", price: 2.0 },
            { name: "Coleslaw", price: 2.0 },
            { name: "Malt Vinegar", price: 0.5 },
          ],
        },
        {
          name: "Shrimp Scampi",
          description:
            "Jumbo shrimp sautéed in garlic butter with white wine and linguine",
          basePrice: 19.99,
          image:
            "https://images.unsplash.com/photo-1563379091339-03246963d4d8?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 4.0 },
          ],
          addOns: [
            { name: "Extra Shrimp", price: 4.0 },
            { name: "Lobster Tail", price: 8.0 },
            { name: "Parmesan Cheese", price: 2.0 },
            { name: "Red Pepper Flakes", price: 1.0 },
          ],
        },
      ],
    },
    // DESSERTS
    {
      categoryName: "Desserts",
      meals: [
        {
          name: "Chocolate Lava Cake",
          description:
            "Warm chocolate cake with molten center, served with vanilla ice cream",
          basePrice: 8.99,
          image:
            "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=500",
          sizes: [
            { name: "Single", price: 0 },
            { name: "Double", price: 4.0 },
          ],
          addOns: [
            { name: "Extra Ice Cream", price: 2.0 },
            { name: "Whipped Cream", price: 1.5 },
            { name: "Fresh Berries", price: 2.5 },
            { name: "Caramel Sauce", price: 1.5 },
          ],
        },
        {
          name: "Tiramisu",
          description:
            "Classic Italian dessert with coffee-soaked ladyfingers and mascarpone",
          basePrice: 7.99,
          image:
            "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 3.0 },
          ],
          addOns: [
            { name: "Extra Cocoa", price: 1.0 },
            { name: "Coffee Liqueur", price: 2.5 },
            { name: "Chocolate Shavings", price: 1.5 },
            { name: "Fresh Mint", price: 1.0 },
          ],
        },
        {
          name: "New York Cheesecake",
          description: "Rich and creamy cheesecake with graham cracker crust",
          basePrice: 6.99,
          image:
            "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 3.0 },
          ],
          addOns: [
            { name: "Strawberry Sauce", price: 1.5 },
            { name: "Blueberry Compote", price: 1.5 },
            { name: "Caramel Sauce", price: 1.5 },
            { name: "Whipped Cream", price: 1.0 },
          ],
        },
      ],
    },
    // BEVERAGES
    {
      categoryName: "Beverages",
      meals: [
        {
          name: "Fresh Orange Juice",
          description: "Freshly squeezed orange juice, served chilled",
          basePrice: 4.99,
          image:
            "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=500",
          sizes: [
            { name: "Small (8oz)", price: 0 },
            { name: "Medium (12oz)", price: 1.5 },
            { name: "Large (16oz)", price: 2.5 },
          ],
          addOns: [
            { name: "Extra Pulp", price: 0.5 },
            { name: "Sparkling Water", price: 1.0 },
            { name: "Ginger", price: 1.0 },
            { name: "Mint", price: 0.5 },
          ],
        },
        {
          name: "Mango Smoothie",
          description: "Blend of fresh mango, yogurt, and honey",
          basePrice: 6.99,
          image:
            "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500",
          sizes: [
            { name: "Small (12oz)", price: 0 },
            { name: "Medium (16oz)", price: 1.5 },
            { name: "Large (20oz)", price: 2.5 },
          ],
          addOns: [
            { name: "Protein Powder", price: 2.0 },
            { name: "Chia Seeds", price: 1.5 },
            { name: "Coconut Milk", price: 1.0 },
            { name: "Extra Honey", price: 0.5 },
          ],
        },
        {
          name: "Iced Coffee",
          description:
            "Cold-brewed coffee served over ice with your choice of milk",
          basePrice: 3.99,
          image:
            "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500",
          sizes: [
            { name: "Small (12oz)", price: 0 },
            { name: "Medium (16oz)", price: 1.0 },
            { name: "Large (20oz)", price: 2.0 },
          ],
          addOns: [
            { name: "Oat Milk", price: 1.0 },
            { name: "Almond Milk", price: 1.0 },
            { name: "Vanilla Syrup", price: 0.75 },
            { name: "Extra Shot", price: 1.5 },
          ],
        },
      ],
    },
    // APPETIZERS
    {
      categoryName: "Appetizers",
      meals: [
        {
          name: "Buffalo Wings",
          description:
            "Crispy chicken wings tossed in our signature buffalo sauce",
          basePrice: 11.99,
          image:
            "https://images.unsplash.com/photo-1544025162-d76694265947?w=500",
          sizes: [
            { name: "6 Wings", price: 0 },
            { name: "12 Wings", price: 6.0 },
            { name: "18 Wings", price: 10.0 },
          ],
          addOns: [
            { name: "Extra Sauce", price: 1.0 },
            { name: "Ranch Dressing", price: 1.5 },
            { name: "Blue Cheese", price: 1.5 },
            { name: "Celery Sticks", price: 1.0 },
          ],
        },
        {
          name: "Mozzarella Sticks",
          description:
            "Golden fried mozzarella sticks served with marinara sauce",
          basePrice: 9.99,
          image:
            "https://images.unsplash.com/photo-1562967914-608f82629710?w=500",
          sizes: [
            { name: "6 Pieces", price: 0 },
            { name: "12 Pieces", price: 5.0 },
          ],
          addOns: [
            { name: "Extra Marinara", price: 1.0 },
            { name: "Ranch Dressing", price: 1.5 },
            { name: "Garlic Aioli", price: 1.5 },
            { name: "Parmesan Cheese", price: 1.0 },
          ],
        },
        {
          name: "Loaded Nachos",
          description:
            "Tortilla chips topped with cheese, jalapeños, sour cream, and guacamole",
          basePrice: 12.99,
          image:
            "https://images.unsplash.com/photo-1513456852971-30c0c819b92a?w=500",
          sizes: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 4.0 },
          ],
          addOns: [
            { name: "Ground Beef", price: 3.0 },
            { name: "Grilled Chicken", price: 3.5 },
            { name: "Extra Cheese", price: 2.0 },
            { name: "Black Beans", price: 1.5 },
          ],
        },
      ],
    },
  ];

  // Create meals, sizes, and add-ons
  for (const categoryData of mealsData) {
    const category = createdCategories.find(
      (c) => c.name === categoryData.categoryName
    );
    if (!category) continue;

    for (const mealData of categoryData.meals) {
      // Create the meal
      const meal = await prisma.meal.create({
        data: {
          name: mealData.name,
          description: mealData.description,
          basePrice: mealData.basePrice,
          image: mealData.image,
          categoryId: category.id,
        },
      });

      // Create sizes
      for (const size of mealData.sizes) {
        await prisma.mealSize.create({
          data: {
            name: size.name,
            price: size.price,
            mealId: meal.id,
          },
        });
      }

      // Create add-ons (first create/find AddOn, then link to meal)
      for (const addOnData of mealData.addOns) {
        // Find or create the AddOn
        let addOn = await prisma.addOn.findFirst({
          where: {
            name: addOnData.name,
            price: addOnData.price,
          },
        });

        if (!addOn) {
          // Create the AddOn if it doesn't exist
          addOn = await prisma.addOn.create({
            data: {
              name: addOnData.name,
              price: addOnData.price,
              type: "BOOLEAN", // Default type
            },
          });
        }

        // Link the AddOn to the Meal via MealAddOn
        await prisma.mealAddOn.create({
          data: {
            mealId: meal.id,
            addOnId: addOn.id,
          },
        });
      }

      console.log(
        `✅ Created meal: ${mealData.name} with ${mealData.sizes.length} sizes and ${mealData.addOns.length} add-ons`
      );
    }
  }

  // Create a sample admin user
  const adminUser = await prisma.user.create({
    data: {
      clerkId: "admin_sample_123",
      email: "admin@restaurant.com",
      firstName: "Admin",
      lastName: "User",
      role: "ADMIN",
    },
  });

  console.log(`✅ Created admin user: ${adminUser.email}`);

  console.log("🎉 Database seeding completed successfully!");
  console.log(`📊 Created:`);
  console.log(`   - ${createdDeclarations.length} declarations`);
  console.log(`   - ${createdCategories.length} categories`);
  console.log(
    `   - ${mealsData.reduce(
      (total, cat) => total + cat.meals.length,
      0
    )} meals`
  );
  console.log(
    `   - ${mealsData.reduce(
      (total, cat) =>
        total +
        cat.meals.reduce((mealTotal, meal) => mealTotal + meal.sizes.length, 0),
      0
    )} meal sizes`
  );

  // Count unique add-ons
  const allAddOns = new Set<string>();
  mealsData.forEach((cat) => {
    cat.meals.forEach((meal) => {
      meal.addOns.forEach((addOn) => {
        allAddOns.add(`${addOn.name}-${addOn.price}`);
      });
    });
  });
  console.log(`   - ${allAddOns.size} unique add-ons`);
  console.log(
    `   - ${mealsData.reduce(
      (total, cat) =>
        total +
        cat.meals.reduce(
          (mealTotal, meal) => mealTotal + meal.addOns.length,
          0
        ),
      0
    )} meal add-ons`
  );
  console.log(`   - 1 admin user`);
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

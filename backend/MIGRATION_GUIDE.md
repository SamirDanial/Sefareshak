# Size Types Migration Guide

This guide will help you migrate your database to support size types (S, M, L, XL) for meals and addons without data loss.

## Step 1: Check for Duplicate Meal Sizes

Before pushing the schema, check if any meals have multiple sizes that would map to the same sizeType:

```bash
npm run migrate:check-duplicates
```

If duplicates are found, you'll need to update those meal sizes manually to have unique sizeType values.

## Step 2: Push Schema Changes (First Push)

This will:
- Add `sizeType` to `meal_sizes` (defaults to M for existing records)
- Add `addon_sizes` table
- Add `mealSizeType` and `addonSizeType` to order tables
- Keep `price` in `addons` table temporarily (as optional)

```bash
npx prisma db push
```

**Answer "yes" when prompted** - the price column will be kept (not dropped) because it's now optional.

## Step 3: Migrate Addon Prices

After the schema push, migrate existing addon prices to the new `addon_sizes` table:

```bash
npm run migrate:addon-prices
```

This script will:
- Find all addons with a price
- Create an `addonSize` record with sizeType "M" for each addon
- Preserve the price and taxPercentage

## Step 4: Remove Price Column (Second Push)

Now remove the `price` field from the `AddOn` model in `schema.prisma`:

```prisma
model AddOn {
  // ... other fields
  // Remove this line: price Decimal? @db.Decimal(10, 2)
  // ... rest of model
}
```

Then push again:

```bash
npx prisma db push
```

**Answer "yes" when prompted** - all prices have been migrated, so it's safe to drop the column.

## Done! ✅

Your database is now migrated. All existing:
- Meal sizes have a `sizeType` (defaulted to M, or mapped from name)
- Addon prices are in `addon_sizes` table with sizeType "M"
- Order items have `mealSizeType` and `addonSizeType` fields

## Troubleshooting

### If you get duplicate constraint errors:
- Run `npm run migrate:check-duplicates` to find the problematic meals
- Update those meal size names to map to different sizeTypes (S, M, L, XL)

### If migration script fails:
- Check that `addon_sizes` table exists
- Verify that addons still have the `price` column
- Check database connection in `.env`


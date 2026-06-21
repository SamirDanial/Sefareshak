# POS Search Box Improvements Plan

## Overview
Fix two issues in the POS page search box in the tablet app:
1. Add a cross button to clear the search box when clicked
2. Clear the search box automatically when an item is added to cart from search results

## File to Modify
`/Users/samirdanial/Desktop/Bellami/tablet-app/components/pos/PosSellingExperience.tsx`

## Issue 1: Add Cross Button to Clear Search

### Current State
- Search input at lines 2825-2831 is a simple TextInput without a clear button
- searchTerm state at line 651
- Style defined at lines 4895-4903

### Implementation Steps

1. **Wrap TextInput in a container View**
   - Change the search input section (around line 2825) from a standalone TextInput to a View container with flexDirection: 'row' and position: 'relative'
   - This allows positioning the clear button

2. **Add clear button component**
   - Add a TouchableOpacity with MaterialCommunityIcons "close" or "close-circle" icon
   - Position it absolutely on the right side of the search input
   - Conditionally render only when `searchTerm.length > 0`
   - On press, call `setSearchTerm("")`

3. **Update styles**
   - Add a new style `searchInputContainer` with flex: 1, position: 'relative'
   - Update `searchInput` style to remove fixed width if needed, ensure it doesn't overlap with the clear button
   - Add `clearButton` style for positioning (position: 'absolute', right: 12, top: 12, etc.)

### Code Changes
```typescript
// Around line 2825, replace the TextInput with:
<View style={styles.searchInputContainer}>
  <TextInput
    value={searchTerm}
    onChangeText={setSearchTerm}
    placeholder={t("admin.pos.searchMeals", { defaultValue: "Search meals" })}
    placeholderTextColor="#737373"
    style={styles.searchInput}
  />
  {searchTerm.length > 0 && (
    <TouchableOpacity
      onPress={() => setSearchTerm("")}
      style={styles.clearButton}
    >
      <MaterialCommunityIcons name="close" size={20} color="#9ca3af" />
    </TouchableOpacity>
  )}
</View>

// Add to styles (around line 4895):
searchInputContainer: {
  flex: 1,
  position: 'relative',
},
searchInput: {
  backgroundColor: "#0f172a",
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  paddingRight: 40, // Add space for clear button
  color: "#fff",
  borderWidth: 1,
  borderColor: "#1f2937",
},
clearButton: {
  position: 'absolute',
  right: 12,
  top: 12,
  padding: 4,
},
```

## Issue 2: Clear Search After Adding Item to Cart

### Current State
- `addMealToCart` function at line 1979
- `applyMealCustomization` function at line 2251 calls `addMealToCart` and closes modal
- `addDealToCart` function at line 2074
- searchTerm is never cleared after adding items

### Implementation Steps

1. **Clear search in addMealToCart**
   - After successfully adding a meal to cart (line ~2025 where setCartItems is called), clear searchTerm
   - Add: `setSearchTerm("")` after the cart update

2. **Clear search in addDealToCart**
   - After successfully adding a deal to cart (line ~2076 where setCartItems is called), clear searchTerm
   - Add: `setSearchTerm("")` after the cart update

3. **Clear search in voucher addition**
   - After adding a voucher to cart (line ~4155), clear searchTerm
   - Add: `setSearchTerm("")` after the cart update

### Code Changes

```typescript
// In addMealToCart function (around line 2025), after setCartItems:
setCartItems((prev) => {
  // ... existing cart update logic
});
setSearchTerm(""); // Add this line

// In addDealToCart function (around line 2076), after setCartItems:
setCartItems((prev) => {
  // ... existing cart update logic
});
setSearchTerm(""); // Add this line

// In voucher addition (around line 4155), after setCartItems:
setCartItems((prev) => [...prev, newItem]);
setSearchTerm(""); // Add this line
showToast(t("admin.pos.voucherAddedToBasket", { defaultValue: "Voucher successfully added to basket." }), "success");
```

## Testing Checklist

1. **Cross button functionality**
   - [ ] Cross button appears only when search box has text
   - [ ] Clicking cross button clears the search box
   - [ ] Cross button disappears after clearing
   - [ ] Cross button is positioned correctly and doesn't overlap text

2. **Auto-clear on add to cart**
   - [ ] Search for a meal, add it to cart, search box clears
   - [ ] Search for a deal, add it to cart, search box clears
   - [ ] Search for a meal, customize it, add to cart, search box clears
   - [ ] Add voucher while search is active, search box clears

3. **Edge cases**
   - [ ] Search is empty, no cross button shown
   - [ ] Add item without searching (no search term), no clearing occurs
   - [ ] Clearing search via cross button doesn't affect cart
   - [ ] Multiple rapid searches and adds work correctly

## Implementation Order
1. Implement Issue 1 (cross button) first as it's UI-only
2. Implement Issue 2 (auto-clear) second as it depends on cart logic
3. Test both features together

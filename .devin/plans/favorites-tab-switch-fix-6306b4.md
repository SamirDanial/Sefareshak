# Fix Tab Navigation State Persistence for Favorite Branches

The plan is to resolve the tab navigation state persistence issue by immediately clearing the AsyncStorage keys and resetting the Menu override state once the favorite branch has been successfully applied to the global `BranchContext`, allowing normal branch selection to resume.

## Root Cause

1. **Tab Parameter Persistence**:
   When the user clicks a favorite branch, the app navigates to `/menu?fromFavorites=true`. When the user switches to the Home tab and selects a different branch, `BranchContext` updates correctly. However, when they click the Menu tab, React Navigation/Expo Router restores the Menu page along with its persistent parameters (`fromFavorites=true`).
   
2. **Stuck Override State**:
   Because `isFromFavorites` remains `true`, the `storedBranchData` state inside `menu.tsx` continues to hold the old favorite branch data. It keeps overriding the global context `branch?.id` in `apiBranchId`, causing the Menu to load the stale favorite branch.

## Fix Plan

Instead of keeping a persistent duplicate state (`storedBranchData`) in `menu.tsx` to override the `BranchContext`, we will use the AsyncStorage loading phase solely to **initialize** the global `BranchContext` with the favorite branch, and immediately clear all overrides.

1. **Simplify apiBranchId**:
   Set `apiBranchId = branch?.id`. The Menu page will always render the branch specified in the global `BranchContext`.
   
2. **One-Time Initialization & Cleanup**:
   When navigating from Favorites, we load the branch from AsyncStorage, call `setBranch(parsed)` to update the global `BranchContext`, and immediately clear all AsyncStorage overrides and local override states.
   
3. **Fall Back to Context**:
   Once cleared, any subsequent focuses or updates of the Menu page will fall back to using the global `BranchContext` normally, allowing Home page switcher or manual switcher selections to take effect instantly.

## Implementation Details

We will simplify and refactor the state management in `menu.tsx`:

1. Remove `storedBranchData` state.
2. Initialize and synchronize `isStoredDataLoading` only on transition.
3. Update `loadStoredBranchData` to clear AsyncStorage and override state immediately after calling `setBranch`.

## Expected Outcome

- First navigation from Favorites updates the `BranchContext` and displays the correct favorite branch menu.
- Going to the Home page and switching to a different branch updates the `BranchContext` normally.
- Returning to the Menu tab loads the newly selected branch's menu immediately, with zero stuck states.

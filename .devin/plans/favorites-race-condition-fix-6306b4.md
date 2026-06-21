# Fix Menu Refetch Race Condition on Favorites Selection

The plan is to resolve the favorites menu loading race condition by synchronously setting the `isStoredDataLoading` state to `true` during the render phase when a navigation timestamp change is detected, preventing any premature API requests from using stale branch parameters.

## Root Cause

When navigating from the Favorites tab to the Menu tab:
1. `useFocusEffect` synchronous execution begins immediately.
2. At this instant, `isStoredDataLoading` is still initialized or set to `false`.
3. Consequently, the `useFocusEffect` skips the `isStoredDataLoading` check and calls `fetchData()` using the **previous/old branch ID**.
4. This marks `isFetchingRef.current` as `true` (fetch in progress).
5. Concurrently, the asynchronous `loadStoredBranchData` effect runs, retrieves the new favorite branch, and updates the `apiBranchId` state.
6. The new branch ID triggers the refetch `useEffect`, which calls `fetchData()`. However, because the old branch fetch is already in progress, the correct new fetch is **silently ignored and skipped**.
7. The old fetch completes, rendering the incorrect menu. On a second click, the branch is already loaded, so it fetches correctly.

## Fix Plan

We will eliminate this race condition by:
1. Initializing `isStoredDataLoading` to `isFromFavorites` on initial mount.
2. Synchronously updating `isStoredDataLoading` during the render phase whenever `navTimestamp` changes. This guarantees that `isStoredDataLoading` is `true` before any focus effect runs, blocking the premature fetch.

## Implementation Details

### `menu.tsx` Modification

We will update the state definitions:
```typescript
  const [storedBranchData, setStoredBranchData] = useState<any>(null);
  const [isStoredDataLoading, setIsStoredDataLoading] = useState(isFromFavorites);
  const [lastNavTimestamp, setLastNavTimestamp] = useState(navTimestamp);

  if (navTimestamp !== lastNavTimestamp) {
    setLastNavTimestamp(navTimestamp);
    setIsStoredDataLoading(isFromFavorites);
  }
```

## Expected Outcome

- When clicking any favorite branch, `isStoredDataLoading` is synchronously set to `true` on the very first render frame.
- `useFocusEffect` will correctly wait for the favorite branch data to load before making any API requests.
- No duplicate or premature API requests will be fired, and the correct branch menu will load on the **first click** every time.

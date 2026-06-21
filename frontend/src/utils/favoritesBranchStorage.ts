// Module-level storage for branch data from Favorites page
// This persists across all components and renders to ensure the correct branch is displayed
let storedBranchData: any = null;

export const setFavoritesBranchData = (data: any) => {
  storedBranchData = data;
};

export const getFavoritesBranchData = () => {
  return storedBranchData;
};

export const clearFavoritesBranchData = () => {
  storedBranchData = null;
};

import ApiService from "./apiService";

export interface HeroSection {
  id: string;
  badgeText: string | null;
  title: string;
  subtitle: string | null;
  backgroundImage: string | null;
  primaryButtonText: string | null;
  primaryButtonLink: string | null;
  secondaryButtonText: string | null;
  secondaryButtonLink: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HeroSectionFormData {
  badgeText?: string;
  title: string;
  subtitle?: string;
  backgroundImage?: string;
  primaryButtonText?: string;
  primaryButtonLink?: string;
  secondaryButtonText?: string;
  secondaryButtonLink?: string;
  isActive?: boolean;
}

type HeroSectionScope = "global" | "organization";

const toApiOptions = (scope?: HeroSectionScope) => {
  if (scope === "global") {
    return { skipOrgHeader: true };
  }
  return undefined;
};

export const heroSectionService = {
  // Get active hero section (public)
  getActiveHeroSection: async (organizationId?: string | null): Promise<HeroSection | null> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get("/api/hero-section/active", undefined, {
      headers: organizationId
        ? {
            "x-organization-id": organizationId,
          }
        : undefined,
      // This is a public endpoint; never implicitly scope by selected org.
      // If scoping is desired, we pass x-organization-id explicitly above.
      skipOrgHeader: true,
    });
    return response.data;
  },

  // Get all hero sections (admin)
  getAllHeroSections: async (
    token?: string,
    scope: HeroSectionScope = "organization"
  ): Promise<HeroSection[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      "/api/hero-section",
      token,
      toApiOptions(scope)
    );
    return response.data;
  },

  // Get hero section by ID (admin)
  getHeroSectionById: async (
    id: string,
    token?: string
  ): Promise<HeroSection> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/hero-section/${id}`, token);
    return response.data;
  },

  // Create hero section (admin)
  createHeroSection: async (
    data: HeroSectionFormData,
    token?: string,
    scope: HeroSectionScope = "organization"
  ): Promise<HeroSection> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      "/api/hero-section",
      data,
      token,
      toApiOptions(scope)
    );
    return response.data;
  },

  // Update hero section (admin)
  updateHeroSection: async (
    id: string,
    data: HeroSectionFormData,
    token?: string,
    scope: HeroSectionScope = "organization"
  ): Promise<HeroSection> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/hero-section/${id}`,
      data,
      token,
      toApiOptions(scope)
    );
    return response.data;
  },

  // Delete hero section (admin)
  deleteHeroSection: async (
    id: string,
    token?: string,
    scope: HeroSectionScope = "organization"
  ): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/hero-section/${id}`, token, toApiOptions(scope));
  },
};

import ApiService from "@/src/services/apiService";

export type UserType = "SUPER_ADMIN" | "BRANCH_ADMIN" | "EMPLOYEE" | "WAITER" | "USER";
export type OrgRole = "ORG_OWNER" | "ORG_ADMIN" | "ORG_STAFF";

export interface User {
  id: string;
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  description?: string;
  userType: UserType;
  organizationId?: string | null;
  orgRole?: OrgRole | null;
  organization?: { id: string; name: string } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  orders?: {
    id: string;
    status: string;
    totalAmount: number;
    createdAt: string;
  }[];
  _count?: {
    orders: number;
  };
}

export interface UsersResponse {
  users: User[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface UserUpdateData {
  userType?: UserType;
  isActive?: boolean;
}

export const userService = {
  getUsers: async (
    page: number = 1,
    limit: number = 10,
    search: string = "",
    sortBy: string = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
    userType: string = "",
    token?: string
  ): Promise<UsersResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      search,
      sortBy,
      sortOrder,
    });

    if (userType) {
      params.append("userType", userType);
    }

    const response = await apiService.get(`/api/admin/users?${params}`, token);
    return (response as any).data as UsersResponse;
  },

  getUserById: async (id: string, token?: string): Promise<User> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/users/${id}`, token);
    return (response as any).data as User;
  },

  updateUser: async (id: string, data: UserUpdateData, token?: string): Promise<User> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(`/api/admin/users/${id}`, data, token);
    return (response as any).data as User;
  },

  deleteUser: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/admin/users/${id}`, token);
  },

  setUserType: async (id: string, userType: UserType, token?: string): Promise<User> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(`/api/admin/users/${id}`, { userType }, token);
    return (response as any).data as User;
  },

  toggleUserStatus: async (id: string, token?: string): Promise<User> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/admin/users/${id}/toggle-status`, {}, token);
    return (response as any).data as User;
  },

  setUserOrganization: async (
    id: string,
    payload: { organizationId: string | null; orgRole?: OrgRole | null },
    token?: string
  ): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.patch(`/api/admin/users/${id}/organization`, payload, token);
  },
};

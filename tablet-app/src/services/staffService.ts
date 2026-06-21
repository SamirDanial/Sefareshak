import ApiService from "@/src/services/apiService";

export type UserType = "SUPER_ADMIN" | "BRANCH_ADMIN" | "EMPLOYEE" | "WAITER" | "USER";
export type OrgRole = "ORG_OWNER" | "ORG_ADMIN" | "ORG_STAFF";

export interface StaffBranch {
  id: string;
  name: string;
  code?: string | null;
}

export interface StaffRole {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  branchId?: string | null;
  permissions?: any;
}

export interface StaffUser {
  id: string;
  clerkId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  userType: UserType;
  orgRole?: OrgRole | null;
  isActive: boolean;
  assignedBranches?: Array<{
    branchId: string;
    branch: StaffBranch;
  }>;
  userRoles?: Array<{
    roleId: string;
    branchId: string | null;
    role: { id: string; name: string };
    branch?: { id: string; name: string } | null;
  }>;
}

export interface RoleAssignmentInput {
  roleId: string;
  branchId?: string | null;
}

export interface RoleUpsertInput {
  name: string;
  description?: string | null;
  permissions: any;
  isActive?: boolean;
}

export interface PermissionResourcesResponse {
  resources: Record<string, string>;
  actions: Record<string, string>;
  resourceActions: Record<string, string[]>;
}

export const staffService = {
  getStaff: async (
    params: {
      branchId?: string;
      userType?: UserType;
      includeInactive?: boolean;
      assignedOnly?: boolean;
    },
    token?: string
  ): Promise<StaffUser[]> => {
    const apiService = ApiService.getInstance();
    const qs = new URLSearchParams();
    if (params.branchId) qs.set("branchId", params.branchId);
    if (params.userType) qs.set("userType", params.userType);
    if (params.includeInactive) qs.set("includeInactive", "true");
    if (params.assignedOnly) qs.set("assignedOnly", "true");

    const response = await apiService.get(`/api/staff?${qs.toString()}`, token);
    return (response as any).data as StaffUser[];
  },

  searchHireCandidate: async (email: string, token?: string): Promise<StaffUser> => {
    const apiService = ApiService.getInstance();
    const qs = new URLSearchParams();
    qs.set("email", email);
    const response = await apiService.get(`/api/staff/hire/search?${qs.toString()}`, token);
    return (response as any)?.data as StaffUser;
  },

  hireStaff: async (userId: string, token?: string): Promise<StaffUser> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(`/api/staff/hire`, { userId }, token);
    return (response as any)?.data as StaffUser;
  },

  updateUserOrgRole: async (userId: string, orgRole: OrgRole | null, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.patch(`/api/staff/${userId}/org-role`, { orgRole }, token);
  },

  removeUserFromOrganization: async (userId: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/staff/${userId}/org-membership`, token);
  },

  updateUserType: async (userId: string, userType: UserType, token?: string): Promise<StaffUser> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(`/api/staff/${userId}/type`, { userType }, token);
    return (response as any).data as StaffUser;
  },

  getRoles: async (includeInactive: boolean = false, token?: string): Promise<StaffRole[]> => {
    const apiService = ApiService.getInstance();
    const qs = new URLSearchParams();
    if (includeInactive) qs.set("includeInactive", "true");
    const response = await apiService.get(`/api/roles?${qs.toString()}`, token);
    return (response as any).data as StaffRole[];
  },

  getUserBranches: async (userId: string, token?: string): Promise<StaffBranch[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/staff/${userId}/branches`, token);
    return (response as any).data as StaffBranch[];
  },

  setUserBranches: async (userId: string, branchIds: string[], token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.put(`/api/staff/${userId}/branches`, { branchIds }, token);
  },

  getUserRoles: async (userId: string, token?: string): Promise<any[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/staff/${userId}/roles`, token);
    return (response as any).data as any[];
  },

  setUserRoles: async (userId: string, assignments: RoleAssignmentInput[], token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.put(`/api/staff/${userId}/roles`, { assignments }, token);
  },

  createRole: async (payload: RoleUpsertInput, token?: string): Promise<StaffRole> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(`/api/roles`, payload, token);
    return (response as any).data as StaffRole;
  },

  updateRole: async (roleId: string, payload: RoleUpsertInput, token?: string): Promise<StaffRole> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(`/api/roles/${roleId}`, payload, token);
    return (response as any).data as StaffRole;
  },

  deleteRole: async (roleId: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/roles/${roleId}`, token);
  },

  getPermissionResources: async (token?: string): Promise<PermissionResourcesResponse> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/permissions/resources`, token);
    return (response as any).data as PermissionResourcesResponse;
  },
};

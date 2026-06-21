import { Request } from "express";
import { PermissionSet, Resource, Action } from "../config/permissions";

// User types (hierarchical)
export type UserType = "SUPER_ADMIN" | "BRANCH_ADMIN" | "EMPLOYEE" | "WAITER" | "USER";

// Legacy alias for backward compatibility
export type UserRole = "USER" | "ADMIN";

// Extended Request interface with Clerk auth
export interface AuthenticatedRequest extends Request {
  auth?: {
    userId?: string;
    sessionId?: string;
    orgId?: string;
    orgRole?: string;
    orgSlug?: string;
  };
  user?: {
    id: string;
    clerkId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    role?: UserRole; // Legacy field - deprecated, use userType
    userType: UserType;
    isActive: boolean;
  };
  rbacUser?: RBACUser;
  requestedBranchId?: string;
}

// Full RBAC user with permissions
export interface RBACUser {
  id: string;
  clerkId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  userType: UserType;
  isActive: boolean;
  assignedBranchIds: string[];
  permissions: PermissionSet;
  roles: Array<{
    id: string;
    name: string;
    branchId: string | null;
    permissions: PermissionSet;
  }>;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Category types
export interface CreateCategoryRequest {
  name: string;
  description?: string;
  image?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  description?: string;
  image?: string;
  isActive?: boolean;
}

// Meal types
export interface CreateMealRequest {
  name: string;
  description?: string;
  sku?: string;
  basePrice: number;
  image?: string;
  categoryId: string;
  sizes: {
    name: string;
    price: number;
  }[];
  addOns: {
    name: string;
    price: number;
  }[];
}

export interface UpdateMealRequest {
  name?: string;
  description?: string;
  sku?: string;
  basePrice?: number;
  image?: string;
  categoryId?: string;
  isActive?: boolean;
}

// Order types
export interface CreateOrderRequest {
  items: {
    mealId: string;
    quantity: number;
    selectedSize?: string;
    addOns?: string[];
    specialInstructions?: string;
  }[];
  deliveryAddress?: string;
  deliveryPhone?: string;
  deliveryNotes?: string;
  orderType?: "DELIVERY" | "PICKUP";
  pickupPhone?: string;
  pickupNotes?: string;
  paymentMethod?: "CASH_ON_DELIVERY" | "CARD_ON_DELIVERY" | "ONLINE_PAYMENT";
  // Guest information (for non-authenticated users)
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
}

export interface UpdateOrderRequest {
  status?:
    | "PENDING"
    | "CONFIRMED"
    | "PREPARING"
    | "READY_FOR_DELIVERY"
    | "READY_FOR_PICKUP"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "PICKED_UP"
    | "CANCELLED";
  paymentStatus?:
    | "PENDING"
    | "PAID"
    | "FAILED"
    | "REFUNDED"
    | "PARTIALLY_REFUNDED";
  deliveryAddress?: string;
  deliveryPhone?: string;
  deliveryNotes?: string;
}

// Refund types
export type RefundType = "FULL" | "PARTIAL" | "ITEM_SPECIFIC";
export type RefundStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED";

export interface CreateRefundRequest {
  orderId?: string; // One of orderId or reservationOrderId is required
  reservationOrderId?: string;
  refundType: RefundType;
  amount?: number; // For custom amount refunds
  items?: Array<{
    orderItemId: string;
    refundAmount: number;
    refundedQuantity?: number;
    reason?: string;
    addons?: Array<{
      addonId: string;
      addOnName: string;
      addOnPrice: number;
      quantity: number;
      refundedQuantity: number;
      taxAmount: number;
    }>;
  }>;
  reason?: string;
}

export interface RefundResponse {
  id: string;
  orderId?: string;
  reservationOrderId?: string;
  refundType: RefundType;
  amount: number;
  reason?: string;
  stripeRefundId?: string;
  paypalRefundId?: string;
  status: RefundStatus;
  refundedBy: string;
  refundedAt?: Date;
  createdAt: Date;
  items?: Array<{ orderItemId: string; refundAmount: number; refundedQuantity?: number; reason?: string }>;
}

// User types
export interface CreateUserRequest {
  clerkId: string;
  email: string | null;
  firstName?: string;
  lastName?: string;
  phone?: string;
  userType?: UserType;
  branchIds?: string[];
  roleIds?: string[];
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  userType?: UserType;
  isActive?: boolean;
  branchIds?: string[];
  roleIds?: string[];
}

// Role types
export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissions: PermissionSet;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissions?: PermissionSet;
  isActive?: boolean;
}

// User branch assignment
export interface AssignBranchesRequest {
  userId: string;
  branchIds: string[];
}

// User role assignment
export interface AssignRolesRequest {
  userId: string;
  assignments: Array<{
    roleId: string;
    branchId?: string; // null = all branches
  }>;
}

// Permission check request/response
export interface PermissionCheckRequest {
  resource: Resource;
  action: Action;
  branchId?: string;
}

export interface PermissionCheckResponse {
  allowed: boolean;
  reason?: string;
}

// Query parameters
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CategoryQuery extends PaginationQuery {
  isActive?: boolean;
}

export interface MealQuery extends PaginationQuery {
  categoryId?: string;
  isActive?: boolean;
  search?: string;
}

export interface OrderQuery extends PaginationQuery {
  status?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

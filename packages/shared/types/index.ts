import { Session } from "next-auth";

export type AppSession = Session & {
  user: {
    id: string;
    email: string;
    name: string;
  };
};

export interface TenantContext {
  orgId: string;
  userId: string;
  userRole: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export type SortOrder = "asc" | "desc";

export interface SortParams {
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface FilterParams {
  [key: string]: string | number | boolean | undefined;
}

export interface QueryParams extends PaginationParams, SortParams, FilterParams {}

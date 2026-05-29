import { notifyUnauthorized } from "./client";

export type CategoryType = "INCOME" | "EXPENSE" | "ACCOUNT";

export type Category = {
  category_id: number;
  type: CategoryType;
  name: string;
  initial_capital: number | null;
  is_archived: boolean;
};

export type CategoryCreate = {
  type: CategoryType;
  name: string;
  initial_capital?: number | null;
};

export type CategoryUpdate = {
  name?: string;
  initial_capital?: number | null;
};

export type CategoriesList = {
  items: Category[];
  currency: string;
};

export class CategoriesApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.name = "CategoriesApiError";
  }
}

function authHeaders(token: string | null): HeadersInit {
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

async function parseError(response: Response): Promise<CategoriesApiError> {
  if (response.status === 401) notifyUnauthorized();
  let detail: unknown = null;
  let message = `Ошибка сервера (${response.status})`;
  try {
    const data = (await response.json()) as { detail?: unknown };
    detail = data.detail;
    if (typeof detail === "string") {
      message = detail;
    } else if (detail && typeof detail === "object" && "message" in detail) {
      const m = (detail as { message?: unknown }).message;
      if (typeof m === "string") message = m;
    }
  } catch {
    /* keep default message */
  }
  return new CategoriesApiError(response.status, message, detail);
}

export async function listCategories(
  token: string | null,
  type?: CategoryType,
): Promise<CategoriesList> {
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  const response = await fetch(`/api/v1/categories${query}`, {
    method: "GET",
    headers: authHeaders(token),
    credentials: "include",
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as CategoriesList;
}

export async function createCategory(
  token: string | null,
  payload: CategoryCreate,
): Promise<Category> {
  const response = await fetch("/api/v1/categories", {
    method: "POST",
    headers: authHeaders(token),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as Category;
}

export async function updateCategory(
  token: string | null,
  categoryId: number,
  payload: CategoryUpdate,
): Promise<Category> {
  const response = await fetch(`/api/v1/categories/${categoryId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as Category;
}

export async function archiveCategory(
  token: string | null,
  categoryId: number,
  isArchived: boolean,
): Promise<Category> {
  const response = await fetch(`/api/v1/categories/${categoryId}/archive`, {
    method: "PATCH",
    headers: authHeaders(token),
    credentials: "include",
    body: JSON.stringify({ is_archived: isArchived }),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as Category;
}

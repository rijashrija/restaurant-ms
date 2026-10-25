import { MenuItem, Table } from "../lib/types";

// Base URL for the Flask backend API
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ── Restaurant Settings ──────────────────────────────────────────────────────

export interface RestaurantSettings {
  restro_name: string;
  tagline: string;
  description: string;
  logo_url: string;
}

/** Fetches the restaurant's branding/settings (public, no auth needed). */
export async function getRestaurantSettings(): Promise<RestaurantSettings> {
  const res = await fetch(`${API_BASE_URL}/api/settings`);
  if (!res.ok) throw new Error("Failed to fetch restaurant settings");
  const data = await res.json();
  return data.settings;
}

/** Owner-only: updates restaurant branding settings. */
export async function updateRestaurantSettings(
  settings: Partial<RestaurantSettings>,
  token: string
): Promise<RestaurantSettings> {
  const res = await fetch(`${API_BASE_URL}/api/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(settings),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update settings");
  return data.settings;
}

/** Owner-only: uploads a new logo file and returns its URL. */
export async function uploadLogo(file: File, token: string): Promise<string> {
  const formData = new FormData();
  formData.append("logo", file);

  const res = await fetch(`${API_BASE_URL}/api/settings/upload-logo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to upload logo");
  return data.logo_url;
}

// ── Categories ───────────────────────────────────────────────────────────────

export interface Category {
  id: number;
  name: string;
  is_active: boolean;
}

export async function getCategories(all = false): Promise<Category[]> {
  const res = await fetch(`${API_BASE_URL}/api/categories${all ? '?all=true' : ''}`);
  if (!res.ok) throw new Error("Failed to fetch categories");
  const data = await res.json();
  return data.categories;
}

export async function addCategory(name: string, token: string): Promise<Category> {
  const res = await fetch(`${API_BASE_URL}/api/categories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to add category");
  return data.category;
}

export async function updateCategory(id: number, name: string, token: string): Promise<Category> {
  const res = await fetch(`${API_BASE_URL}/api/categories/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update category");
  return data.category;
}

export async function toggleCategory(id: number, isActive: boolean, token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/categories/${id}/toggle`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ is_active: isActive }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to toggle category");
}

export async function getDashboardStats(token: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/dashboard/stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch dashboard stats");
  return data;
}

/**
 * Verifies if the scanned QR code identifier belongs to a valid table.
 */
export async function verifyTable(identifier: string): Promise<Table> {
  const res = await fetch(`${API_BASE_URL}/api/tables/verify/${identifier}`);
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to verify table");
  }
  
  return res.json();
}

/**
 * Fetches all available menu items, optionally filtered by category.
 */
export async function getMenu(category?: string): Promise<MenuItem[]> {
  const url = category && category !== "All"
    ? `${API_BASE_URL}/api/menu?category=${encodeURIComponent(category)}`
    : `${API_BASE_URL}/api/menu`;
    
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error("Failed to fetch menu");
  }
  
  const data = await res.json();
  return data.items;
}

export interface PlaceOrderResponse {
  message: string;
  order_id: number;
  round_price: number;
  total_price: number;
  order_count: number;
  current_round: number;
  rounds: {
    round_number: number;
    ordered_at: string;
    served_by_username?: string | null;
    served_by_usernames?: string[];
    items: {
      id: number;
      menu_item_id: number;
      item_name: string;
      quantity: number;
      price: number;
      total: number;
      served_by_user_id?: number | null;
      served_by_username?: string | null;
    }[];
    subtotal: number;
  }[];
  status: string;
  merged: boolean;
}

/**
 * Places a new order by sending the cart data to Flask.
 */
export async function placeOrder(
  tableId: number,
  cart: { menu_item_id: number; quantity: number; served_by_user_id?: number }[],
  token?: string,
  servedByUserId?: number
): Promise<PlaceOrderResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const payload: any = {
    table_id: tableId,
    items: cart,
  };
  if (servedByUserId) {
    payload.served_by_user_id = servedByUserId;
  }

  const res = await fetch(`${API_BASE_URL}/api/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to place order");
  }
  
  return res.json();
}

/**
 * Fetches all staff users for server selection / attribution.
 */
export async function getStaffList(): Promise<{ id: number; username: string; role: string }[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/staff-list`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.staff || [];
  } catch {
    return [];
  }
}

/**
 * Fetches current active order & rounds history for a table (customer view).
 */
export async function getActiveOrderByTable(tableId: number): Promise<{ has_active_order: boolean; order: any | null }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/orders/active-by-table/${tableId}`);
    if (!res.ok) return { has_active_order: false, order: null };
    return res.json();
  } catch {
    return { has_active_order: false, order: null };
  }
}

/**
 * Updates the quantity of an item in an active order (Customer/Staff).
 */
export async function updateOrderItemQuantity(
  orderId: number,
  itemId: number,
  quantity: number
): Promise<{ message: string; order?: any; order_cancelled?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to update item quantity");
  }

  return res.json();
}

/**
 * Deletes an item from an active order (Customer/Staff).
 */
export async function deleteOrderItem(
  orderId: number,
  itemId: number
): Promise<{ message: string; order?: any; order_cancelled?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}/items/${itemId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to delete item from order");
  }

  return res.json();
}


/**
 * Downloads the full order history as a CSV file (Owner only).
 */
export async function exportOrderHistory(token: string) {
  const res = await fetch(`${API_BASE_URL}/api/orders/export`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to export order history");
  }
  
  // Convert response to a blob and trigger download
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = "restaurant_order_history.csv";
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
}

// ── ADMIN / MANAGER API FUNCTIONS ──────────────────────────────────────────

export interface PaginatedOrdersResponse {
  orders: any[];
  count: number;
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export async function getOrders(page: number = 1, limit: number = 20): Promise<PaginatedOrdersResponse> {
  const res = await fetch(`${API_BASE_URL}/api/orders?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch orders");
  const data = await res.json();
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    count: typeof data.count === "number" ? data.count : (data.orders?.length || 0),
    total: typeof data.total === "number" ? data.total : (data.orders?.length || 0),
    page: typeof data.page === "number" ? data.page : page,
    limit: typeof data.limit === "number" ? data.limit : limit,
    has_more: typeof data.has_more === "boolean" ? data.has_more : false,
  };
}

export async function getOrderDetails(orderId: number) {
  const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}`);
  if (!res.ok) throw new Error(`Failed to fetch order #${orderId}`);
  return res.json();
}

export async function updateOrderStatus(orderId: number, status: string) {
  const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update status");
  return res.json();
}

export async function getAllMenu() {
  const res = await fetch(`${API_BASE_URL}/api/menu/all`);
  if (!res.ok) throw new Error("Failed to fetch all menu items");
  const data = await res.json();
  return data.items;
}

export async function updateMenuAvailability(itemId: number, isAvailable: boolean) {
  const res = await fetch(`${API_BASE_URL}/api/menu/${itemId}/availability`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_available: isAvailable }),
  });
  if (!res.ok) throw new Error("Failed to update availability");
  return res.json();
}

export async function getTables(): Promise<Table[]> {
  const res = await fetch(`${API_BASE_URL}/api/tables`);
  if (!res.ok) throw new Error("Failed to fetch tables");
  return res.json();
}

export async function addTable(tableNumber: number, qrIdentifier: string, token: string) {
  const res = await fetch(`${API_BASE_URL}/api/tables`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ table_number: tableNumber, qr_identifier: qrIdentifier }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to add table");
  }
  return res.json();
}

export async function deleteTable(tableId: number, token: string) {
  const res = await fetch(`${API_BASE_URL}/api/tables/${tableId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to delete table");
  }
  return res.json();
}

export async function updateTableStatus(tableId: number, status: "available" | "occupied", token: string) {
  const res = await fetch(`${API_BASE_URL}/api/tables/${tableId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update table status");
  return data;
}

// ── Menu Management ─────────────────────────────────────────────────────────

export async function addMenuItem(data: { name: string, description: string, price: number, category: string }, token: string) {
  const res = await fetch(`${API_BASE_URL}/api/menu`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to add menu item");
  }
  return res.json();
}

export async function updateMenuItem(id: number, data: { name: string, description: string, price: number, category: string }, token: string) {
  const res = await fetch(`${API_BASE_URL}/api/menu/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to update menu item");
  }
  return res.json();
}

export async function transferTable(fromTableId: number, toTableId: number, token: string) {
  const res = await fetch(`${API_BASE_URL}/api/orders/transfer-table`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      from_table_id: fromTableId,
      to_table_id: toTableId,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to transfer table");
  }
  return data;
}

export interface OrderNotification {
  id: number;
  order_id: number;
  table_id: number;
  table_number: number;
  change_type: "item_updated" | "item_deleted" | "round_added" | "order_cancelled";
  message: string;
  item_name?: string | null;
  old_quantity?: number | null;
  new_quantity?: number | null;
  is_read: number | boolean;
  created_at: string;
}

export async function getOrderNotifications(): Promise<{ notifications: OrderNotification[]; unread_count: number }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/orders/notifications`);
    if (!res.ok) return { notifications: [], unread_count: 0 };
    return res.json();
  } catch {
    return { notifications: [], unread_count: 0 };
  }
}

export async function markOrderNotificationsRead(id?: number): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/orders/notifications/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    });
  } catch (err) {
    console.error("Failed to mark notifications read:", err);
  }
}

export async function clearOrderNotifications(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/orders/notifications/clear`, {
      method: "DELETE",
    });
  } catch (err) {
    console.error("Failed to clear notifications:", err);
  }
}



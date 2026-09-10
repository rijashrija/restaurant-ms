const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export interface AuthUser {
  id: number;
  username: string;
  role: "owner" | "manager" | "staff";
  permissions?: string[];
}

// ── Token helpers (stored in localStorage) ──────────────────────────────

export function saveToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("rms_token", token);
  }
}

export function getToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("rms_token");
  }
  return null;
}

export function clearToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("rms_token");
    localStorage.removeItem("rms_user");
  }
}

export function saveUser(user: AuthUser) {
  if (typeof window !== "undefined") {
    localStorage.setItem("rms_user", JSON.stringify(user));
  }
}

export function getUser(): AuthUser | null {
  if (typeof window !== "undefined") {
    const raw = localStorage.getItem("rms_user");
    if (raw) return JSON.parse(raw);
  }
  return null;
}

// ── API calls ────────────────────────────────────────────────────────────

export async function checkAuthStatus(): Promise<{ owner_exists: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/status`);
  return res.json();
}

export async function ownerSignup(username: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/api/auth/owner-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Signup failed");
  }
  return res.json();
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Login failed");
  }
  return res.json();
}

export async function createManager(username: string, password: string, permissions: string[] = ["orders", "menu"], role: string = "manager") {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/auth/create-manager`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username, password, permissions, role }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to create manager");
  }
  return res.json();
}

export async function listManagers() {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/auth/managers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    throw new Error("Failed to fetch managers");
  }
  return res.json();
}

export async function updateManager(id: number, data: { username: string, password?: string, permissions?: string[], role?: string }) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/auth/managers/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });
  const resData = await res.json();
  if (!res.ok) {
    throw new Error(resData.error || "Failed to update manager");
  }
  return resData;
}

export async function deleteManager(id: number) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/auth/managers/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const resData = await res.json();
  if (!res.ok) {
    throw new Error(resData.error || "Failed to delete manager");
  }
  return resData;
}

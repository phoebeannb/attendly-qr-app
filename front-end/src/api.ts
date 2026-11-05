const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export type Role = "STUDENT" | "ORGANIZER";
export type User = { id: string; name: string; email: string; role: Role };
export type Event = {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  qrToken?: string;
  _count?: { registrations: number };
};
export type Registration = {
  id: string;
  qrToken: string;
  checkedInAt: string | null;
  event: Event;
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("attendly_token");
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Cannot connect to the Attendly API. Run `npm run dev` from the project root.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Request failed");
  return body as T;
}

export function saveSession(token: string, user: User) {
  localStorage.setItem("attendly_token", token);
  localStorage.setItem("attendly_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("attendly_token");
  localStorage.removeItem("attendly_user");
}

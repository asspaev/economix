import type { AuthCache } from "../auth/storage";

export class AuthApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AuthApiError";
  }
}

type Credentials = {
  username: string;
  password: string;
};

async function postAuth(path: string, body: Credentials): Promise<AuthCache> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
  } catch {
    throw new AuthApiError(0, "Не удалось связаться с сервером. Проверьте подключение.");
  }

  if (!response.ok) {
    const detail = await safeDetail(response);
    throw new AuthApiError(response.status, detail ?? defaultMessage(response.status));
  }

  return (await response.json()) as AuthCache;
}

async function safeDetail(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const first = data.detail[0] as { msg?: unknown };
      if (typeof first.msg === "string") return first.msg;
    }
    return null;
  } catch {
    return null;
  }
}

function defaultMessage(status: number): string {
  if (status === 401) return "Неверный логин или пароль";
  if (status === 409) return "Пользователь с таким логином уже существует";
  return "Что-то пошло не так. Попробуйте ещё раз.";
}

export function login(credentials: Credentials): Promise<AuthCache> {
  return postAuth("/api/v1/auth/login", credentials);
}

export function register(credentials: Credentials): Promise<AuthCache> {
  return postAuth("/api/v1/auth/register", credentials);
}

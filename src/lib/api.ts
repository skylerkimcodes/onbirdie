import { getApiBaseUrl } from "./config";

const DEFAULT_TIMEOUT_MS = 25_000;

/** Multipart upload (e.g. resume PDF). Do not set Content-Type; the boundary is set automatically. */
export async function apiUploadFile(
  path: string,
  file: Uint8Array,
  fileName: string,
  token: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS * 2
): Promise<Response> {
  const base = getApiBaseUrl();
  const form = new FormData();
  form.append("file", new Blob([file]), fileName);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${base}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

export async function apiRequest(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; timeoutMs?: number } = {}
): Promise<Response> {
  const base = getApiBaseUrl();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${base}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

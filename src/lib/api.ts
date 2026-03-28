import { getApiBaseUrl } from "./config";

export async function apiRequest(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {}
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
  return fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

import { getApiBaseUrl } from "./config";

/** Multipart upload (e.g. resume PDF). Do not set Content-Type; the boundary is set automatically. */
export async function apiUploadFile(
  path: string,
  file: Uint8Array,
  fileName: string,
  token: string
): Promise<Response> {
  const base = getApiBaseUrl();
  const form = new FormData();
  form.append("file", new Blob([file]), fileName);
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

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

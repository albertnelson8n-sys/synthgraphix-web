type ApiOpts = {
  method?: string;
  body?: any;
  token?: string;
};

export async function api<T = any>(path: string, opts: ApiOpts = {}): Promise<T> {
  const token = opts.token || localStorage.getItem("token") || "";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = cleanPath.startsWith("/api/") ? cleanPath : `/api${cleanPath}`;

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let body: any = undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = (typeof opts.body === "string") ? opts.body : JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body,
  });

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();

  let data: any = null;

  if (ct.includes("application/json")) {
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: "Server returned invalid JSON." };
    }
  } else {
    // If server returned HTML error page, don't dump it in the UI
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      data = { error: "Server returned an HTML error. Check server logs." };
    } else {
      data = { error: text || `Request failed (${res.status})` };
    }
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  return data as T;
}

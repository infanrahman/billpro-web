export const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init?.headers || {}),
    },
  });

export const unauthorized = () => json({ error: "Unauthorized" }, { status: 401 });

export const forbidden = (message = "Forbidden") => json({ error: message }, { status: 403 });

export const badRequest = (message: string) => json({ error: message }, { status: 400 });

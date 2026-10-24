import { LookupError } from "./errors.js";

export function createAutocomplete({ provider, now = Date.now }) {
  const clients = new Map();
  return async (query, ip) => {
    if (
      typeof query !== "string" ||
      query.trim().length < 3 ||
      query.length > 300 ||
      /[\x00-\x1f]/.test(query)
    )
      throw new LookupError(
        400,
        "INVALID_QUERY",
        "Enter at least 3 characters (up to 300).",
      );
    for (const [key, client] of clients)
      if (client.expiresAt <= now()) clients.delete(key);
    let client = clients.get(ip);
    if (!client) {
      if (clients.size >= 10000)
        throw new LookupError(
          429,
          "RATE_LIMIT",
          "Please continue typing the address manually.",
        );
      client = { count: 0, expiresAt: now() + 60000 };
      clients.set(ip, client);
    }
    if (++client.count > 20)
      throw new LookupError(
        429,
        "RATE_LIMIT",
        "Please continue typing the address manually.",
      );
    try {
      return await provider(query);
    } catch {
      return [];
    }
  };
}

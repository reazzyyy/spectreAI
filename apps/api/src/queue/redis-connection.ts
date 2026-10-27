export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

export function redisConnectionFromUrl(redisUrl: string): RedisConnectionOptions {
  let url: URL;
  try {
    url = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL is invalid");
  }

  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL is invalid");
  }

  const port = url.port === "" ? 6379 : Number(url.port);
  if (url.hostname === "" || !Number.isInteger(port)) {
    throw new Error("REDIS_URL is invalid");
  }

  return {
    host: url.hostname,
    port,
    ...(url.username === "" ? {} : { username: decodeURIComponent(url.username) }),
    ...(url.password === "" ? {} : { password: decodeURIComponent(url.password) }),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

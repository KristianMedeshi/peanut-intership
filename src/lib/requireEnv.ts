export function requireEnv(name: string, message?: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      message || `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

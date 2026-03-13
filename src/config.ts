import { z } from 'zod'

const hexKey64 = z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes)')

export const configSchema = z.object({
  port: z.coerce.number().default(3000),
  publicHostname: z.string().min(1),
  dataDir: z.string().default('./data'),
  encryptionKey: hexKey64, // 32-byte hex (256-bit)
  plcUrl: z.string().url().default('https://plc.directory'),
  didCacheTtlMs: z.coerce.number().default(600_000), // 10 minutes
  maxBlobSize: z.coerce.number().default(5 * 1024 * 1024), // 5MB
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
})

export type Config = z.infer<typeof configSchema>

let cachedConfig: Config | undefined

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig
  cachedConfig = configSchema.parse({
    port: process.env.PORT,
    publicHostname: process.env.PUBLIC_HOSTNAME,
    dataDir: process.env.DATA_DIR,
    encryptionKey: process.env.ENCRYPTION_KEY,
    plcUrl: process.env.PLC_URL,
    didCacheTtlMs: process.env.DID_CACHE_TTL_MS,
    maxBlobSize: process.env.MAX_BLOB_SIZE,
    logLevel: process.env.LOG_LEVEL,
  })
  return cachedConfig
}

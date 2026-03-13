import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { GroupDatabase } from './schema.js'
import { runGroupMigrations } from './migrate.js'

export class GroupDbPool {
  private dbs = new Map<string, Kysely<GroupDatabase>>()

  constructor(private dataDir: string) {
    mkdirSync(dataDir, { recursive: true })
  }

  get(groupDid: string): Kysely<GroupDatabase> {
    const existing = this.dbs.get(groupDid)
    if (existing) return existing

    const safeName = groupDid.replace(/[^a-zA-Z0-9_]/g, '_')
    const dbPath = join(this.dataDir, `${safeName}.sqlite`)

    const sqliteDb = new Database(dbPath)
    sqliteDb.pragma('journal_mode = WAL')
    sqliteDb.pragma('busy_timeout = 5000')

    const db = new Kysely<GroupDatabase>({
      dialect: new SqliteDialect({ database: sqliteDb }),
    })

    this.dbs.set(groupDid, db)
    return db
  }

  async migrateGroup(groupDid: string): Promise<void> {
    const db = this.get(groupDid)
    await runGroupMigrations(db)
  }

  async destroyAll(): Promise<void> {
    await Promise.all([...this.dbs.values()].map((db) => db.destroy()))
    this.dbs.clear()
  }
}

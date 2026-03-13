import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { up as globalUp } from '../../src/db/migrations/global/001_initial.js'
import { up as groupUp } from '../../src/db/migrations/group/001_initial.js'
import type { GlobalDatabase, GroupDatabase } from '../../src/db/schema.js'

export async function createTestGlobalDb(): Promise<Kysely<GlobalDatabase>> {
  const sqliteDb = new Database(':memory:')
  const db = new Kysely<GlobalDatabase>({
    dialect: new SqliteDialect({ database: sqliteDb }),
  })
  await globalUp(db as Kysely<unknown>)
  return db
}

export async function createTestGroupDb(): Promise<Kysely<GroupDatabase>> {
  const sqliteDb = new Database(':memory:')
  const db = new Kysely<GroupDatabase>({
    dialect: new SqliteDialect({ database: sqliteDb }),
  })
  await groupUp(db as Kysely<unknown>)
  return db
}

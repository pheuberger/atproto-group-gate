import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex('idx_audit_log_action')
    .on('group_audit_log')
    .columns(['action'])
    .execute()

  await db.schema
    .createIndex('idx_audit_log_collection')
    .on('group_audit_log')
    .columns(['collection'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_audit_log_collection').ifExists().execute()
  await db.schema.dropIndex('idx_audit_log_action').ifExists().execute()
}

import type { Express } from 'express'
import type { AppContext } from '../../context.js'
import { XRPCError } from '@atproto/xrpc-server'
import { xrpcHandler } from '../util.js'

function parseDetail(s: string | null | undefined): unknown {
  if (!s) return undefined
  try { return JSON.parse(s) } catch { return undefined }
}

export default function (app: Express, ctx: AppContext) {
  app.get('/xrpc/app.certified.group.audit.query', xrpcHandler(ctx, async (req, res, { callerDid, groupDid }) => {
    const groupDb = ctx.groupDbs.get(groupDid)

    // RBAC: admin+ can query audit log
    await ctx.rbac.assertCan(groupDb, callerDid, 'audit.query')

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100)
    const cursor = req.query.cursor as string | undefined
    const actorDid = req.query.actorDid as string | undefined
    const action = req.query.action as string | undefined
    const collection = req.query.collection as string | undefined

    // Newest-first by id DESC
    let query = groupDb
      .selectFrom('group_audit_log')
      .select(['id', 'actor_did', 'action', 'collection', 'rkey', 'result', 'detail', 'created_at'])
      .orderBy('id', 'desc')
      .limit(limit + 1)

    // Optional filters
    if (actorDid) query = query.where('actor_did', '=', actorDid)
    if (action) query = query.where('action', '=', action)
    if (collection) query = query.where('collection', '=', collection)

    // Cursor: decode base64 → id string, WHERE id < cursor
    if (cursor) {
      const cursorId = parseInt(Buffer.from(cursor, 'base64').toString('utf8'), 10)
      if (isNaN(cursorId)) throw new XRPCError(400, 'InvalidCursor', 'Invalid cursor')
      query = query.where('id', '<', cursorId)
    }

    const rows = await query.execute()
    const hasMore = rows.length > limit
    const entries = rows.slice(0, limit)

    let nextCursor: string | undefined
    if (hasMore) {
      const last = entries[entries.length - 1]
      nextCursor = Buffer.from(String(last.id)).toString('base64')
    }

    res.json({
      cursor: nextCursor,
      entries: entries.map((e) => ({
        id: String(e.id),
        actorDid: e.actor_did,
        action: e.action,
        collection: e.collection ?? undefined,
        rkey: e.rkey ?? undefined,
        result: e.result,
        detail: parseDetail(e.detail),
        createdAt: e.created_at,
      })),
    })
  }))
}

import type { Express } from 'express'
import type { AppContext } from '../../context.js'
import { xrpcHandler } from '../util.js'
import { ForbiddenError } from '../../errors.js'
import type { Operation } from '../../rbac/permissions.js'

export default function (app: Express, ctx: AppContext) {
  app.post('/xrpc/com.atproto.repo.deleteRecord', xrpcHandler(ctx, async (req, res, { callerDid, groupDid }) => {
    const input = req.body  // { repo, collection, rkey }

    if (input.repo !== groupDid) {
      throw new ForbiddenError('repo field must match the group DID')
    }

    const groupDb = ctx.groupDbs.get(groupDid)
    const recordUri = `at://${groupDid}/${input.collection}/${input.rkey}`
    const isAuthor = await ctx.rbac.isAuthor(groupDb, recordUri, callerDid)
    const operation: Operation = isAuthor ? 'deleteOwnRecord' : 'deleteAnyRecord'

    try {
      await ctx.rbac.assertCan(groupDb, callerDid, operation)
    } catch (err) {
      await ctx.audit.log(groupDb, callerDid, operation, 'denied', {
        collection: input.collection, rkey: input.rkey, reason: (err as Error).message,
      })
      throw err
    }

    await ctx.pdsAgents.withAgent(groupDid, (agent) =>
      agent.com.atproto.repo.deleteRecord(input),
    )

    await Promise.all([
      groupDb.deleteFrom('group_record_authors')
        .where('record_uri', '=', recordUri)
        .execute(),
      ctx.audit.log(groupDb, callerDid, operation, 'permitted', {
        collection: input.collection, rkey: input.rkey,
      }),
    ])

    res.json({})
  }))
}

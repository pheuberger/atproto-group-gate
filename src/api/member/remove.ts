import type { Express } from 'express'
import { XRPCError } from '@atproto/xrpc-server'
import type { AppContext } from '../../context.js'
import { xrpcHandler } from '../util.js'
import { ForbiddenError } from '../../errors.js'
import { ROLE_HIERARCHY, type Role } from '../../rbac/permissions.js'

export default function (app: Express, ctx: AppContext) {
  app.post('/xrpc/org.groupds.member.remove', xrpcHandler(ctx, async (req, res, { callerDid, groupDid }) => {
    const { memberDid } = req.body

    const groupDb = ctx.groupDbs.get(groupDid)

    // RBAC check and target lookup are independent — run in parallel
    const [callerRole, target] = await Promise.all([
      ctx.rbac.assertCan(groupDb, callerDid, 'member.remove'),
      groupDb
        .selectFrom('group_members')
        .select('role')
        .where('member_did', '=', memberDid)
        .executeTakeFirst(),
    ])
    if (!target) {
      throw new XRPCError(404, 'MemberNotFound', 'Member not found')
    }

    // Cannot remove an owner
    if (target.role === 'owner') {
      throw new XRPCError(400, 'CannotRemoveOwner', 'Cannot remove an owner — demote first')
    }

    // Cannot remove equal or higher role (unless self-removal)
    if (callerDid !== memberDid) {
      if (ROLE_HIERARCHY[callerRole] <= ROLE_HIERARCHY[target.role as Role]) {
        throw new ForbiddenError('Cannot remove a member with equal or higher role')
      }
    }

    await groupDb.deleteFrom('group_members')
      .where('member_did', '=', memberDid)
      .execute()

    await ctx.audit.logAuditEvent(groupDb, callerDid, 'member.remove', 'permitted', { memberDid })

    res.json({})
  }))
}

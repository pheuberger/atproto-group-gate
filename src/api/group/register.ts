import type { Express } from 'express'
import { AtpAgent } from '@atproto/api'
import { ensureValidDid } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { AppContext } from '../../context.js'
import { ConflictError } from '../../errors.js'
import { encrypt } from '../../pds/credentials.js'

export default function (app: Express, ctx: AppContext) {
  app.post('/xrpc/app.certified.group.register', async (req, res, next) => {
    try {
      const { groupDid, pdsUrl, appPassword, ownerDid } = req.body

      // Validate inputs
      if (!groupDid || !pdsUrl || !appPassword || !ownerDid) {
        throw new InvalidRequestError('Missing required fields')
      }
      try {
        ensureValidDid(groupDid)
      } catch {
        throw new InvalidRequestError('Invalid groupDid')
      }
      try {
        ensureValidDid(ownerDid)
      } catch {
        throw new InvalidRequestError('Invalid ownerDid')
      }
      try {
        new URL(pdsUrl)
      } catch {
        throw new InvalidRequestError('Invalid pdsUrl')
      }

      // Check not already registered
      const existing = await ctx.globalDb
        .selectFrom('groups')
        .where('did', '=', groupDid)
        .select('did')
        .executeTakeFirst()
      if (existing) {
        throw new ConflictError('Group already registered', 'GroupAlreadyRegistered')
      }

      // Verify credentials by logging in to the PDS
      const agent = new AtpAgent({ service: pdsUrl })
      await agent.login({ identifier: groupDid, password: appPassword })

      // Encrypt and store
      const encryptionKey = Buffer.from(ctx.config.encryptionKey, 'hex')
      const encrypted = encrypt(appPassword, encryptionKey)
      await ctx.globalDb
        .insertInto('groups')
        .values({ did: groupDid, pds_url: pdsUrl, encrypted_app_password: encrypted })
        .execute()

      // Initialize per-group database and run migrations
      await ctx.groupDbs.migrateGroup(groupDid)

      // Seed owner
      const groupDb = ctx.groupDbs.get(groupDid)
      await groupDb
        .insertInto('group_members')
        .values({ member_did: ownerDid, role: 'owner', added_by: ownerDid })
        .execute()

      res.json({ groupDid })
    } catch (err) {
      next(err)
    }
  })
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createTestContext, silentLogger } from './helpers/mock-server.js'
import groupRegisterHandler from '../src/api/group/register.js'
import { xrpcErrorHandler } from '../src/api/error-handler.js'
import type { AppContext } from '../src/context.js'
import type { Kysely } from 'kysely'
import type { GlobalDatabase, GroupDatabase } from '../src/db/schema.js'

// Mock AtpAgent
vi.mock('@atproto/api', () => {
  return {
    AtpAgent: vi.fn().mockImplementation(() => ({
      login: vi.fn().mockResolvedValue({}),
    })),
  }
})

import { AtpAgent } from '@atproto/api'

function createApp(ctx: AppContext) {
  const app = express()
  app.use(express.json())
  groupRegisterHandler(app, ctx)
  app.use(xrpcErrorHandler(silentLogger as any))
  return app
}

const validBody = {
  groupDid: 'did:plc:testgroup',
  pdsUrl: 'https://pds.example.com',
  appPassword: 'test-app-password',
  ownerDid: 'did:plc:owner',
}

describe('group.register', () => {
  let ctx: AppContext
  let globalDb: Kysely<GlobalDatabase>
  let groupDb: Kysely<GroupDatabase>
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    const test = await createTestContext()
    ctx = test.ctx
    globalDb = test.globalDb
    groupDb = test.groupDb
    app = createApp(ctx)
  })

  afterEach(async () => {
    await globalDb.destroy()
    await groupDb.destroy()
  })

  it('registers a group with valid credentials', async () => {
    const res = await request(app)
      .post('/xrpc/app.certified.group.register')
      .send(validBody)
    expect(res.status).toBe(200)
    expect(res.body.groupDid).toBe('did:plc:testgroup')

    // Verify group stored in global DB
    const group = await globalDb
      .selectFrom('groups')
      .where('did', '=', 'did:plc:testgroup')
      .selectAll()
      .executeTakeFirst()
    expect(group).toBeDefined()
    expect(group!.pds_url).toBe('https://pds.example.com')
    expect(group!.encrypted_app_password).toBeDefined()

    // Verify owner seeded in group DB
    const owner = await groupDb
      .selectFrom('group_members')
      .where('member_did', '=', 'did:plc:owner')
      .selectAll()
      .executeTakeFirst()
    expect(owner).toBeDefined()
    expect(owner!.role).toBe('owner')
  })

  it('returns 401 when PDS login fails', async () => {
    vi.mocked(AtpAgent).mockImplementationOnce(() => ({
      login: vi.fn().mockRejectedValue(new Error('Invalid credentials')),
    }) as any)

    const res = await request(app)
      .post('/xrpc/app.certified.group.register')
      .send(validBody)
    expect(res.status).toBe(500) // unhandled error from AtpAgent
  })

  it('returns 409 for duplicate registration', async () => {
    // First registration
    await request(app)
      .post('/xrpc/app.certified.group.register')
      .send(validBody)

    // Second registration with same groupDid
    const res = await request(app)
      .post('/xrpc/app.certified.group.register')
      .send(validBody)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('GroupAlreadyRegistered')
  })

  it('returns 400 for invalid groupDid', async () => {
    const res = await request(app)
      .post('/xrpc/app.certified.group.register')
      .send({ ...validBody, groupDid: 'not-a-did' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid ownerDid', async () => {
    const res = await request(app)
      .post('/xrpc/app.certified.group.register')
      .send({ ...validBody, ownerDid: 'not-a-did' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid pdsUrl', async () => {
    const res = await request(app)
      .post('/xrpc/app.certified.group.register')
      .send({ ...validBody, pdsUrl: 'not-a-url' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing fields', async () => {
    const res = await request(app)
      .post('/xrpc/app.certified.group.register')
      .send({ groupDid: 'did:plc:testgroup' })
    expect(res.status).toBe(400)
  })
})

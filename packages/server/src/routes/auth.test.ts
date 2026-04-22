import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwtPlugin from '@fastify/jwt'
import type {} from '../middleware/auth.js'

// Hoisted mocks — must be at top so vi.mock factories can reference them
const { dbFindFirst, dbInsertValues, dbUpdateReturning, bcryptCompare, bcryptHash } = vi.hoisted(
  () => ({
    dbFindFirst: vi.fn(),
    dbInsertValues: vi.fn(),
    dbUpdateReturning: vi.fn(),
    bcryptCompare: vi.fn(),
    bcryptHash: vi.fn(),
  }),
)

vi.mock('../db/index.js', () => ({
  db: {
    query: {
      operators: { findFirst: dbFindFirst },
    },
    insert: () => ({ values: dbInsertValues }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: dbUpdateReturning }),
      }),
    }),
  },
  operators: {},
}))

vi.mock('bcrypt', () => ({
  default: { compare: bcryptCompare, hash: bcryptHash },
}))

// Import after mocks are registered
const { authRoutes } = await import('./auth.js')

const TEST_JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long!'

function buildApp() {
  const app = Fastify({ logger: false })
  app.register(jwtPlugin, { secret: TEST_JWT_SECRET })
  app.register(authRoutes)
  return app
}

const fakeOperator = {
  id: 'op-uuid-1',
  email: 'test@example.com',
  passwordHash: '$2b$12$realBcryptHashHere',
  name: 'Test User',
  role: 'admin',
  inviteToken: null,
  invitedAt: null,
  createdAt: new Date(),
}


describe('POST /auth/login', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns JWT on valid credentials', async () => {
    const app = buildApp()
    await app.ready()

    dbFindFirst.mockResolvedValue(fakeOperator)
    bcryptCompare.mockResolvedValue(true)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'password123' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.token).toBeTruthy()
    expect(body.operator.email).toBe('test@example.com')
    expect(body.operator.role).toBe('admin')
    expect(body.operator).not.toHaveProperty('passwordHash')
  })

  it('returns 401 when operator not found', async () => {
    const app = buildApp()
    await app.ready()

    dbFindFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'password123' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('Invalid credentials')
  })

  it('returns 401 when password is wrong', async () => {
    const app = buildApp()
    await app.ready()

    dbFindFirst.mockResolvedValue(fakeOperator)
    bcryptCompare.mockResolvedValue(false)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'wrongpassword' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('Invalid credentials')
  })

  it('returns 401 when operator has invite-pending hash (not registered)', async () => {
    const app = buildApp()
    await app.ready()

    dbFindFirst.mockResolvedValue({ ...fakeOperator, passwordHash: '__invite_pending__' })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'password123' },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('POST /auth/invite', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates invite and returns URL when called by admin', async () => {
    const app = buildApp()
    await app.ready()

    dbFindFirst.mockResolvedValue(null) // email not taken
    dbInsertValues.mockResolvedValue(undefined)

    const token = app.jwt.sign({ sub: 'admin-id', email: 'admin@example.com', role: 'admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/invite',
      headers: { authorization: `Bearer ${token}` },
      payload: { email: 'newagent@example.com', role: 'agent' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.inviteUrl).toContain('register?token=')
    expect(body.inviteToken).toHaveLength(64)
  })

  it('returns 403 when called by non-admin', async () => {
    const app = buildApp()
    await app.ready()

    const token = app.jwt.sign({ sub: 'agent-id', email: 'agent@example.com', role: 'agent' })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/invite',
      headers: { authorization: `Bearer ${token}` },
      payload: { email: 'newagent@example.com' },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('Admin access required')
  })

  it('returns 401 when no JWT provided', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/auth/invite',
      payload: { email: 'newagent@example.com' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 409 when email already exists', async () => {
    const app = buildApp()
    await app.ready()

    dbFindFirst.mockResolvedValue(fakeOperator) // email taken

    const token = app.jwt.sign({ sub: 'admin-id', email: 'admin@example.com', role: 'admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/invite',
      headers: { authorization: `Bearer ${token}` },
      payload: { email: 'test@example.com' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('Operator with this email already exists')
  })
})

describe('POST /auth/register', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('activates operator and returns JWT on valid invite token', async () => {
    const app = buildApp()
    await app.ready()

    const pendingOperator = {
      ...fakeOperator,
      passwordHash: '__invite_pending__',
      inviteToken: 'valid-token-abc',
      name: '',
    }
    dbFindFirst.mockResolvedValue(pendingOperator)
    bcryptHash.mockResolvedValue('$2b$12$newHashedPassword')
    dbUpdateReturning.mockResolvedValue([
      { ...fakeOperator, name: 'New Agent', inviteToken: null },
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { inviteToken: 'valid-token-abc', name: 'New Agent', password: 'securepass123' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.token).toBeTruthy()
    expect(body.operator.name).toBe('New Agent')
  })

  it('returns 400 on invalid invite token', async () => {
    const app = buildApp()
    await app.ready()

    dbFindFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { inviteToken: 'bad-token', name: 'Someone', password: 'password123' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('Invalid or expired invite token')
  })

  it('returns 400 when invite token already used', async () => {
    const app = buildApp()
    await app.ready()

    // passwordHash is NOT the sentinel — already registered
    dbFindFirst.mockResolvedValue({ ...fakeOperator, inviteToken: 'used-token' })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { inviteToken: 'used-token', name: 'Someone', password: 'password123' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('Invalid or expired invite token')
  })

  it('returns 400 when password is too short', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { inviteToken: 'valid-token', name: 'New Agent', password: 'short' },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /auth/me', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns current operator when authenticated', async () => {
    const app = buildApp()
    await app.ready()

    dbFindFirst.mockResolvedValue(fakeOperator)

    const token = app.jwt.sign({ sub: fakeOperator.id, email: fakeOperator.email, role: 'admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.operator.id).toBe(fakeOperator.id)
    expect(body.operator.email).toBe(fakeOperator.email)
    expect(body.operator).not.toHaveProperty('passwordHash')
  })

  it('returns 401 when no token provided', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/auth/me' })

    expect(res.statusCode).toBe(401)
  })

  it('returns 401 on invalid token', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer invalid.jwt.token' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when operator not found in DB', async () => {
    const app = buildApp()
    await app.ready()

    dbFindFirst.mockResolvedValue(null)

    const token = app.jwt.sign({ sub: 'ghost-id', email: 'ghost@example.com', role: 'agent' })

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(404)
  })
})

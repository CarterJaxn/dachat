import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwtPlugin from '@fastify/jwt'
import type {} from '../middleware/auth.js'

// Hoisted mocks
const {
  convFindFirst,
  convFindMany,
  msgFindMany,
  dbInsertReturning,
  dbInsertConflictReturning,
  convUpdateReturning,
} = vi.hoisted(() => ({
  convFindFirst: vi.fn(),
  convFindMany: vi.fn(),
  msgFindMany: vi.fn(),
  dbInsertReturning: vi.fn(),
  dbInsertConflictReturning: vi.fn(),
  convUpdateReturning: vi.fn(),
}))

vi.mock('../db/index.js', () => ({
  db: {
    query: {
      conversations: { findFirst: convFindFirst, findMany: convFindMany },
      messages: { findMany: msgFindMany },
    },
    insert: () => ({
      values: () => ({
        returning: dbInsertReturning,
        onConflictDoUpdate: () => ({ returning: dbInsertConflictReturning }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: convUpdateReturning }),
      }),
    }),
  },
  conversations: {},
  messages: {},
  contacts: {},
}))

const { conversationRoutes } = await import('./conversations.js')

const TEST_JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long!'

function buildApp() {
  const app = Fastify({ logger: false })
  app.register(jwtPlugin, { secret: TEST_JWT_SECRET })
  app.register(conversationRoutes)
  return app
}

const OPERATOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function operatorToken(app: ReturnType<typeof buildApp>, role = 'agent') {
  return app.jwt.sign({ sub: OPERATOR_ID, email: 'agent@example.com', role })
}

const fakeContact = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'customer@example.com',
  name: 'Customer One',
  avatarUrl: null,
  metadata: null,
  createdAt: new Date(),
}

const fakeConversation = {
  id: '22222222-2222-2222-2222-222222222222',
  contactId: fakeContact.id,
  status: 'open',
  assignedOperatorId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeConversationWithRelations = {
  ...fakeConversation,
  contact: fakeContact,
  assignedOperator: null,
}

const fakeMessage = {
  id: '33333333-3333-3333-3333-333333333333',
  conversationId: fakeConversation.id,
  senderType: 'operator',
  senderId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  content: 'Hello there',
  createdAt: new Date(),
}

describe('GET /conversations', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns conversation list for authenticated operator', async () => {
    const app = buildApp()
    await app.ready()

    convFindMany.mockResolvedValue([fakeConversationWithRelations])
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.conversations).toHaveLength(1)
    expect(body.conversations[0].id).toBe(fakeConversation.id)
    expect(body.limit).toBe(50)
    expect(body.offset).toBe(0)
  })

  it('passes status filter through', async () => {
    const app = buildApp()
    await app.ready()

    convFindMany.mockResolvedValue([])
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'GET',
      url: '/conversations?status=resolved&limit=10&offset=20',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.conversations).toHaveLength(0)
    expect(body.limit).toBe(10)
    expect(body.offset).toBe(20)
  })

  it('returns 400 on invalid status value', async () => {
    const app = buildApp()
    await app.ready()

    const token = operatorToken(app)

    const res = await app.inject({
      method: 'GET',
      url: '/conversations?status=invalid',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without JWT', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/conversations' })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /conversations', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates conversation with existing contactId', async () => {
    const app = buildApp()
    await app.ready()

    dbInsertReturning.mockResolvedValue([fakeConversation])
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: `Bearer ${token}` },
      payload: { contactId: fakeContact.id },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().conversation.id).toBe(fakeConversation.id)
  })

  it('creates conversation with new contact (email upsert)', async () => {
    const app = buildApp()
    await app.ready()

    dbInsertConflictReturning.mockResolvedValue([fakeContact])
    dbInsertReturning.mockResolvedValue([fakeConversation])
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: `Bearer ${token}` },
      payload: { contact: { email: 'customer@example.com', name: 'Customer One' } },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().conversation.id).toBe(fakeConversation.id)
  })

  it('creates conversation with new anonymous contact (no email)', async () => {
    const app = buildApp()
    await app.ready()

    dbInsertReturning
      .mockResolvedValueOnce([{ ...fakeContact, email: null }])
      .mockResolvedValueOnce([fakeConversation])
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: `Bearer ${token}` },
      payload: { contact: { name: 'Anonymous' } },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().conversation.id).toBe(fakeConversation.id)
  })

  it('returns 400 when neither contactId nor contact is provided', async () => {
    const app = buildApp()
    await app.ready()

    const token = operatorToken(app)

    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: `Bearer ${token}` },
      payload: { assignedOperatorId: 'some-op-id' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without JWT', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      payload: { contactId: fakeContact.id },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('GET /conversations/:id', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns conversation with contact when found', async () => {
    const app = buildApp()
    await app.ready()

    convFindFirst.mockResolvedValue(fakeConversationWithRelations)
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${fakeConversation.id}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.conversation.id).toBe(fakeConversation.id)
    expect(body.conversation.contact.email).toBe('customer@example.com')
  })

  it('returns 404 when conversation does not exist', async () => {
    const app = buildApp()
    await app.ready()

    convFindFirst.mockResolvedValue(null)
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'GET',
      url: '/conversations/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Conversation not found')
  })

  it('returns 401 without JWT', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${fakeConversation.id}`,
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /conversations/:id', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updates conversation status', async () => {
    const app = buildApp()
    await app.ready()

    const resolved = { ...fakeConversation, status: 'resolved' }
    convFindFirst.mockResolvedValue(fakeConversation)
    convUpdateReturning.mockResolvedValue([resolved])
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'PATCH',
      url: `/conversations/${fakeConversation.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'resolved' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().conversation.status).toBe('resolved')
  })

  it('unassigns operator when assignedOperatorId is null', async () => {
    const app = buildApp()
    await app.ready()

    const updated = { ...fakeConversation, assignedOperatorId: null }
    convFindFirst.mockResolvedValue({ ...fakeConversation, assignedOperatorId: 'op-uuid-1' })
    convUpdateReturning.mockResolvedValue([updated])
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'PATCH',
      url: `/conversations/${fakeConversation.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { assignedOperatorId: null },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().conversation.assignedOperatorId).toBeNull()
  })

  it('returns 404 when conversation does not exist', async () => {
    const app = buildApp()
    await app.ready()

    convFindFirst.mockResolvedValue(null)
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'PATCH',
      url: '/conversations/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'resolved' },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Conversation not found')
  })

  it('returns 400 when no fields provided', async () => {
    const app = buildApp()
    await app.ready()

    const token = operatorToken(app)

    const res = await app.inject({
      method: 'PATCH',
      url: `/conversations/${fakeConversation.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 on invalid status value', async () => {
    const app = buildApp()
    await app.ready()

    const token = operatorToken(app)

    const res = await app.inject({
      method: 'PATCH',
      url: `/conversations/${fakeConversation.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'archived' },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /conversations/:id/messages', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns message list for a conversation', async () => {
    const app = buildApp()
    await app.ready()

    convFindFirst.mockResolvedValue(fakeConversation)
    msgFindMany.mockResolvedValue([fakeMessage])
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${fakeConversation.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].content).toBe('Hello there')
    expect(body.limit).toBe(50)
  })

  it('returns empty list when conversation has no messages', async () => {
    const app = buildApp()
    await app.ready()

    convFindFirst.mockResolvedValue(fakeConversation)
    msgFindMany.mockResolvedValue([])
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${fakeConversation.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().messages).toHaveLength(0)
  })

  it('returns 404 when conversation does not exist', async () => {
    const app = buildApp()
    await app.ready()

    convFindFirst.mockResolvedValue(null)
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'GET',
      url: '/conversations/00000000-0000-0000-0000-000000000000/messages',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Conversation not found')
  })

  it('returns 401 without JWT', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${fakeConversation.id}/messages`,
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('POST /conversations/:id/messages', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates operator message defaulting senderId to current operator', async () => {
    const app = buildApp()
    await app.ready()

    convFindFirst.mockResolvedValue(fakeConversation)
    dbInsertReturning.mockResolvedValue([fakeMessage])
    convUpdateReturning.mockResolvedValue([fakeConversation])
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${fakeConversation.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: 'Hello there' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().message.content).toBe('Hello there')
    expect(res.json().message.senderType).toBe('operator')
  })

  it('creates contact message defaulting senderId to conversation contactId', async () => {
    const app = buildApp()
    await app.ready()

    const contactMsg = { ...fakeMessage, senderType: 'contact', senderId: fakeContact.id }
    convFindFirst.mockResolvedValue(fakeConversation)
    dbInsertReturning.mockResolvedValue([contactMsg])
    convUpdateReturning.mockResolvedValue([fakeConversation])
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${fakeConversation.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: 'I have a question', senderType: 'contact' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().message.senderType).toBe('contact')
  })

  it('returns 404 when conversation does not exist', async () => {
    const app = buildApp()
    await app.ready()

    convFindFirst.mockResolvedValue(null)
    const token = operatorToken(app)

    const res = await app.inject({
      method: 'POST',
      url: '/conversations/00000000-0000-0000-0000-000000000000/messages',
      headers: { authorization: `Bearer ${token}` },
      payload: { content: 'Hello' },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Conversation not found')
  })

  it('returns 400 when content is empty', async () => {
    const app = buildApp()
    await app.ready()

    const token = operatorToken(app)

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${fakeConversation.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: '' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without JWT', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${fakeConversation.id}/messages`,
      payload: { content: 'Hello' },
    })

    expect(res.statusCode).toBe(401)
  })
})

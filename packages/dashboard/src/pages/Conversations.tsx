import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { getToken, getOperator, clearAuth } from '../lib/auth.js'
import { wsManager } from '../lib/ws.js'
import type { Conversation, Message, Operator } from '../types.js'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'open' | 'pending' | 'resolved' | 'mine'

const STATUS_COLOR: Record<string, string> = {
  open: 'var(--status-open)',
  pending: 'var(--status-pending)',
  resolved: 'var(--status-resolved)',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function contactDisplayName(c: Conversation['contact']): string {
  return c?.name ?? c?.email ?? 'Unknown'
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`
  return `${Math.floor(diffMins / 1440)}d`
}

// ─── Contact Profile Sidebar ──────────────────────────────────────────────────

function ContactSidebar({
  conversation,
  onClose,
}: {
  conversation: Conversation
  onClose: () => void
}) {
  const { data: prevConvs } = useQuery({
    queryKey: ['conversations', 'contact', conversation.contactId],
    queryFn: () =>
      api.get<{ conversations: Conversation[] }>(
        `/conversations?limit=10`,
      ),
    select: (d) =>
      d.conversations.filter(
        (c) => c.contactId === conversation.contactId && c.id !== conversation.id,
      ),
    enabled: !!conversation.contactId,
  })

  const c = conversation.contact

  return (
    <aside style={styles.contactPanel}>
      <div style={styles.contactPanelHeader}>
        <span style={{ fontWeight: 600 }}>Contact</span>
        <button onClick={onClose} style={styles.iconBtn} title="Close">
          ✕
        </button>
      </div>
      <div style={styles.contactPanelBody}>
        <div style={styles.avatarLg}>{(c?.name?.[0] ?? c?.email?.[0] ?? '?').toUpperCase()}</div>
        <p style={{ fontWeight: 600, fontSize: 15, marginTop: 10 }}>
          {c?.name ?? '—'}
        </p>
        {c?.email && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
            {c.email}
          </p>
        )}
        {prevConvs && prevConvs.length > 0 && (
          <div style={{ marginTop: 24, width: '100%' }}>
            <p style={styles.sectionLabel}>Previous conversations</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {prevConvs.map((pc) => (
                <div key={pc.id} style={styles.prevConvRow}>
                  <span
                    style={{
                      ...styles.statusDot,
                      background: STATUS_COLOR[pc.status],
                    }}
                  />
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {formatTime(pc.updatedAt)} · {pc.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

// ─── Message Thread ───────────────────────────────────────────────────────────

function MessageThread({
  conversationId,
  currentOperator,
}: {
  conversationId: string
  currentOperator: Operator
}) {
  const qc = useQueryClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const token = getToken()!
  const [typing, setTyping] = useState(false)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () =>
      api.get<{ messages: Message[] }>(`/conversations/${conversationId}/messages?limit=100`),
    select: (d) => d.messages,
  })

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.post<{ message: Message }>(`/conversations/${conversationId}/messages`, {
        content,
        senderType: 'operator',
        senderId: currentOperator.id,
      }),
    onSuccess: (res) => {
      qc.setQueryData<Message[]>(['messages', conversationId], (old = []) => [
        ...old,
        res.message,
      ])
    },
  })

  // Connect WS when conversation changes
  useEffect(() => {
    wsManager.connect(conversationId, token)

    const unsub = wsManager.subscribe((event) => {
      if (event.conversationId !== conversationId) return

      if (event.type === 'message:new') {
        qc.setQueryData<Message[]>(['messages', conversationId], (old = []) => {
          // Deduplicate
          if (old.some((m) => m.id === event.message.id)) return old
          return [...old, event.message]
        })
        // Bump conversation list
        qc.invalidateQueries({ queryKey: ['conversations'] })
      }

      if (event.type === 'typing:start' && event.senderType === 'contact') {
        setTyping(true)
      }
      if (event.type === 'typing:stop' && event.senderType === 'contact') {
        setTyping(false)
      }

      if (event.type === 'receipt:read') {
        // Mark message as read in local cache (visual tick update handled via re-render)
        qc.invalidateQueries({ queryKey: ['messages', conversationId] })
      }
    })

    return unsub
  }, [conversationId, token, qc])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.length])

  // Send read receipt on mount / when new messages arrive
  useEffect(() => {
    if (!data || data.length === 0) return
    const last = data[data.length - 1]
    wsManager.send({ type: 'receipt:read', conversationId, messageId: last.id })
  }, [conversationId, data])

  const [input, setInput] = useState('')

  function handleInputChange(val: string) {
    setInput(val)

    // Typing indicator
    wsManager.send({ type: 'typing:start', conversationId })
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      wsManager.send({ type: 'typing:stop', conversationId })
    }, 2000)
  }

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || sendMutation.isPending) return
    setInput('')
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    wsManager.send({ type: 'typing:stop', conversationId })
    sendMutation.mutate(trimmed)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (isLoading) return <div style={styles.loadingMsg}>Loading messages…</div>

  const messages = data ?? []

  return (
    <div style={styles.threadContainer}>
      <div style={styles.messageList}>
        {messages.length === 0 && (
          <p style={styles.emptyMsg}>No messages yet. Start the conversation.</p>
        )}
        {messages.map((msg) => {
          const isOp = msg.senderType === 'operator'
          return (
            <div key={msg.id} style={{ ...styles.msgRow, justifyContent: isOp ? 'flex-end' : 'flex-start' }}>
              <div style={{ ...styles.bubble, ...(isOp ? styles.bubbleOp : styles.bubbleContact) }}>
                <span style={styles.bubbleText}>{msg.content}</span>
                <span style={styles.bubbleTime}>{formatTime(msg.createdAt)}</span>
              </div>
            </div>
          )
        })}
        {typing && (
          <div style={{ ...styles.msgRow, justifyContent: 'flex-start' }}>
            <div style={{ ...styles.bubble, ...styles.bubbleContact, fontStyle: 'italic', color: 'var(--text-secondary)' }}>
              Contact is typing…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={styles.inputRow}>
        <textarea
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send)"
          rows={2}
          style={styles.textarea}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sendMutation.isPending}
          style={styles.sendBtn}
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ─── Conversation Detail ──────────────────────────────────────────────────────

function ConversationDetail({
  conversationId,
  currentOperator,
  onShowContact,
}: {
  conversationId: string
  currentOperator: Operator
  onShowContact: () => void
}) {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () =>
      api.get<{ conversation: Conversation }>(`/conversations/${conversationId}`),
    select: (d) => d.conversation,
  })

  const statusMutation = useMutation({
    mutationFn: (status: 'open' | 'pending' | 'resolved') =>
      api.patch<{ conversation: Conversation }>(`/conversations/${conversationId}`, { status }),
    onSuccess: (res) => {
      qc.setQueryData(['conversation', conversationId], { conversation: res.conversation })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const assignMutation = useMutation({
    mutationFn: (assignedOperatorId: string | null) =>
      api.patch<{ conversation: Conversation }>(`/conversations/${conversationId}`, {
        assignedOperatorId,
      }),
    onSuccess: (res) => {
      qc.setQueryData(['conversation', conversationId], { conversation: res.conversation })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  if (!data) return <div style={styles.loadingMsg}>Loading…</div>

  const contact = data.contact
  const isMine = data.assignedOperatorId === currentOperator.id

  return (
    <div style={styles.detail}>
      <div style={styles.detailHeader}>
        <button onClick={onShowContact} style={styles.contactBtn}>
          <span style={styles.avatarSm}>
            {(contact?.name?.[0] ?? contact?.email?.[0] ?? '?').toUpperCase()}
          </span>
          <span style={{ fontWeight: 600 }}>{contactDisplayName(contact)}</span>
        </button>

        <div style={styles.detailActions}>
          {/* Assignment */}
          <button
            onClick={() =>
              assignMutation.mutate(isMine ? null : currentOperator.id)
            }
            style={styles.actionBtn}
            title={isMine ? 'Unassign from me' : 'Assign to me'}
          >
            {isMine ? 'Unassign' : 'Assign to me'}
          </button>

          {/* Status buttons */}
          {(['open', 'pending', 'resolved'] as const).map((s) => (
            <button
              key={s}
              onClick={() => statusMutation.mutate(s)}
              disabled={data.status === s}
              style={{
                ...styles.statusBtn,
                ...(data.status === s
                  ? { background: STATUS_COLOR[s], color: '#fff', borderColor: STATUS_COLOR[s] }
                  : {}),
              }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <MessageThread conversationId={conversationId} currentOperator={currentOperator} />
    </div>
  )
}

// ─── Conversation List ────────────────────────────────────────────────────────

function ConversationList({
  activeId,
  onSelect,
  currentOperator,
}: {
  activeId: string | null
  onSelect: (id: string) => void
  currentOperator: Operator
}) {
  const [tab, setTab] = useState<FilterTab>('all')
  const qc = useQueryClient()

  const queryParams = new URLSearchParams()
  if (tab === 'open') queryParams.set('status', 'open')
  if (tab === 'pending') queryParams.set('status', 'pending')
  if (tab === 'resolved') queryParams.set('status', 'resolved')
  if (tab === 'mine') queryParams.set('assignedOperatorId', currentOperator.id)
  queryParams.set('limit', '50')

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', tab],
    queryFn: () =>
      api.get<{ conversations: Conversation[] }>(`/conversations?${queryParams.toString()}`),
    select: (d) => d.conversations,
    refetchInterval: 30_000,
  })

  // Listen for global WS events to refresh conversation list
  useEffect(() => {
    const unsub = wsManager.subscribe((event) => {
      if (event.type === 'message:new' || event.type === 'conversation:updated') {
        qc.invalidateQueries({ queryKey: ['conversations'] })
      }
    })
    return unsub
  }, [qc])

  const tabs: FilterTab[] = ['all', 'open', 'pending', 'resolved', 'mine']

  return (
    <aside style={styles.sidebar}>
      <div style={styles.sidebarHeader}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Conversations</span>
      </div>

      <div style={styles.tabBar}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...styles.tab,
              ...(tab === t ? styles.tabActive : {}),
            }}
          >
            {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={styles.convList}>
        {isLoading && <p style={styles.listPlaceholder}>Loading…</p>}
        {!isLoading && (!data || data.length === 0) && (
          <p style={styles.listPlaceholder}>No conversations</p>
        )}
        {data?.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            style={{
              ...styles.convRow,
              ...(activeId === conv.id ? styles.convRowActive : {}),
            }}
          >
            <div style={styles.convRowTop}>
              <span style={styles.convName}>{contactDisplayName(conv.contact)}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {formatTime(conv.updatedAt)}
              </span>
            </div>
            <div style={styles.convRowBottom}>
              <span
                style={{
                  ...styles.statusBadge,
                  background: STATUS_COLOR[conv.status] + '20',
                  color: STATUS_COLOR[conv.status],
                }}
              >
                {conv.status}
              </span>
              {conv.assignedOperator && (
                <span style={styles.assignedLabel}>
                  {conv.assignedOperator.name || conv.assignedOperator.email}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </aside>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Conversations() {
  const navigate = useNavigate()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showContact, setShowContact] = useState(false)
  const currentOperator = getOperator()

  const { data: activeConv } = useQuery({
    queryKey: ['conversation', activeId],
    queryFn: () =>
      api.get<{ conversation: Conversation }>(`/conversations/${activeId}`),
    select: (d) => d.conversation,
    enabled: !!activeId,
  })

  const handleSelect = useCallback((id: string) => {
    setActiveId(id)
    setShowContact(false)
  }, [])

  function handleLogout() {
    wsManager.disconnect()
    clearAuth()
    navigate('/login')
  }

  if (!currentOperator) {
    navigate('/login')
    return null
  }

  return (
    <div style={styles.layout}>
      {/* Top nav */}
      <header style={styles.nav}>
        <span style={styles.navLogo}>DaChat</span>
        <div style={styles.navRight}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {currentOperator.name || currentOperator.email}
          </span>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Sign out
          </button>
        </div>
      </header>

      <div style={styles.body}>
        <ConversationList
          activeId={activeId}
          onSelect={handleSelect}
          currentOperator={currentOperator}
        />

        <main style={styles.main}>
          {activeId ? (
            <ConversationDetail
              conversationId={activeId}
              currentOperator={currentOperator}
              onShowContact={() => setShowContact((v) => !v)}
            />
          ) : (
            <div style={styles.emptyState}>
              <p>Select a conversation to get started</p>
            </div>
          )}
        </main>

        {showContact && activeConv && (
          <ContactSidebar
            conversation={activeConv}
            onClose={() => setShowContact(false)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: 52,
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg)',
    flexShrink: 0,
  },
  navLogo: {
    fontWeight: 700,
    fontSize: 18,
    color: 'var(--accent)',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '4px 12px',
    color: 'var(--text-secondary)',
    fontSize: 13,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: 'var(--sidebar-width)',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--border)',
    background: 'var(--bg)',
    overflow: 'hidden',
  },
  sidebarHeader: {
    padding: '16px 16px 12px',
    borderBottom: '1px solid var(--border)',
  },
  tabBar: {
    display: 'flex',
    gap: 2,
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    flexWrap: 'wrap',
  },
  tab: {
    background: 'none',
    border: 'none',
    borderRadius: 5,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  tabActive: {
    background: 'var(--bg-active)',
    color: 'var(--text)',
  },
  convList: {
    flex: 1,
    overflowY: 'auto',
  },
  listPlaceholder: {
    padding: 20,
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  convRow: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    padding: '12px 16px',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  convRowActive: {
    background: 'var(--bg-active)',
  },
  convRowTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  convName: {
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--text)',
  },
  convRowBottom: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 4,
    padding: '2px 6px',
  },
  assignedLabel: {
    fontSize: 11,
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 120,
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    background: 'var(--bg-secondary)',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
  },
  detail: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    gap: 12,
    flexShrink: 0,
  },
  contactBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 6,
  },
  avatarSm: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'var(--accent)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
  },
  detailActions: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  actionBtn: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text)',
  },
  statusBtn: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  threadContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  msgRow: {
    display: 'flex',
  },
  bubble: {
    maxWidth: '68%',
    borderRadius: 12,
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  bubbleOp: {
    background: 'var(--accent)',
    color: '#fff',
    borderBottomRightRadius: 2,
  },
  bubbleContact: {
    background: 'var(--bg-secondary)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderBottomLeftRadius: 2,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  bubbleTime: {
    fontSize: 10,
    opacity: 0.65,
    alignSelf: 'flex-end',
  },
  emptyMsg: {
    color: 'var(--text-muted)',
    textAlign: 'center',
    marginTop: 40,
  },
  loadingMsg: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg)',
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  textarea: {
    flex: 1,
    resize: 'none',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    outline: 'none',
    lineHeight: 1.5,
    background: 'var(--bg-secondary)',
  },
  sendBtn: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 18px',
    fontWeight: 600,
    height: 38,
    flexShrink: 0,
  },
  contactPanel: {
    width: 'var(--contact-panel-width)',
    flexShrink: 0,
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg)',
    overflow: 'hidden',
  },
  contactPanelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid var(--border)',
  },
  contactPanelBody: {
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    overflowY: 'auto',
  },
  avatarLg: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: 'var(--accent)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    fontWeight: 700,
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    color: 'var(--text-secondary)',
    padding: '2px 6px',
    borderRadius: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 8,
  },
  prevConvRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
}

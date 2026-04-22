import { useState, useEffect, useCallback, useRef } from 'react'
import type { Message } from './types.js'
import { wsManager } from './lib/ws.js'
import { startSession, fetchMessages, sendMessage, uploadAttachment } from './lib/api.js'
import { MessageList } from './components/MessageList.js'
import { MessageInput } from './components/MessageInput.js'

interface Session {
  token: string
  conversationId: string
  contactId: string
}

type Status = 'idle' | 'connecting' | 'ready' | 'error'

function TypingIndicator() {
  return (
    <div style={{ padding: '4px 16px', fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>
      Operator is typing…
    </div>
  )
}

export function Widget() {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [operatorTyping, setOperatorTyping] = useState(false)
  const [uploading, setUploading] = useState(false)
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readMessageIds = useRef<Set<string>>(new Set())

  // Init session on first open
  useEffect(() => {
    if (!open || session) return
    let cancelled = false

    setStatus('connecting')
    startSession({})
      .then(async (s) => {
        if (cancelled) return
        setSession(s)
        const msgs = await fetchMessages(s.conversationId, s.token)
        if (!cancelled) {
          setMessages(msgs)
          setStatus('ready')
          wsManager.connect(s.conversationId, s.token)
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [open, session])

  // Subscribe to WS events
  useEffect(() => {
    if (!session) return
    const unsub = wsManager.subscribe((event) => {
      switch (event.type) {
        case 'message:new':
          if (event.conversationId === session.conversationId) {
            setMessages((prev) => {
              // Deduplicate by ID
              if (prev.some((m) => m.id === event.message.id)) return prev
              return [...prev, event.message]
            })
          }
          break
        case 'typing:start':
          if (
            event.conversationId === session.conversationId &&
            event.senderType === 'operator'
          ) {
            setOperatorTyping(true)
            if (typingClearRef.current !== null) clearTimeout(typingClearRef.current)
            typingClearRef.current = setTimeout(() => {
              setOperatorTyping(false)
              typingClearRef.current = null
            }, 6000)
          }
          break
        case 'typing:stop':
          if (
            event.conversationId === session.conversationId &&
            event.senderType === 'operator'
          ) {
            setOperatorTyping(false)
            if (typingClearRef.current !== null) {
              clearTimeout(typingClearRef.current)
              typingClearRef.current = null
            }
          }
          break
        case 'receipt:read':
          if (event.conversationId === session.conversationId) {
            setMessages((prev) =>
              prev.map((m) => (m.id === event.messageId ? { ...m, read: true } : m)),
            )
          }
          break
      }
    })
    return unsub
  }, [session])

  const handleSend = useCallback(
    async (text: string) => {
      if (!session) return
      await sendMessage(session.conversationId, session.token, text, session.contactId)
    },
    [session],
  )

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!session || uploading) return
      setUploading(true)
      try {
        await uploadAttachment(session.conversationId, session.token, file, session.contactId)
      } finally {
        setUploading(false)
      }
    },
    [session, uploading],
  )

  const handleTypingStart = useCallback(() => {
    if (!session) return
    wsManager.send({ type: 'typing:start', conversationId: session.conversationId })
  }, [session])

  const handleTypingStop = useCallback(() => {
    if (!session) return
    wsManager.send({ type: 'typing:stop', conversationId: session.conversationId })
  }, [session])

  const handleMessageVisible = useCallback(
    (messageId: string) => {
      if (!session || readMessageIds.current.has(messageId)) return
      readMessageIds.current.add(messageId)
      wsManager.send({
        type: 'receipt:read',
        conversationId: session.conversationId,
        messageId,
      })
    },
    [session],
  )

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, fontFamily: 'system-ui, sans-serif' }}>
      {open && (
        <div
          style={{
            width: 360,
            height: 520,
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 12,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Support Chat</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {status === 'connecting' ? 'Connecting…' : status === 'ready' ? 'Online' : status === 'error' ? 'Connection error' : ''}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          {status === 'error' ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 14 }}>
              Could not connect. Please try again.
            </div>
          ) : status === 'connecting' ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14 }}>
              Starting conversation…
            </div>
          ) : (
            <>
              <MessageList
                messages={messages}
                contactId={session?.contactId ?? ''}
                onVisible={handleMessageVisible}
              />
              {operatorTyping && <TypingIndicator />}
              <MessageInput
                onSend={handleSend}
                onFileSelect={handleFileSelect}
                onTypingStart={handleTypingStart}
                onTypingStop={handleTypingStop}
                disabled={status !== 'ready' || uploading}
              />
            </>
          )}
        </div>
      )}

      {/* Launcher button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 24,
          boxShadow: '0 4px 16px rgba(37,99,235,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 'auto',
        }}
        title={open ? 'Close chat' : 'Open chat'}
      >
        {open ? '×' : '💬'}
      </button>
    </div>
  )
}

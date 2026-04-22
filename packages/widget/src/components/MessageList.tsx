import { useEffect, useRef } from 'react'
import type { Message } from '../types.js'

interface Props {
  messages: Message[]
  contactId: string
  onVisible: (messageId: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentBubble({ url, filename, size, mimeType }: { url: string; filename: string; size: number; mimeType: string }) {
  const isImage = mimeType.startsWith('image/')
  return (
    <div style={{ marginTop: 4 }}>
      {isImage ? (
        <img
          src={url}
          alt={filename}
          style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, display: 'block' }}
        />
      ) : (
        <a
          href={url}
          download={filename}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            background: 'rgba(0,0,0,0.08)',
            borderRadius: 8,
            textDecoration: 'none',
            color: 'inherit',
            fontSize: 13,
          }}
        >
          <span>📎</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</span>
          <span style={{ opacity: 0.6, flexShrink: 0 }}>{formatBytes(size)}</span>
        </a>
      )}
    </div>
  )
}

export function MessageList({ messages, contactId, onVisible }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Observe operator messages to send read receipts
  useEffect(() => {
    observerRef.current?.disconnect()
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.messageId
            if (id) onVisible(id)
          }
        })
      },
      { threshold: 0.5 },
    )
    observerRef.current = obs

    document.querySelectorAll('[data-observe-read]').forEach((el) => obs.observe(el))

    return () => obs.disconnect()
  }, [messages, onVisible])

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {messages.map((msg) => {
        const isContact = msg.senderType === 'contact' && msg.senderId === contactId
        return (
          <div
            key={msg.id}
            data-message-id={msg.id}
            data-observe-read={!isContact ? 'true' : undefined}
            style={{
              alignSelf: isContact ? 'flex-end' : 'flex-start',
              maxWidth: '75%',
            }}
          >
            <div
              style={{
                background: isContact ? '#2563eb' : '#f3f4f6',
                color: isContact ? '#fff' : '#111827',
                padding: '8px 12px',
                borderRadius: isContact ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                fontSize: 14,
                lineHeight: 1.4,
                wordBreak: 'break-word',
              }}
            >
              {msg.attachments && msg.attachments.length > 0
                ? msg.attachments.map((a) => (
                    <AttachmentBubble key={a.id} {...a} />
                  ))
                : msg.content}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: isContact ? 'flex-end' : 'flex-start',
                alignItems: 'center',
                gap: 4,
                marginTop: 2,
              }}
            >
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {isContact && msg.read && (
                <span style={{ fontSize: 11, color: '#2563eb' }} title="Read">✓✓</span>
              )}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

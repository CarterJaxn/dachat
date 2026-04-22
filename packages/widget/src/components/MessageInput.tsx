import { useState, useRef, useCallback } from 'react'

interface Props {
  onSend: (text: string) => void
  onFileSelect: (file: File) => void
  onTypingStart: () => void
  onTypingStop: () => void
  disabled?: boolean
}

export function MessageInput({ onSend, onFileSelect, onTypingStart, onTypingStop, disabled }: Props) {
  const [text, setText] = useState('')
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value)
      if (!isTypingRef.current) {
        isTypingRef.current = true
        onTypingStart()
      }
      if (typingTimerRef.current !== null) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false
        typingTimerRef.current = null
        onTypingStop()
      }, 1000)
    },
    [onTypingStart, onTypingStop],
  )

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    if (typingTimerRef.current !== null) {
      clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
    isTypingRef.current = false
    onTypingStop()
    setText('')
    onSend(trimmed)
  }, [text, disabled, onSend, onTypingStop])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileSelect(file)
      e.target.value = ''
    },
    [onFileSelect],
  )

  return (
    <div
      style={{
        borderTop: '1px solid #e5e7eb',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
      }}
    >
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        title="Attach file"
        style={{
          background: 'none',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '6px',
          color: '#6b7280',
          fontSize: 18,
          lineHeight: 1,
          borderRadius: 6,
          flexShrink: 0,
        }}
      >
        📎
      </button>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <textarea
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Type a message…"
        rows={1}
        style={{
          flex: 1,
          resize: 'none',
          border: '1px solid #e5e7eb',
          borderRadius: 20,
          padding: '8px 14px',
          fontSize: 14,
          lineHeight: 1.4,
          outline: 'none',
          fontFamily: 'inherit',
          maxHeight: 120,
          overflowY: 'auto',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        style={{
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: '50%',
          width: 36,
          height: 36,
          cursor: disabled || !text.trim() ? 'not-allowed' : 'pointer',
          opacity: disabled || !text.trim() ? 0.5 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        ➤
      </button>
    </div>
  )
}

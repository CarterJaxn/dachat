import type { Message } from '../types.js'

const BASE = ''

export async function startSession(opts: {
  name?: string
  email?: string
}): Promise<{ token: string; conversationId: string; contactId: string }> {
  const res = await fetch(`${BASE}/widget/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  if (!res.ok) throw new Error(`Session start failed: ${res.status}`)
  return res.json() as Promise<{ token: string; conversationId: string; contactId: string }>
}

export async function fetchMessages(
  conversationId: string,
  token: string,
): Promise<Message[]> {
  const res = await fetch(`${BASE}/conversations/${conversationId}/messages?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Fetch messages failed: ${res.status}`)
  const data = (await res.json()) as { messages: Message[] }
  return data.messages
}

export async function sendMessage(
  conversationId: string,
  token: string,
  content: string,
  contactId: string,
): Promise<Message> {
  const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content, senderType: 'contact', senderId: contactId }),
  })
  if (!res.ok) throw new Error(`Send message failed: ${res.status}`)
  const data = (await res.json()) as { message: Message }
  return data.message
}

export async function uploadAttachment(
  conversationId: string,
  token: string,
  file: File,
  contactId: string,
): Promise<{ message: Message }> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data URL prefix to get raw base64
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const res = await fetch(`${BASE}/conversations/${conversationId}/attachments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      data,
      senderType: 'contact',
      senderId: contactId,
    }),
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json() as Promise<{ message: Message }>
}

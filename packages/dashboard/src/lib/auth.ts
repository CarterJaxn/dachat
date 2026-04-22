import type { Operator } from '../types.js'

const TOKEN_KEY = 'dachat_token'
const OPERATOR_KEY = 'dachat_operator'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAuth(token: string, operator: Operator): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(OPERATOR_KEY, JSON.stringify(operator))
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(OPERATOR_KEY)
}

export function getOperator(): Operator | null {
  const raw = localStorage.getItem(OPERATOR_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Operator
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

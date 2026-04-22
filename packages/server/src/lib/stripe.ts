import Stripe from 'stripe'

const apiKey = process.env.STRIPE_SECRET_KEY
if (!apiKey) throw new Error('STRIPE_SECRET_KEY is required')

export const stripe = new Stripe(apiKey, {
  apiVersion: '2024-06-20',
})

export const PLANS = {
  free: {
    priceId: null,
    name: 'Free',
    agentSeats: 1,
    conversationsPerMonth: 500,
  },
  starter: {
    priceId: process.env.STRIPE_PRICE_STARTER ?? null,
    name: 'Starter',
    agentSeats: 5,
    conversationsPerMonth: 5_000,
  },
  pro: {
    priceId: process.env.STRIPE_PRICE_PRO ?? null,
    name: 'Pro',
    agentSeats: -1,        // unlimited
    conversationsPerMonth: -1, // unlimited
  },
} as const

export type PlanId = keyof typeof PLANS

export function planFromPriceId(priceId: string): PlanId {
  for (const [planId, plan] of Object.entries(PLANS)) {
    if (plan.priceId === priceId) return planId as PlanId
  }
  return 'free'
}

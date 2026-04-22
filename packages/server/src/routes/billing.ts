import type { FastifyPluginAsync } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { db, billingCustomers, subscriptions, billingEvents } from '../db/index.js'
import { stripe, PLANS, planFromPriceId, type PlanId } from '../lib/stripe.js'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const CreateCustomerBody = z.object({
  workspaceId: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
})

const CheckoutBody = z.object({
  workspaceId: z.string().min(1),
  planId: z.enum(['starter', 'pro']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
})

const PortalBody = z.object({
  workspaceId: z.string().min(1),
  returnUrl: z.string().url(),
})

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const billingRoutes: FastifyPluginAsync = async (fastify) => {
  // ------------------------------------------------------------------
  // GET /billing/plans — public pricing table
  // ------------------------------------------------------------------
  fastify.get('/billing/plans', async () => {
    return { plans: PLANS }
  })

  // ------------------------------------------------------------------
  // POST /billing/customers — create or return existing Stripe customer
  // ------------------------------------------------------------------
  fastify.post('/billing/customers', async (request, reply) => {
    const body = CreateCustomerBody.parse(request.body)

    const existing = await db.query.billingCustomers.findFirst({
      where: eq(billingCustomers.workspaceId, body.workspaceId),
    })
    if (existing) return { customer: existing }

    const stripeCustomer = await stripe.customers.create({
      email: body.email,
      name: body.name,
      metadata: { workspaceId: body.workspaceId },
    })

    const [customer] = await db
      .insert(billingCustomers)
      .values({
        workspaceId: body.workspaceId,
        stripeCustomerId: stripeCustomer.id,
        email: body.email,
        name: body.name,
      })
      .returning()

    reply.code(201)
    return { customer }
  })

  // ------------------------------------------------------------------
  // GET /billing/subscription?workspaceId=...
  // ------------------------------------------------------------------
  fastify.get<{ Querystring: { workspaceId: string } }>(
    '/billing/subscription',
    async (request, reply) => {
      const { workspaceId } = request.query
      if (!workspaceId) return reply.code(400).send({ error: 'workspaceId required' })

      const customer = await db.query.billingCustomers.findFirst({
        where: eq(billingCustomers.workspaceId, workspaceId),
      })
      if (!customer) return { subscription: null, plan: 'free' }

      const subscription = await db.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.customerId, customer.id),
          eq(subscriptions.status, 'active'),
        ),
      })

      return { subscription, plan: subscription?.planId ?? 'free' }
    },
  )

  // ------------------------------------------------------------------
  // POST /billing/checkout — create Stripe Checkout Session
  // ------------------------------------------------------------------
  fastify.post('/billing/checkout', async (request, reply) => {
    const body = CheckoutBody.parse(request.body)
    const plan = PLANS[body.planId]

    if (!plan.priceId) {
      return reply.code(400).send({ error: `No price configured for plan ${body.planId}` })
    }

    let customer = await db.query.billingCustomers.findFirst({
      where: eq(billingCustomers.workspaceId, body.workspaceId),
    })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      customer: customer?.stripeCustomerId,
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      metadata: { workspaceId: body.workspaceId, planId: body.planId },
      subscription_data: {
        metadata: { workspaceId: body.workspaceId, planId: body.planId },
      },
    })

    return { url: session.url }
  })

  // ------------------------------------------------------------------
  // POST /billing/portal — create Stripe Billing Portal session
  // ------------------------------------------------------------------
  fastify.post('/billing/portal', async (request, reply) => {
    const body = PortalBody.parse(request.body)

    const customer = await db.query.billingCustomers.findFirst({
      where: eq(billingCustomers.workspaceId, body.workspaceId),
    })
    if (!customer) {
      return reply.code(404).send({ error: 'No billing customer found for this workspace' })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: body.returnUrl,
    })

    return { url: session.url }
  })
}

// ---------------------------------------------------------------------------
// Webhook plugin — scoped with buffer content-type parser for signature verification
// ---------------------------------------------------------------------------

export const billingWebhookRoute: FastifyPluginAsync = async (fastify) => {
  // Override JSON parsing for webhook routes to capture raw body for sig verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  )

  fastify.post('/billing/webhooks/stripe', async (request, reply) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      return reply.code(500).send({ error: 'Webhook secret not configured' })
    }

    const sig = request.headers['stripe-signature']
    if (!sig || typeof sig !== 'string') {
      return reply.code(400).send({ error: 'Missing stripe-signature header' })
    }

    let event: ReturnType<typeof stripe.webhooks.constructEvent>
    try {
      event = stripe.webhooks.constructEvent(request.body as Buffer, sig, webhookSecret)
    } catch {
      return reply.code(400).send({ error: 'Webhook signature verification failed' })
    }

    // Idempotency — skip already-processed events
    const alreadyProcessed = await db.query.billingEvents.findFirst({
      where: eq(billingEvents.stripeEventId, event.id),
    })
    if (alreadyProcessed?.processed) {
      return { received: true }
    }

    // Record the event before processing
    await db
      .insert(billingEvents)
      .values({ stripeEventId: event.id, type: event.type, payload: event as unknown as Record<string, unknown> })
      .onConflictDoNothing()

    await handleStripeEvent(event)

    // Mark processed
    await db
      .update(billingEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(billingEvents.stripeEventId, event.id))

    return { received: true }
  })
}

// ---------------------------------------------------------------------------
// Event handler
// ---------------------------------------------------------------------------

async function handleStripeEvent(event: { type: string; data: { object: unknown } }) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as {
        customer: string
        subscription: string
        metadata: { workspaceId: string; planId: PlanId }
        customer_details?: { email?: string; name?: string }
      }

      const { workspaceId, planId } = session.metadata
      if (!workspaceId) break

      // Upsert billing customer
      let [customer] = await db
        .insert(billingCustomers)
        .values({
          workspaceId,
          stripeCustomerId: session.customer,
          email: session.customer_details?.email ?? '',
          name: session.customer_details?.name ?? undefined,
        })
        .onConflictDoUpdate({
          target: billingCustomers.workspaceId,
          set: { stripeCustomerId: session.customer },
        })
        .returning()

      // Fetch subscription details from Stripe
      const stripeSub = await stripe.subscriptions.retrieve(session.subscription)
      const priceId = (stripeSub.items.data[0]?.price.id) ?? ''

      await db
        .insert(subscriptions)
        .values({
          customerId: customer.id,
          stripeSubscriptionId: stripeSub.id,
          status: stripeSub.status,
          planId: planId ?? planFromPriceId(priceId),
          stripePriceId: priceId,
          currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        })
        .onConflictDoUpdate({
          target: subscriptions.stripeSubscriptionId,
          set: { status: stripeSub.status, updatedAt: new Date() },
        })
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as {
        id: string
        status: string
        items: { data: Array<{ price: { id: string } }> }
        current_period_start: number
        current_period_end: number
        cancel_at: number | null
        canceled_at: number | null
      }
      const priceId = sub.items.data[0]?.price.id ?? ''
      await db
        .update(subscriptions)
        .set({
          status: sub.status,
          planId: planFromPriceId(priceId),
          stripePriceId: priceId,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
          canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id))
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as { id: string }
      await db
        .update(subscriptions)
        .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id))
      break
    }

    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as {
        subscription: string
        status: string
      }
      if (!invoice.subscription) break
      // Sync subscription status from Stripe to stay consistent
      const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription)
      await db
        .update(subscriptions)
        .set({ status: stripeSub.status, updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, invoice.subscription))
      break
    }
  }
}

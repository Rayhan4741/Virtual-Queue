import crypto from 'crypto';
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { PaymentTransaction, type PaymentProvider } from '../models/PaymentTransaction.js';
import { MonthlyUsage } from '../models/MonthlyUsage.js';
import { getCurrentMonthString } from './tokenEngine.js';

const stripeClient = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

export interface CheckoutInitResult {
  provider: PaymentProvider;
  sessionId: string;
  checkoutUrl: string;
  mode: 'live' | 'sandbox_simulation';
  tokensUnlocked: number;
  amount: number;
  currency: string;
}

const EXTRA_TOKENS_PACK = 5;

export function getAvailableProviders() {
  return [
    {
      id: 'STRIPE' as PaymentProvider,
      name: 'Stripe (Card / Global)',
      configured: Boolean(env.STRIPE_SECRET_KEY),
      amount: 2,
      currency: 'USD',
      tokensUnlocked: EXTRA_TOKENS_PACK,
    },
    {
      id: 'SSLCOMMERZ' as PaymentProvider,
      name: 'SSLCommerz (BD Cards / MFS)',
      configured: Boolean(env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD),
      amount: 150,
      currency: 'BDT',
      tokensUnlocked: EXTRA_TOKENS_PACK,
    },
    {
      id: 'BKASH' as PaymentProvider,
      name: 'bKash (Mobile Wallet)',
      configured: Boolean(env.BKASH_APP_KEY && env.BKASH_APP_SECRET),
      amount: 150,
      currency: 'BDT',
      tokensUnlocked: EXTRA_TOKENS_PACK,
    },
  ];
}

export async function initiateExtraTokenCheckout(params: {
  userId: string;
  organizationId: string;
  provider: PaymentProvider;
  returnBaseUrl: string;
}): Promise<CheckoutInitResult> {
  const { userId, organizationId, provider, returnBaseUrl } = params;
  const month = getCurrentMonthString();
  const txId = `VQ-${provider}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

  if (provider === 'STRIPE') {
    if (stripeClient) {
      const session = await stripeClient.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Virtual Queue — +5 Extra Monthly Remote Tokens',
                description: 'Unlocks 5 additional remote queue tokens for the current month.',
              },
              unit_amount: 200,
            },
            quantity: 1,
          },
        ],
        metadata: { userId, organizationId, month, tokensUnlocked: String(EXTRA_TOKENS_PACK) },
        success_url: `${returnBaseUrl}/billing?status=success&provider=STRIPE&sessionId={CHECKOUT_SESSION_ID}`,
        cancel_url: `${returnBaseUrl}/billing?status=cancelled`,
      });

      await PaymentTransaction.create({
        userId,
        organizationId,
        provider: 'STRIPE',
        providerSessionId: session.id,
        amount: 2,
        currency: 'USD',
        tokensUnlocked: EXTRA_TOKENS_PACK,
        month,
        status: 'PENDING',
      });

      return {
        provider: 'STRIPE',
        sessionId: session.id,
        checkoutUrl: session.url!,
        mode: 'live',
        tokensUnlocked: EXTRA_TOKENS_PACK,
        amount: 2,
        currency: 'USD',
      };
    }
  }

  if (provider === 'SSLCOMMERZ' && env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD) {
    const base =
      env.SSLCOMMERZ_IS_SANDBOX === 'true'
        ? 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php'
        : 'https://securepay.sslcommerz.com/gwprocess/v4/api.php';

    const form = new URLSearchParams({
      store_id: env.SSLCOMMERZ_STORE_ID,
      store_passwd: env.SSLCOMMERZ_STORE_PASSWORD,
      total_amount: '150',
      currency: 'BDT',
      tran_id: txId,
      success_url: `${returnBaseUrl}/billing?status=success&provider=SSLCOMMERZ&sessionId=${txId}`,
      fail_url: `${returnBaseUrl}/billing?status=failed`,
      cancel_url: `${returnBaseUrl}/billing?status=cancelled`,
      cus_name: 'Virtual Queue Customer',
      cus_email: 'customer@virtualqueue.app',
      cus_add1: 'Dhaka',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
      cus_phone: '01700000000',
      shipping_method: 'NO',
      product_name: 'Extra Queue Tokens (5)',
      product_category: 'Digital Service',
      product_profile: 'non-physical-goods',
    });

    const res = await fetch(base, { method: 'POST', body: form });
    const data = (await res.json()) as { status?: string; GatewayPageURL?: string };
    if (data.status === 'SUCCESS' && data.GatewayPageURL) {
      await PaymentTransaction.create({
        userId,
        organizationId,
        provider: 'SSLCOMMERZ',
        providerSessionId: txId,
        amount: 150,
        currency: 'BDT',
        tokensUnlocked: EXTRA_TOKENS_PACK,
        month,
        status: 'PENDING',
      });
      return {
        provider: 'SSLCOMMERZ',
        sessionId: txId,
        checkoutUrl: data.GatewayPageURL,
        mode: 'live',
        tokensUnlocked: EXTRA_TOKENS_PACK,
        amount: 150,
        currency: 'BDT',
      };
    }
  }

  if (provider === 'BKASH' && env.BKASH_APP_KEY && env.BKASH_APP_SECRET) {
    const base =
      env.BKASH_IS_SANDBOX === 'true'
        ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta'
        : 'https://tokenized.pay.bka.sh/v1.2.0-beta';

    const tokenRes = await fetch(`${base}/tokenized/checkout/token/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        username: env.BKASH_USERNAME,
        password: env.BKASH_PASSWORD,
      },
      body: JSON.stringify({ app_key: env.BKASH_APP_KEY, app_secret: env.BKASH_APP_SECRET }),
    });
    const tokenJson = (await tokenRes.json()) as { id_token?: string };
    if (tokenJson.id_token) {
      const createRes = await fetch(`${base}/tokenized/checkout/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: tokenJson.id_token,
          'x-app-key': env.BKASH_APP_KEY,
        },
        body: JSON.stringify({
          mode: '0011',
          payerReference: userId,
          callbackURL: `${returnBaseUrl}/billing?status=success&provider=BKASH&sessionId=${txId}`,
          amount: '150',
          currency: 'BDT',
          intent: 'sale',
          merchantInvoiceNumber: txId,
        }),
      });
      const createJson = (await createRes.json()) as { paymentID?: string; bkashURL?: string };
      if (createJson.paymentID && createJson.bkashURL) {
        await PaymentTransaction.create({
          userId,
          organizationId,
          provider: 'BKASH',
          providerSessionId: createJson.paymentID,
          amount: 150,
          currency: 'BDT',
          tokensUnlocked: EXTRA_TOKENS_PACK,
          month,
          status: 'PENDING',
        });
        return {
          provider: 'BKASH',
          sessionId: createJson.paymentID,
          checkoutUrl: createJson.bkashURL,
          mode: 'live',
          tokensUnlocked: EXTRA_TOKENS_PACK,
          amount: 150,
          currency: 'BDT',
        };
      }
    }
  }

  // Sandbox simulation fallback when merchant API keys are not configured in local dev/test
  if (env.NODE_ENV === 'production') {
    throw new Error(`${provider} merchant credentials are not configured on the server.`);
  }

  const amount = provider === 'STRIPE' ? 2 : 150;
  const currency = provider === 'STRIPE' ? 'USD' : 'BDT';
  await PaymentTransaction.create({
    userId,
    organizationId,
    provider,
    providerSessionId: txId,
    amount,
    currency,
    tokensUnlocked: EXTRA_TOKENS_PACK,
    month,
    status: 'PENDING',
    metadata: { mode: 'sandbox_simulation' },
  });

  return {
    provider,
    sessionId: txId,
    checkoutUrl: `${returnBaseUrl}/billing?status=sandbox_confirm&provider=${provider}&sessionId=${txId}`,
    mode: 'sandbox_simulation',
    tokensUnlocked: EXTRA_TOKENS_PACK,
    amount,
    currency,
  };
}

/**
 * Idempotently completes a payment transaction and unlocks extra monthly quota.
 */
export async function completePaymentAndUnlockQuota(
  sessionId: string,
  requestingUserId?: string
): Promise<{
  unlocked: number;
  alreadyCompleted: boolean;
}> {
  const tx = await PaymentTransaction.findOne({ providerSessionId: sessionId });
  if (!tx) {
    throw new Error('Payment session not found.');
  }
  if (requestingUserId && tx.userId.toString() !== requestingUserId) {
    throw new Error('Forbidden: payment session belongs to another user.');
  }
  if (tx.status === 'COMPLETED') {
    return { unlocked: 0, alreadyCompleted: true };
  }
  if (env.NODE_ENV === 'production' && tx.metadata?.mode === 'sandbox_simulation') {
    throw new Error('Sandbox simulation payments cannot be verified in production.');
  }

  // Verify live Stripe session if configured
  if (tx.provider === 'STRIPE' && stripeClient && !tx.metadata?.mode) {
    const session = await stripeClient.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid' || (session.amount_total && session.amount_total < 200)) {
      throw new Error('Stripe payment has not been completed or amount mismatch.');
    }
  }

  // Atomic transition PENDING -> COMPLETED prevents race-condition double crediting
  const claimed = await PaymentTransaction.findOneAndUpdate(
    { _id: tx._id, status: 'PENDING' },
    { $set: { status: 'COMPLETED' } },
    { new: true }
  );
  if (!claimed) {
    return { unlocked: 0, alreadyCompleted: true };
  }

  await MonthlyUsage.updateOne(
    { userId: tx.userId, organizationId: tx.organizationId, month: tx.month },
    { $inc: { paidExtraQuota: tx.tokensUnlocked } },
    { upsert: true }
  );

  return { unlocked: tx.tokensUnlocked, alreadyCompleted: false };
}

export function constructStripeWebhookEvent(rawBody: Buffer, signature: string) {
  if (!stripeClient || !env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook secret is not configured.');
  }
  return stripeClient.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}

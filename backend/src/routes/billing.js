import { Router } from "express";
import Stripe from "stripe";
import { Purchase, User } from "../models/index.js";

const checkoutRouter = Router();
const webhookRouter = Router();

const {
  STRIPE_SECRET_KEY = "",
  STRIPE_WEBHOOK_SECRET = "",
  STRIPE_TUSK_PRICE_ID = "",
  FRONTEND_PUBLIC_URL = "http://localhost:5173",
} = process.env;

const STRIPE_API_VERSION = "2025-02-24.acacia";
const TUSK_PRODUCT_KEY = "tusk_ai_lifetime";

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION,
    })
  : null;

function getAppBaseUrl() {
  return String(FRONTEND_PUBLIC_URL).replace(/\/$/, "");
}

function toNullableId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPurchasePaid(session) {
  return session.payment_status === "paid" || session.status === "complete";
}

async function activateTuskAiFromSession(session) {
  const userId = toNullableId(session.metadata?.userId);
  if (!userId) {
    throw new Error("Checkout session metadata.userId is missing");
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw new Error(`User not found for checkout session: ${userId}`);
  }

  const checkoutSessionId = toNullableId(session.id);
  if (!checkoutSessionId) {
    throw new Error("Checkout session id is missing");
  }

  if (!isPurchasePaid(session)) {
    return;
  }

  await Purchase.upsert({
    userId: user.id,
    productKey: TUSK_PRODUCT_KEY,
    stripeCheckoutSessionId: checkoutSessionId,
    stripePaymentIntentId: toNullableId(session.payment_intent),
    amountTotal: typeof session.amount_total === "number" ? session.amount_total : null,
    currency: toNullableId(session.currency),
    status: "paid",
    paidAt: new Date(),
    metadata: {
      paymentStatus: session.payment_status,
      checkoutStatus: session.status,
      customerEmail: toNullableId(session.customer_details?.email),
    },
  });

  if (!user.tuskAiActivated) {
    await user.update({
      tuskAiActivated: true,
      tuskAiActivatedAt: new Date(),
      stripeCustomerId: toNullableId(session.customer) ?? user.stripeCustomerId,
    });
    return;
  }

  if (!user.stripeCustomerId && toNullableId(session.customer)) {
    await user.update({ stripeCustomerId: toNullableId(session.customer) });
  }
}

checkoutRouter.get("/status", async (req, res) => {
  try {
    const purchase = await Purchase.findOne({
      where: {
        userId: req.user.id,
        productKey: TUSK_PRODUCT_KEY,
        status: "paid",
      },
      order: [["paidAt", "DESC"]],
    });

    return res.status(200).json({
      tuskAiActivated: Boolean(req.user.tuskAiActivated),
      tuskAiActivatedAt: req.user.tuskAiActivatedAt,
      purchase: purchase
        ? {
            id: purchase.id,
            amountTotal: purchase.amountTotal,
            currency: purchase.currency,
            paidAt: purchase.paidAt,
            stripeCheckoutSessionId: purchase.stripeCheckoutSessionId,
          }
        : null,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch billing status", details: error.message });
  }
});

checkoutRouter.post("/checkout-session", async (req, res) => {
  try {
    const missingConfig = [];
    if (!STRIPE_SECRET_KEY) {
      missingConfig.push("STRIPE_SECRET_KEY");
    }
    if (!STRIPE_TUSK_PRICE_ID) {
      missingConfig.push("STRIPE_TUSK_PRICE_ID");
    }

    if (missingConfig.length > 0) {
      return res.status(503).json({
        message: "Stripe is not configured on server",
        missingConfig,
      });
    }

    if (!stripe) {
      return res.status(503).json({ message: "Stripe is not configured on server" });
    }

    const baseUrl = getAppBaseUrl();
    const successUrl = `${baseUrl}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/app?checkout=canceled`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: STRIPE_TUSK_PRICE_ID,
          quantity: 1,
        },
      ],
      metadata: {
        userId: req.user.id,
        productKey: TUSK_PRODUCT_KEY,
      },
      customer_email: req.user.email ?? undefined,
      client_reference_id: req.user.id,
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      invoice_creation: { enabled: false },
    });

    return res.status(200).json({
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create checkout session", details: error.message });
  }
});

checkoutRouter.post("/confirm-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: "Stripe is not configured on server" });
    }

    const sessionId = toNullableId(req.body?.sessionId);
    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || !session.id) {
      return res.status(404).json({ message: "Checkout session not found" });
    }

    const sessionUserId = toNullableId(session.metadata?.userId);
    if (!sessionUserId || sessionUserId !== req.user.id) {
      return res.status(403).json({ message: "Checkout session does not belong to this user" });
    }

    await activateTuskAiFromSession(session);

    const refreshedUser = await User.findByPk(req.user.id);
    return res.status(200).json({
      tuskAiActivated: Boolean(refreshedUser?.tuskAiActivated),
      tuskAiActivatedAt: refreshedUser?.tuskAiActivatedAt ?? null,
      paymentStatus: session.payment_status,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to confirm checkout session", details: error.message });
  }
});

webhookRouter.post("/", async (req, res) => {
  try {
    const missingConfig = [];
    if (!STRIPE_SECRET_KEY) {
      missingConfig.push("STRIPE_SECRET_KEY");
    }
    if (!STRIPE_WEBHOOK_SECRET) {
      missingConfig.push("STRIPE_WEBHOOK_SECRET");
    }

    if (missingConfig.length > 0 || !stripe) {
      return res.status(503).json({
        message: "Stripe webhook is not configured",
        missingConfig,
      });
    }

    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ message: "Missing Stripe signature" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      return res.status(400).json({ message: "Invalid webhook signature", details: error.message });
    }

    if (event.type === "checkout.session.completed") {
      await activateTuskAiFromSession(event.data.object);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(500).json({ message: "Webhook handling failed", details: error.message });
  }
});

export { checkoutRouter, webhookRouter };

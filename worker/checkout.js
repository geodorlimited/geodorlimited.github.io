// ═══════════════════════════════════════════════════════════════
//  GEODOR FASHION — Checkout Worker (Cloudflare Workers)
// ═══════════════════════════════════════════════════════════════
//  This is the only server-side code the shop needs. It runs for
//  free on Cloudflare Workers (100,000 requests/day free tier).
//
//  What it does:
//    1. Receives the cart from the shop page: { items: [{id, qty, size, color}] }
//    2. Looks up each product in YOUR Firestore database to get the
//       real price (customers can never tamper with prices — the
//       browser only sends product IDs).
//    3. Creates a Stripe Checkout Session and returns its URL.
//       The customer pays on Stripe's secure hosted page (cards,
//       Apple Pay, Google Pay, promo codes — all handled by Stripe).
//
//  Deployment + configuration: DOCUMENTATION.md → "Payments (Stripe)"
//
//  SETTINGS (set in Cloudflare dashboard → Worker → Settings → Variables):
//    STRIPE_SECRET_KEY   (encrypted!)  sk_test_... or sk_live_...
//    FIREBASE_PROJECT_ID               e.g. geodor-reviews-23b8d
//    SITE_URL                          e.g. https://www.geodorlimited.com
//    ALLOWED_ORIGINS                   comma-separated, e.g.
//                                      https://www.geodorlimited.com,https://geodorlimited.com
//  Optional (defaults shown below):
//    FIREBASE_API_KEY            the public apiKey from js/config.js (only
//                                needed if Firestore reads return 403)
//    CURRENCY                    usd
//    FREE_SHIPPING_THRESHOLD     150        (order total that earns free standard shipping)
//    SHIPPING_STANDARD           9.99
//    SHIPPING_EXPRESS            24.99
//    ALLOWED_COUNTRIES           US,GB,CA,FR,DE,IT,ES,NL,BE,IE,GH,NG
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method === 'GET') {
      return json({ ok: true, service: 'geodor-checkout' }, 200, cors);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    try {
      if (!env.STRIPE_SECRET_KEY) throw new UserError('Worker is missing STRIPE_SECRET_KEY');
      if (!env.FIREBASE_PROJECT_ID) throw new UserError('Worker is missing FIREBASE_PROJECT_ID');
      if (!env.SITE_URL) throw new UserError('Worker is missing SITE_URL');

      // ── 1. Parse + validate the cart ──────────────────────────
      const body = await request.json().catch(() => null);
      const items = body?.items;
      if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
        throw new UserError('Invalid cart');
      }
      for (const it of items) {
        if (typeof it.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(it.id)) throw new UserError('Invalid product id');
        if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 10) throw new UserError('Invalid quantity');
        if (it.size != null && (typeof it.size !== 'string' || it.size.length > 40)) throw new UserError('Invalid size');
        if (it.color != null && (typeof it.color !== 'string' || it.color.length > 40)) throw new UserError('Invalid color');
      }

      // ── 2. Fetch authoritative product data from Firestore ────
      const products = await Promise.all(items.map(it => fetchProduct(env, it.id)));

      let subtotalCents = 0;
      const lineItems = items.map((it, i) => {
        const p = products[i];
        if (!p) throw new UserError('A product in your bag is no longer available. Please refresh the shop.');
        if (p.active === false || p.inStock === false) {
          throw new UserError(`“${p.name}” is currently unavailable. Please remove it from your bag.`);
        }
        const unitAmount = Math.round(Number(p.price) * 100);
        if (!Number.isFinite(unitAmount) || unitAmount <= 0) throw new UserError('Invalid product price');
        subtotalCents += unitAmount * it.qty;

        const variant = [it.size, it.color].filter(Boolean).join(' / ');
        const image = firstUsableImage(p.images, env.SITE_URL);
        return {
          quantity: it.qty,
          price_data: {
            currency: env.CURRENCY || 'usd',
            unit_amount: unitAmount,
            product_data: {
              name: p.name + (variant ? ` — ${variant}` : ''),
              ...(image ? { images: [image] } : {}),
              metadata: { productId: it.id, size: it.size || '', color: it.color || '' }
            }
          }
        };
      });

      // ── 3. Create the Stripe Checkout Session ─────────────────
      const currency = env.CURRENCY || 'usd';
      const freeShippingCents = Math.round(Number(env.FREE_SHIPPING_THRESHOLD ?? 150) * 100);
      const standardCents = Math.round(Number(env.SHIPPING_STANDARD ?? 9.99) * 100);
      const expressCents = Math.round(Number(env.SHIPPING_EXPRESS ?? 24.99) * 100);
      const countries = (env.ALLOWED_COUNTRIES || 'US,GB,CA,FR,DE,IT,ES,NL,BE,IE,GH,NG')
        .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);

      const params = {
        mode: 'payment',
        line_items: lineItems,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        shipping_address_collection: { allowed_countries: countries },
        phone_number_collection: { enabled: true },
        shipping_options: [
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              display_name: subtotalCents >= freeShippingCents ? 'Standard Shipping (Free)' : 'Standard Shipping',
              fixed_amount: { amount: subtotalCents >= freeShippingCents ? 0 : standardCents, currency },
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 5 },
                maximum: { unit: 'business_day', value: 10 }
              }
            }
          },
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              display_name: 'Express Shipping',
              fixed_amount: { amount: expressCents, currency },
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 2 },
                maximum: { unit: 'business_day', value: 4 }
              }
            }
          }
        ],
        success_url: `${env.SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.SITE_URL}/shop.html?canceled=1`,
        metadata: {
          order_summary: items.map((it, i) =>
            `${it.qty}× ${products[i]?.name || it.id}${it.size || it.color ? ` (${[it.size, it.color].filter(Boolean).join('/')})` : ''}`
          ).join('; ').slice(0, 490)
        }
      };

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: encodeForm(params)
      });
      const session = await stripeRes.json();
      if (!stripeRes.ok) {
        console.error('Stripe error:', session.error?.message);
        throw new UserError('Payment service error — please try again in a moment.');
      }

      return json({ url: session.url }, 200, cors);

    } catch (err) {
      if (err instanceof UserError) return json({ error: err.message }, 400, cors);
      console.error('Unexpected error:', err);
      return json({ error: 'Something went wrong. Please try again.' }, 500, cors);
    }
  }
};

// ── Helpers ──────────────────────────────────────────────────────

class UserError extends Error {}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || '*'),
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}

function absoluteUrl(path, siteUrl) {
  if (/^https?:\/\//i.test(path)) return path;
  return siteUrl.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}

// Stripe requires product images to be short, real URLs. Anything else
// (e.g. base64 data pasted into the admin panel) is skipped so it can
// never break checkout — the session is simply created without a thumbnail.
function firstUsableImage(images, siteUrl) {
  for (const img of images || []) {
    if (typeof img !== 'string' || !img.trim() || img.startsWith('data:')) continue;
    const url = absoluteUrl(img.trim(), siteUrl);
    if (url.length <= 2048 && /^https?:\/\//i.test(url)) return url;
  }
  return null;
}

// Read one product from Firestore's public REST API.
// Reads are allowed by your Firestore rules; writes are not.
async function fetchProduct(env, id) {
  let url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/products/${id}`;
  if (env.FIREBASE_API_KEY) url += `?key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore read failed (${res.status})`);
  const doc = await res.json();
  return decodeFirestoreFields(doc.fields || {});
}

// Convert Firestore's typed JSON into a plain object.
function decodeFirestoreFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeFirestoreValue(v);
  return out;
}
function decodeFirestoreValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in v) return decodeFirestoreFields(v.mapValue.fields || {});
  return undefined;
}

// Flatten a nested object into Stripe's form-encoded bracket syntax:
// { line_items: [{ quantity: 1 }] } → line_items[0][quantity]=1
function encodeForm(obj) {
  const parts = [];
  const walk = (value, prefix) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${prefix}[${i}]`));
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        walk(v, prefix ? `${prefix}[${k}]` : k);
      }
    } else {
      parts.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(value)}`);
    }
  };
  walk(obj, '');
  return parts.join('&');
}

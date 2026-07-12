# GeoDor Fashion — geodorlimited.com

Fashion e-commerce site: static front-end on **GitHub Pages**, catalog/auth/forms on
**Firebase**, payments via **Stripe Checkout** through a **Cloudflare Worker**.
Fixed running cost: $0/month (Stripe charges per sale only).

## Pages

| URL | Purpose |
|---|---|
| `/` | Homepage — collections, lookbook, reviews, contact, newsletter |
| `/shop.html` | The shop — live catalog, cart, secure checkout |
| `/admin.html` | Shop-owner dashboard (products, messages, subscribers, reviews) |
| `/success.html` | Post-payment confirmation |
| `/legal.html` | Shipping / Returns / Privacy / Terms / Cookies |

## Documentation

- **[DOCUMENTATION.md](DOCUMENTATION.md)** — ★ start here: full setup (Firebase,
  Stripe, Cloudflare Worker, hosting), daily operations, security model,
  troubleshooting, costs.
- [REVIEWS_SETUP.md](REVIEWS_SETUP.md) — original live-reviews setup notes.
- [DOMAIN_EMAIL_GUIDE.md](DOMAIN_EMAIL_GUIDE.md) — domain & email notes.

## Development

No build step. Serve locally (JS modules don't run from `file://`):

```bash
python -m http.server 8000    # or: npx serve .
```

Deploy = push to `main`; GitHub Pages republishes in ~1 minute.

Key files: `js/config.js` (all site configuration), `firestore.rules` (database
security — paste into Firebase console when changed), `worker/checkout.js`
(payment endpoint — paste into Cloudflare when changed).

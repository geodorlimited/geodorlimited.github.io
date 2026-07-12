# GeoDor Fashion — Complete Setup & Operations Guide

This document covers everything needed to run the GeoDor website and online shop in
production: hosting, the product catalog, the admin panel, payments with Stripe,
and day-to-day operations. Follow the **Quick-Start Checklist** in order the first
time; afterwards this file is your reference manual.

---

## 1. What you have

| Piece | Technology | Where it runs | Cost |
|---|---|---|---|
| Website + shop pages | Static HTML/CSS/JS | GitHub Pages (`www.geodorlimited.com`) | Free |
| Product catalog, reviews, contact messages, newsletter list | Firestore database | Firebase project `geodor-reviews-23b8d` | Free tier (50K reads/day) |
| Admin login | Firebase Authentication | Same Firebase project | Free |
| Payment processing | Stripe Checkout (hosted payment page) | Stripe | No monthly fee — per-transaction only (~2.9% + 30¢, varies by country) |
| Checkout session creation | `worker/checkout.js` | Cloudflare Workers | Free tier (100K requests/day) |

```
Customer browser                         Shop owner browser
   │                                          │
   ├─ index.html / shop.html                  ├─ admin.html (login required)
   │       │ reads products, posts            │      │ add/edit/delete products,
   │       │ reviews/messages/emails          │      │ moderate reviews, read messages
   │       ▼                                  ▼
   │   ┌──────────────── Firebase ─────────────────┐
   │   │  Firestore (products, reviews, messages,  │
   │   │  newsletter)  +  Auth (admin accounts)    │
   │   └───────────────────▲───────────────────────┘
   │                       │ reads real prices (server-side)
   ├─ "Secure Checkout" ───► Cloudflare Worker ──► Stripe Checkout
   │                                                  │
   └◄─────── success.html ◄── payment succeeds ◄──────┘
                             (order recorded in Stripe Dashboard,
                              receipt emailed to customer)
```

**Key security property:** the customer's browser only ever sends *product IDs* to
the checkout worker. The worker looks up the real prices in your Firestore database,
so nobody can tamper with prices. Card details are handled entirely by Stripe — they
never touch your site or the worker (this keeps you PCI-compliant automatically).

### Repository layout

```
index.html          Homepage (collections, lookbook, reviews, contact, newsletter)
shop.html           The shop: live catalog, filters, search, cart, checkout
admin.html          Shop-owner dashboard (login required)
success.html        "Thank you" page customers land on after paying
legal.html          Shipping / Returns / Privacy / Terms / Cookies (templates!)
404.html            Not-found page (GitHub Pages serves this automatically)
css/style.css       All styling
js/config.js        ★ Central config: Firebase keys, checkout URL, currency, categories
js/main.js          Shared UI (nav, cursor, toast, cart badge)
js/theme.js         Day/night toggle (remembers each visitor's choice)
js/shop.js          Shop logic (catalog, cart, Stripe redirect)
js/admin.js         Admin panel logic
js/forms.js         Newsletter + contact form → Firestore
js/reviews.js       Live public reviews (existing feature)
firestore.rules     ★ Database security rules — must be published to Firebase
storage.rules       Photo-upload security rules — publish if you enable Storage (§7.1)
worker/checkout.js  ★ Cloudflare Worker that creates Stripe Checkout sessions
worker/wrangler.toml  Optional CLI deployment config for the worker
```

---

## 2. Quick-Start Checklist

Do these once, in order. Details for each step are in the sections below.

- [ ] **A.** Publish the Firestore security rules (§3.1)
- [ ] **B.** Enable Email/Password sign-in in Firebase Auth and create your admin account (§3.2)
- [ ] **C.** Add your admin UID to the `admins` collection (§3.3)
- [ ] **D.** Log in at `/admin.html`, click **Import Starter Products**, then edit them into your real catalog (§4)
- [ ] **D2.** *(Optional)* Enable Firebase Storage + publish `storage.rules` so you can upload product photos straight from the admin panel (§7.1)
- [ ] **E.** Create a Stripe account and get your **test** keys (§5.1)
- [ ] **F.** Deploy the Cloudflare Worker and configure its variables (§5.2)
- [ ] **G.** Put the worker URL into `js/config.js` → `SHOP.checkoutEndpoint` (§5.3)
- [ ] **H.** Do a full test purchase with card `4242 4242 4242 4242` (§5.4)
- [ ] **I.** Fill in the bracketed placeholders in `legal.html` (§7.4)
- [ ] **J.** Go live: activate your Stripe account and swap in the live key (§5.6)
- [ ] **K.** `git add -A && git commit && git push` — GitHub Pages redeploys automatically

---

## 3. Firebase setup (database + admin login)

You already have the Firebase project **`geodor-reviews-23b8d`** (it powers the live
reviews). The shop reuses it. Open https://console.firebase.google.com and select it.

### 3.1 Publish the security rules

The file [`firestore.rules`](firestore.rules) in this repo is the complete, current
ruleset (it includes the review rules you already had, plus rules for products,
messages, newsletter, and admins).

1. Firebase console → **Build → Firestore Database → Rules** tab
2. Delete what's there, paste the entire contents of `firestore.rules`
3. Click **Publish**

> ⚠️ Until you do this, the admin panel cannot write products and the contact/
> newsletter forms will be rejected. Whenever you change `firestore.rules` in the
> repo, re-paste and re-publish — the file in the repo does not deploy itself.

### 3.2 Create your admin login

1. Firebase console → **Build → Authentication → Get started**
2. **Sign-in method** tab → enable **Email/Password** (just the first toggle; you
   don't need "Email link")
3. **Users** tab → **Add user** → enter your email and a strong password
   (12+ characters; a password manager is worth using — this account controls your shop)

### 3.3 Authorize that account as an admin

Being able to *log in* is not enough — the database only obeys users listed in the
`admins` collection:

1. In **Authentication → Users**, copy the **User UID** of the account you created
   (a string like `dQ3xK9v...`)
2. Go to **Firestore Database → Data** → **Start collection**
   - Collection ID: `admins`
   - Document ID: *paste the UID*
   - Add one field: `role` = `owner` (the field content doesn't matter — only the
     document's existence is checked)
3. Save.

To add another admin later (e.g. a staff member), create their user in
Authentication, then add another document to `admins` with their UID. To revoke
access, delete their document from `admins`.

### 3.4 Collections reference

You never need to create these by hand — they appear when first written to:

| Collection | Written by | Read by | Contains |
|---|---|---|---|
| `products` | Admin panel | Everyone | The catalog |
| `reviews` | Public review form | Everyone | Star ratings + text |
| `messages` | Public contact form | Admins only | Customer inquiries |
| `newsletter` | Public newsletter form | Admins only | Subscriber emails |
| `admins` | You, in the console | (rules only) | One doc per admin UID |

---

## 4. The admin panel (`/admin.html`)

Open `https://www.geodorlimited.com/admin.html` and sign in.

- **Products** — add, edit, hide, mark sold-out, or delete items. Changes appear on
  the shop **instantly** (customers with the page open see updates live).
  - *Price*: just the number (e.g. `485`). *Original price* is optional — set it to
    show a strikethrough "sale" price.
  - *Sizes*: comma-separated (`XS, S, M, L`).
  - *Colors*: name + swatch color; shown as clickable dots on the product page.
  - *Images*: a repo path (`images/my_photo.jpg`) or any full `https://` URL. See
    §7.1 for how to add new photos.
  - *In stock* off = shown with a "Sold Out" badge and can't be bought.
    *Visible in shop* off = hidden from customers entirely (kept as a draft).
  - **Import Starter Products** (shown when the catalog is empty) loads the 8
    original demo pieces so you can edit rather than start from nothing.
- **Orders** — links to your Stripe Dashboard, which is the order book (§6).
- **Messages** — contact-form submissions. Reply opens your email client. Unread
  count shows on the tab.
- **Subscribers** — newsletter signups, with CSV export (importable into Mailchimp,
  Brevo, Klaviyo, etc. when you want to send campaigns).
- **Reviews** — delete spam/abuse from the public reviews section.

**Is it safe that `admin.html` is public?** Yes. The page is just an empty shell;
every read/write it performs is checked server-side by the Firestore rules against
your login. Someone without an admin account sees nothing and can change nothing.
(`admin.html` also carries `noindex` so search engines skip it.)

**Forgot your password?** Type your email on the login screen and click
"Forgot password?" — Firebase emails you a reset link.

---

## 5. Payments (Stripe) — one-time setup

Stripe was chosen because it has **no monthly fee** (you pay only a percentage per
sale), supports cards, Apple Pay and Google Pay out of the box, handles all card
security (PCI) for you, and gives you a full order dashboard. The customer pays on
a Stripe-hosted page and is returned to your site afterwards.

### 5.1 Create the Stripe account

1. Sign up at https://dashboard.stripe.com/register (choose the country where the
   business is registered — this cannot be changed later).
2. You start in **Test mode** (toggle at the top of the dashboard). Stay in test
   mode until §5.6.
3. Get your test secret key: **Developers → API keys → Secret key** (`sk_test_...`).
   - 🔴 **The secret key must never appear in this repository or any web page.**
     It goes only into the Cloudflare Worker's encrypted settings (next step).

### 5.2 Deploy the checkout worker (Cloudflare — free)

The worker is one file, [`worker/checkout.js`](worker/checkout.js). Easiest path,
no tools to install:

1. Create a free account at https://dash.cloudflare.com (no card required).
2. In the left menu: **Workers & Pages → Create → Create Worker**.
3. Name it `geodor-checkout` → **Deploy** (deploys a hello-world first).
4. Click **Edit code**, delete the placeholder, paste the entire contents of
   `worker/checkout.js`, then **Deploy**.
5. Go to the worker's **Settings → Variables and Secrets** and add:

   | Name | Type | Value |
   |---|---|---|
   | `STRIPE_SECRET_KEY` | **Secret** (encrypt!) | `sk_test_...` from §5.1 |
   | `FIREBASE_PROJECT_ID` | Text | `geodor-reviews-23b8d` |
   | `SITE_URL` | Text | `https://www.geodorlimited.com` |
   | `ALLOWED_ORIGINS` | Text | `https://www.geodorlimited.com,https://geodorlimited.com,http://localhost:8000` |

   Optional variables (defaults in parentheses):
   `CURRENCY` (`usd`), `FREE_SHIPPING_THRESHOLD` (`150`), `SHIPPING_STANDARD`
   (`9.99`), `SHIPPING_EXPRESS` (`24.99`), `ALLOWED_COUNTRIES`
   (`US,GB,CA,FR,DE,IT,ES,NL,BE,IE,GH,NG`).

6. Note the worker's URL, e.g. `https://geodor-checkout.<your-subdomain>.workers.dev`.
   Opening it in a browser should show `{"ok":true,"service":"geodor-checkout"}`.

*Alternative for developers:* `npm i -g wrangler`, edit `worker/wrangler.toml`,
then `cd worker && wrangler deploy && wrangler secret put STRIPE_SECRET_KEY`.

### 5.3 Connect the site to the worker

Open [`js/config.js`](js/config.js) and set:

```js
checkoutEndpoint: "https://geodor-checkout.<your-subdomain>.workers.dev",
```

Commit and push. Until this value is set, the shop works but the checkout button
shows "Checkout is not live yet".

### 5.4 Test the whole flow

1. Open the shop, add items to the bag, click **Secure Checkout**.
2. You should land on a Stripe payment page listing your items, sizes/colors,
   shipping choices, and (if the bag is over the threshold) free standard shipping.
3. Pay with Stripe's test card: **4242 4242 4242 4242**, any future expiry, any
   CVC, any postcode. (Declined-card test: `4000 0000 0000 0002`.)
4. You should be returned to `success.html` and the bag should be empty.
5. Check **Stripe Dashboard → Payments**: the order is there with the items,
   amounts, and the shipping address the "customer" entered.

### 5.5 Discount codes (replaces the old promo-code box)

Checkout has a built-in "Add promotion code" field. Create codes in Stripe:
**Product catalog → Coupons → Create coupon** (e.g. 10% off) → after saving, add a
**Promotion code** (e.g. `GEODOR10`). You can limit uses, set expiry dates, or
restrict to first-time customers — no code changes needed.

### 5.6 Going live (real money)

1. In Stripe: **Activate account** — Stripe collects your business details, bank
   account for payouts, and identity verification. Approval is usually same-day.
2. Toggle the dashboard out of test mode; copy the **live** secret key (`sk_live_...`).
3. In Cloudflare → your worker → Settings → Variables: replace
   `STRIPE_SECRET_KEY`'s value with the live key. That's the only change.
4. Recommended Stripe settings:
   - **Settings → Customer emails**: enable "Successful payments" (automatic receipts).
   - **Settings → Public details**: your support email + statement descriptor
     (what appears on customers' bank statements — e.g. `GEODOR FASHION`).
5. Make one small real purchase yourself and refund it (**Payments → ⋯ → Refund**)
   to confirm everything works end to end.

### 5.7 Changing shipping fees

Shipping is controlled by the worker's variables — Cloudflare dashboard →
**Workers & Pages → geodor-checkout → Settings → Variables and Secrets**, then Deploy:

| Variable | Controls | Example |
|---|---|---|
| `SHIPPING_STANDARD` | Standard Shipping price | `4.99` |
| `SHIPPING_EXPRESS` | Express Shipping price | `12.99` |
| `FREE_SHIPPING_THRESHOLD` | Subtotal at which Standard becomes free (`999999` = never) | `150` |
| `ALLOWED_COUNTRIES` | Countries you ship to (2-letter codes) | `GB,US,GH` |
| `CURRENCY` | Charge currency | `gbp` |

Keep the display side in sync: `freeShippingThreshold` and `currencySymbol` in
[`js/config.js`](js/config.js) control what the *cart* shows. The delivery-time
wording ("5–10 business days") lives in the `delivery_estimate` blocks of
[`worker/checkout.js`](worker/checkout.js) — edit and re-paste the worker to change it.

### 5.8 Payment notifications

- **Email to you on each sale:** Stripe Dashboard → your avatar (top right) →
  **Profile → Notifications** → tick **Successful payments** (plus *Disputes* and
  *Payout failures*). Per-user setting — each staff account sets its own.
- **Receipt to the customer:** **Settings (⚙) → Business → Customer emails** →
  enable **Successful payments** and **Refunds**. Automatic receipts send in
  **live mode only** — test purchases don't trigger them.
- **Push notification on your phone:** install the **Stripe Dashboard** app
  (iOS/Android) and allow notifications — instant ping per sale, refunds on the go.
- **Branding:** **Settings → Branding** puts your logo/colors on receipts and the
  checkout page.

### 5.9 Fees & payouts

- No monthly cost. Typical fee ~**2.9% + 30¢** per successful card charge (US) or
  **1.5% + 20p** (UK domestic cards) — see https://stripe.com/pricing for your country.
- Payouts go to your bank automatically (daily/weekly — configurable in
  **Settings → Payouts**). First payout takes ~7 days.

---

## 6. Day-to-day: orders

- **New order** → Stripe emails you (enable in **Settings → Communication
  preferences**) and it appears in **Dashboard → Payments** with line items
  (name — size / color), quantities, the customer's email, phone, and shipping address.
- **Fulfil it** → ship the items, then email the customer their tracking number
  (Stripe doesn't send shipping notifications for Checkout — that email is on you).
- **Refunds** → Payments → select payment → Refund (full or partial).
- **Stock** → the site does **not** auto-decrement stock. When something sells out,
  open the admin panel and hit **Mark Sold Out** on the product. For a small
  catalog this takes seconds; automating it is listed under Upgrades (§10).
- The Stripe mobile app (iOS/Android) gives you sale notifications on your phone.

---

## 7. Content management

### 7.1 Product photos

Three options, in order of convenience:

1. **Upload from the admin panel (easiest):** in the product editor click
   **⬆ Upload Photos** and pick images from your computer. They're automatically
   resized/compressed in the browser and stored in Firebase Storage; the URL is
   filled in for you. **One-time setup required:**
   - Firebase console → **Build → Storage → Get started** (pick the same region
     as your Firestore database).
     - *Note:* on newer Firebase projects, enabling Storage asks you to upgrade
       to the **Blaze** plan (a card on file). Actual usage at this scale sits
       inside the no-cost allowance, so the expected bill is still ~$0 — but if
       you'd rather not add a card, use option 2 below instead; everything else
       works the same.
   - Storage → **Rules** tab → paste the contents of
     [`storage.rules`](storage.rules) → **Publish**. (Same idea as the Firestore
     rules: everyone may view photos, only admins may upload.)
2. **In the repo:** copy the photo into `images/`, commit, push, then reference it
   in the admin panel as `images/your_photo.jpg`. Portrait ~4:5 ratio (e.g.
   800×1000px), JPEG, ideally under ~300 KB each ([squoosh.app](https://squoosh.app)
   is a free compressor).
3. **Any hosted URL:** paste a full `https://...` image URL into the admin panel
   (e.g. from Cloudinary's free tier).

Never paste raw image *data* (`data:image/...`) — the admin panel rejects it; it
bloats the database and payment pages can't use it.

The first image is the shop-grid thumbnail; additional images become gallery
thumbnails in the product popup.

### 7.2 Categories

Filter tabs and the admin category dropdown both come from `SHOP.categories` in
[`js/config.js`](js/config.js). Add/rename there, push, done. (If you rename a key,
re-save existing products in that category so they match the new key.)

### 7.3 Currency

Charge currency = `CURRENCY` variable on the worker (e.g. `gbp`). Display symbol =
`SHOP.currencySymbol` in `js/config.js` (e.g. `£`). Change both together.
Product prices in Firestore are plain numbers and don't change.

### 7.4 Legal pages — action required before going live

[`legal.html`](legal.html) ships with sensible **templates** for Shipping, Returns,
Privacy, Terms, and Cookies. Before accepting real payments:

- Replace the bracketed placeholders (`[registered company name and address]`,
  `[your country / state]`).
- Make sure the shipping times/prices match what you configured on the worker.
- EU/UK consumer law grants a 14-day cancellation right for most goods — the
  templates assume this, but have someone qualified review them for your market.
  Stripe also expects a visible refund policy and business contact info on your site.

### 7.5 Newsletter & contact

Both forms store straight into Firestore (no third-party service, no cost).
Subscribers can be exported as CSV from the admin panel whenever you're ready to
send a campaign via Mailchimp/Brevo/etc. Contact messages arrive in the admin
panel's Messages tab — nothing is emailed to you automatically, so check it (or
see §10 for notification options).

---

## 8. Hosting & deployment (GitHub Pages)

Already live — for reference:

- **How it deploys:** every `git push` to `main` republishes the site within ~1–2
  minutes. There is no build step; what's in the repo is what's served.
  ```bash
  git add -A
  git commit -m "Describe the change"
  git push origin main
  ```
- **Custom domain:** the `CNAME` file containing `www.geodorlimited.com` is what
  binds the domain — don't delete it. DNS at your registrar should have a `CNAME`
  record `www → geodorlimited.github.io` (and A/ALIAS records for the apex domain
  per [GitHub's docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)).
- **HTTPS:** in the repo → Settings → Pages, keep **Enforce HTTPS** checked.
- **Local preview:** the site uses JS modules, so you can't open the files directly
  (`file://`) — run a tiny server from the project folder:
  ```bash
  python -m http.server 8000       # or: npx serve .
  # then open http://localhost:8000
  ```
  `http://localhost:8000` is included in the worker's `ALLOWED_ORIGINS` example so
  test checkouts work locally too.

**Alternative hosts** (if you ever outgrow Pages): Netlify or Cloudflare Pages —
both free, both work with this repo unchanged (they're static hosts too). Update
DNS and the worker's `SITE_URL`/`ALLOWED_ORIGINS` if you move.

---

## 9. Security model — what's public and what isn't

| Item | Public? | Why it's safe |
|---|---|---|
| Firebase `apiKey` in `js/config.js` | Yes (by design) | It only *identifies* the project. All access control is the Firestore rules. Never treat it as a secret; never put real secrets in JS files. |
| Product data | Yes | It's a shop — the catalog is meant to be read. Writes require admin login. |
| `admin.html` source | Yes | It's an empty shell; the database rejects non-admin operations server-side. |
| Stripe **publishable** key | (not even used here) | The site never touches Stripe directly — only the worker does. |
| Stripe **secret** key (`sk_...`) | **NO — never** | Lives only in the Cloudflare Worker's encrypted variables. If it ever leaks (e.g. gets committed), roll it immediately in Stripe → Developers → API keys. |
| Prices | Tamper-proof | The worker reads prices from Firestore; the browser only sends product IDs. |
| Card numbers | Never seen by you | Entered only on Stripe's hosted page. |

Other notes:
- The contact/newsletter/review forms are validated by Firestore rules (length
  limits, shape) but are open to the public by nature — the admin panel makes
  cleanup easy. If spam becomes a problem, see App Check in §10.
- Keep your admin password strong and enable 2FA on: GitHub, Google (Firebase),
  Cloudflare, and Stripe. Those four accounts *are* your shop.

---

## 10. Optional upgrades (roadmap)

None of these are required to launch:

1. **Automatic stock decrement + order copies in Firestore** — add a Stripe
   webhook endpoint to the worker that, on `checkout.session.completed`, writes an
   order document and decrements stock. Needs a Firebase service account; a
   developer can add this in a few hours.
2. **Email notifications for contact messages** — a scheduled or triggered
   function (e.g. Cloudflare Worker cron) that emails you unread messages, or a
   form service like Formspree if you'd rather have email-first contact.
3. **Firebase App Check (reCAPTCHA)** — hardens the public forms against bots.
4. **Analytics** — [Plausible](https://plausible.io) (paid, private) or Google
   Analytics 4 (free): one `<script>` tag in the HTML files.
5. **Custom worker domain** — e.g. `checkout.geodorlimited.com` (Cloudflare →
   worker → Triggers → Custom domains) so the checkout URL matches your brand.
6. **Automatic shipping emails** — services like Shippo/EasyPost, or upgrade to
   Stripe's paid invoicing emails.
7. **Search engine sitemap** — add a simple `sitemap.xml` once the catalog is
   stable, and register the site in Google Search Console.

---

## 11. Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| Shop says "Loading the collection…" forever | Firestore rules not published (§3.1), or no internet access to `gstatic.com`. Check the browser console (F12). |
| Admin: "This account is not an admin" | The `admins/{UID}` document is missing or its ID isn't the exact UID (§3.3). |
| Admin saves fail / "Missing or insufficient permissions" | Rules not published, or you're signed in with a non-admin account. |
| Checkout button: "Checkout is not live yet" | `SHOP.checkoutEndpoint` in `js/config.js` is still empty (§5.3). |
| Checkout: CORS error in console | Your site's origin isn't in the worker's `ALLOWED_ORIGINS` (must match scheme+domain exactly, no trailing slash). |
| Checkout: "Payment service error" | Worker's `STRIPE_SECRET_KEY` missing/typo'd, or you're mixing test key with live mode. Check the worker logs (Cloudflare → worker → Logs). |
| Checkout: "Could not start checkout" | `SHOP.checkoutEndpoint` must be the **full** URL including `https://`. Also make sure the change is pushed — the live site reads the config from GitHub, not your computer. |
| Product image doesn't show at checkout | The image must be a repo path or `https://` URL. Pasted image data (`data:image/...`) is skipped by the worker and rejected by the admin panel. |
| Photo upload fails in admin panel | Storage not enabled yet, or `storage.rules` not published — both in §7.1. The upload error message says which. |
| Stripe page shows wrong shipping/currency | Fix the worker variables (§5.2) — they control checkout; `js/config.js` only controls what the *site* displays. |
| "A product in your bag is no longer available" | The product was deleted/hidden/marked sold-out after the customer bagged it. That's the safety net working. |
| Reviews/contact form rejected | Rules validation: name/message length limits. Also check rules are published. |
| Site changes don't appear | GitHub Pages cache — hard-refresh (Ctrl+Shift+R); deploys take a minute or two after push. |
| Login: "Too many attempts" | Firebase rate-limiting brute force — wait a few minutes or use the password reset link. |

---

## 12. Cost summary

| Service | Free tier | You'd start paying when… |
|---|---|---|
| GitHub Pages | 100 GB bandwidth/mo | Practically never for this site |
| Firebase Firestore | 50K reads, 20K writes/day | ~Thousands of daily visitors (then ~$0.06 per 100K reads) |
| Firebase Auth | Unlimited email/password users | Never |
| Cloudflare Workers | 100K requests/day | Never at this scale |
| Stripe | Pay-per-sale only | ~2.9% + 30¢ per order (varies by country) |
| Domain name | — | Your existing annual registration |

**Total fixed monthly cost: $0.** You only pay Stripe's cut when you make a sale.

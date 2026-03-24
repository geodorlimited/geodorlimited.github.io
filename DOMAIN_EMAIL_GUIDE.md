# GeoDor Fashion — Domain Email Setup Guide

## Your Professional Email Addresses

These emails are already referenced in the website:

| Address | Purpose |
|---|---|
| hello@geodorfashion.com | General inquiries |
| orders@geodorfashion.com | Order support |
| press@geodorfashion.com | Press & collaborations |
| noreply@geodorfashion.com | Automated transactional emails |

---

## Step-by-Step: How to Set Up Domain Email

### Step 1 — Register Your Domain

Purchase `geodorfashion.com` from:
- **Namecheap** (namecheap.com) — affordable, good UI
- **Cloudflare Registrar** (cloudflare.com) — at-cost pricing, best security
- **Google Domains / Squarespace Domains** — integrates well with Google Workspace

**Cost:** ~$12–$15/year

---

### Step 2 — Choose an Email Hosting Provider

#### Option A: Google Workspace (Recommended for Business)
**Cost:** $6–$18/user/month
**Best for:** Teams, Gmail interface, Google Drive integration

1. Go to workspace.google.com → Start free trial
2. Enter your domain `geodorfashion.com`
3. Verify domain ownership by adding a **TXT record** to your DNS:
   ```
   Type: TXT
   Name: @
   Value: google-site-verification=xxxxxxxxxxxx
   TTL: 3600
   ```
4. Add **MX Records** (Google provides these):
   ```
   Priority 1:  ASPMX.L.GOOGLE.COM
   Priority 5:  ALT1.ASPMX.L.GOOGLE.COM
   Priority 5:  ALT2.ASPMX.L.GOOGLE.COM
   Priority 10: ALT3.ASPMX.L.GOOGLE.COM
   Priority 10: ALT4.ASPMX.L.GOOGLE.COM
   ```
5. Create mailboxes in Google Admin Console:
   - hello@geodorfashion.com
   - orders@geodorfashion.com
   - press@geodorfashion.com

---

#### Option B: Microsoft 365 Business
**Cost:** $6/user/month
**Best for:** Outlook users, enterprise features

1. Go to microsoft.com/en-us/microsoft-365/business
2. Add domain `geodorfashion.com`
3. Verify via TXT record (Microsoft provides the value)
4. Add Microsoft MX Records:
   ```
   Type: MX
   Priority: 0
   Value: geodorfashion-com.mail.protection.outlook.com
   ```

---

#### Option C: Zoho Mail (Free tier available)
**Cost:** Free (up to 5 users) or $1/user/month
**Best for:** Startups, cost-conscious setup

1. Go to zoho.com/mail → Sign up free
2. Add domain → Verify with TXT record
3. Add Zoho MX Records:
   ```
   Priority 10: mx.zoho.com
   Priority 20: mx2.zoho.com
   Priority 50: mx3.zoho.com
   ```

---

#### Option D: Namecheap Private Email
**Cost:** $1.58/mailbox/month
**Best for:** Small teams, simple setup

- Included free with some Namecheap domain purchases
- Full webmail interface included
- Add MX records provided by Namecheap

---

### Step 3 — Add SPF, DKIM & DMARC Records

These protect your domain from being spoofed and improve email deliverability.

#### SPF Record (prevent spoofing)
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.google.com ~all
       (replace with your provider's SPF string)
TTL: 3600
```

#### DKIM Record (email authentication)
Your email provider generates this automatically.
Go to your admin panel → Email settings → DKIM → Copy the record value.
Add it as a TXT record to your DNS.

#### DMARC Record (policy enforcement)
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:hello@geodorfashion.com
TTL: 3600
```

---

### Step 4 — Set Up Email Aliases (Routing)

Instead of paying for multiple mailboxes, route aliases to one inbox:

**Google Workspace:**
Admin Console → Directory → Users → Select user → Add alias
- orders@geodorfashion.com → hello@geodorfashion.com
- press@geodorfashion.com → hello@geodorfashion.com

**Cloudflare Email Routing (Free):**
If your domain is on Cloudflare, use free Email Routing:
1. Cloudflare Dashboard → Email → Email Routing
2. Add custom addresses and route to your personal Gmail/Outlook

---

### Step 5 — Transactional Emails (Order Confirmations)

For automated emails (order confirmations, shipping updates), use:

#### Resend (Recommended — Modern & Developer-Friendly)
```javascript
// Install: npm install resend
import { Resend } from 'resend';
const resend = new Resend('re_YOUR_API_KEY');

await resend.emails.send({
  from: 'GeoDor Fashion <orders@geodorfashion.com>',
  to: customerEmail,
  subject: `Order Confirmed — #${orderNumber}`,
  html: `
    <h1>Thank you for your order!</h1>
    <p>Order #${orderNumber} has been received and is being prepared.</p>
    <p>You'll receive a shipping notification once dispatched.</p>
  `
});
```

**Setup:**
1. Sign up at resend.com (free up to 3,000 emails/month)
2. Add and verify your domain
3. Add the DNS records Resend provides
4. Get your API key from the dashboard

---

#### SendGrid (Established, Scalable)
```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

await sgMail.send({
  to: customerEmail,
  from: 'orders@geodorfashion.com',
  subject: `Order Confirmed — #${orderNumber}`,
  templateId: 'd-YOUR_TEMPLATE_ID', // Design in SendGrid dashboard
  dynamicTemplateData: { orderNumber, customerName, items: cart }
});
```

---

### Step 6 — Connect to Website Contact Form

In your backend (`/api/contact`):

```javascript
// Using Resend
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;

  await resend.emails.send({
    from: 'GeoDor Website <noreply@geodorfashion.com>',
    to: 'hello@geodorfashion.com',
    replyTo: email,
    subject: `New Inquiry: ${subject} — from ${name}`,
    html: `
      <strong>From:</strong> ${name} (${email})<br/>
      <strong>Subject:</strong> ${subject}<br/><br/>
      <p>${message}</p>
    `
  });

  res.json({ success: true });
});
```

---

## DNS Records Summary

Add all of these to your domain registrar's DNS panel:

| Type | Name | Value | Purpose |
|---|---|---|---|
| MX | @ | (provider's MX records) | Email routing |
| TXT | @ | v=spf1 include:... ~all | SPF anti-spoofing |
| TXT | google._domainkey | (from provider) | DKIM authentication |
| TXT | _dmarc | v=DMARC1; p=quarantine;... | DMARC policy |

**DNS propagation takes 24–48 hours globally.**

---

## Recommended Stack for GeoDor Fashion

| Need | Tool | Cost |
|---|---|---|
| Domain email | Google Workspace | $6/user/month |
| Transactional email | Resend | Free → $20/month |
| Newsletter | Klaviyo (fashion-focused) | Free up to 500 contacts |
| Payment processing | Stripe | 2.9% + 30¢ per transaction |
| Domain registrar | Cloudflare Registrar | ~$10/year |

---

*Document prepared for GeoDor Fashion — geodorfashion.com*

// ============================================
//  GEODOR FASHION — Checkout & Payment
//  Production: Replace Stripe test with live keys
// ============================================

let currentStep = 1;
let promoApplied = false;
let promoDiscount = 0;
const PROMO_CODES = { 'GEODOR10': 10, 'WELCOME20': 20, 'VIP30': 30 }; // percentage off

// ---- OPEN CHECKOUT ----
function openCheckout() {
  document.getElementById('checkoutOverlay').classList.add('open');
  document.getElementById('checkoutModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  goToStep(1);
  renderCheckoutItems();
}

// ---- CLOSE CHECKOUT ----
function closeCheckout() {
  document.getElementById('checkoutOverlay').classList.remove('open');
  document.getElementById('checkoutModal').classList.remove('open');
  document.body.style.overflow = '';
  currentStep = 1;
}

// ---- RENDER CHECKOUT ITEMS ----
function renderCheckoutItems() {
  const container = document.getElementById('checkoutItems');
  if (!container) return;

  container.innerHTML = cart.map(item => `
    <div class="checkout-item">
      <div class="checkout-item-img img-placeholder" style="min-height:0">
        <div class="placeholder-inner" style="padding:4px;"><span style="font-size:.5rem;opacity:.4">img</span></div>
      </div>
      <div style="flex:1">
        <div class="checkout-item-name">${item.name}</div>
        <div class="checkout-item-meta">${item.size} · ${item.color} · ×${item.qty}</div>
        <div class="checkout-item-price">$${(item.price * item.qty).toLocaleString(undefined, {minimumFractionDigits:2})}</div>
      </div>
    </div>
  `).join('');

  renderCheckoutTotals();
}

// ---- RENDER TOTALS ----
function renderCheckoutTotals() {
  const container = document.getElementById('checkoutTotals');
  if (!container) return;

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const shipping = getShippingCost();
  const discount = promoApplied ? Math.round(subtotal * (promoDiscount / 100)) : 0;
  const tax = Math.round((subtotal - discount) * 0.08);
  const grand = subtotal - discount + shipping + tax;

  container.innerHTML = `
    <div class="total-row"><span>Subtotal</span><span>$${subtotal.toLocaleString(undefined, {minimumFractionDigits:2})}</span></div>
    ${discount > 0 ? `<div class="total-row" style="color:var(--gold)"><span>Promo Discount (${promoDiscount}%)</span><span>−$${discount.toLocaleString(undefined, {minimumFractionDigits:2})}</span></div>` : ''}
    <div class="total-row"><span>Shipping</span><span>${shipping === 0 ? 'Free' : '$'+shipping.toFixed(2)}</span></div>
    <div class="total-row"><span>Tax (8%)</span><span>$${tax.toLocaleString(undefined, {minimumFractionDigits:2})}</span></div>
    <div class="total-row grand"><span>Total</span><span>$${grand.toLocaleString(undefined, {minimumFractionDigits:2})}</span></div>
  `;
}

function getShippingCost() {
  const selected = document.querySelector('input[name="shipping"]:checked');
  if (!selected) return 9.99;
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  if (selected.value === 'standard') return subtotal > 150 ? 0 : 9.99;
  if (selected.value === 'express') return 24.99;
  if (selected.value === 'overnight') return 49.99;
  return 9.99;
}

// ---- GO TO STEP ----
function goToStep(step) {
  // Validate step 1 before moving to 2
  if (step === 2 && !validateShipping()) return;
  // Validate step 2 before moving to 3
  if (step === 3 && !validatePayment()) return;

  currentStep = step;
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`checkoutStep${i}`);
    const btn = document.getElementById(`step${i}Btn`);
    if (el) el.classList.toggle('hidden', i !== step);
    if (btn) btn.classList.toggle('active', i === step);
  }

  if (step === 3) buildReview();
  renderCheckoutTotals();
}

// ---- VALIDATE SHIPPING ----
function validateShipping() {
  const fields = ['shFirstName','shLastName','shEmail','shAddress','shCity','shZip','shCountry'];
  for (const id of fields) {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) {
      el && (el.style.borderColor = '#e74c3c');
      setTimeout(() => el && (el.style.borderColor = ''), 2000);
      showToast("Please fill in all shipping fields");
      return false;
    }
    el.style.borderColor = '';
  }
  const email = document.getElementById('shEmail').value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast("Please enter a valid email address");
    return false;
  }
  return true;
}

// ---- VALIDATE PAYMENT ----
function validatePayment() {
  const method = document.querySelector('.pay-method.active')?.dataset.method || 'card';
  if (method !== 'card') return true; // PayPal/Apple Pay handled externally

  const cardName = document.getElementById('cardName')?.value.trim();
  const cardNum = document.getElementById('cardNumber')?.value.replace(/\s/g,'');
  const expiry = document.getElementById('cardExpiry')?.value;
  const cvc = document.getElementById('cardCvc')?.value;

  if (!cardName || cardNum.length < 16 || !expiry || cvc.length < 3) {
    showToast("Please complete all payment fields");
    return false;
  }
  return true;
}

// ---- BUILD REVIEW ----
function buildReview() {
  const ship = document.getElementById('reviewShipping');
  const pay = document.getElementById('reviewPayment');

  ship.innerHTML = `
    <h4>Shipping To</h4>
    <p>${document.getElementById('shFirstName').value} ${document.getElementById('shLastName').value}</p>
    <p>${document.getElementById('shAddress').value}, ${document.getElementById('shCity').value} ${document.getElementById('shZip').value}</p>
    <p>${document.getElementById('shCountry').value}</p>
    <p>${document.getElementById('shEmail').value}</p>
    <p style="color:var(--gold);margin-top:8px">Via ${getShippingLabel()}</p>
  `;

  const cardNum = document.getElementById('cardNumber')?.value;
  pay.innerHTML = `
    <h4>Payment</h4>
    <p>${getPaymentMethodLabel()}</p>
    ${cardNum ? `<p>Card ending in ${cardNum.replace(/\s/g,'').slice(-4)}</p>` : ''}
  `;
}

function getShippingLabel() {
  const el = document.querySelector('input[name="shipping"]:checked');
  if (!el) return 'Standard';
  return {standard:'Standard Shipping',express:'Express Shipping',overnight:'Overnight'}[el.value] || 'Standard';
}

function getPaymentMethodLabel() {
  const active = document.querySelector('.pay-method.active');
  const method = active?.dataset.method || 'card';
  return {card:'Credit / Debit Card',paypal:'PayPal',apple:'Apple Pay'}[method] || 'Card';
}

// ---- SELECT PAYMENT METHOD ----
function selectPayMethod(btn, method) {
  document.querySelectorAll('.pay-method').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  btn.dataset.method = method;

  document.getElementById('cardForm').style.display = method === 'card' ? 'block' : 'none';
  document.getElementById('paypalForm').style.display = method === 'paypal' ? 'block' : 'none';
  document.getElementById('appleForm').style.display = method === 'apple' ? 'block' : 'none';
}

// ---- PROMO CODE ----
function applyPromo() {
  const code = document.getElementById('promoCode').value.trim().toUpperCase();
  const msgEl = document.getElementById('promoMsg');

  if (PROMO_CODES[code]) {
    promoDiscount = PROMO_CODES[code];
    promoApplied = true;
    msgEl.className = 'promo-msg success';
    msgEl.textContent = `✓ ${promoDiscount}% discount applied!`;
    renderCheckoutTotals();
  } else {
    msgEl.className = 'promo-msg error';
    msgEl.textContent = '✗ Invalid promo code.';
  }
}

// ---- CARD FORMATTING ----
function formatCard(input) {
  let v = input.value.replace(/\D/g,'').slice(0,16);
  input.value = v.replace(/(.{4})/g,'$1 ').trim();

  // Detect card type
  const typeEl = document.getElementById('cardType');
  if (/^4/.test(v)) typeEl.textContent = 'VISA';
  else if (/^5[1-5]/.test(v)) typeEl.textContent = 'MC';
  else if (/^3[47]/.test(v)) typeEl.textContent = 'AMEX';
  else typeEl.textContent = '';
}

function formatExpiry(input) {
  let v = input.value.replace(/\D/g,'');
  if (v.length >= 2) v = v.slice(0,2) + ' / ' + v.slice(2,4);
  input.value = v;
}

// ---- PLACE ORDER ----
async function placeOrder() {
  const agreed = document.getElementById('termsAgree').checked;
  if (!agreed) { showToast("Please agree to the Terms of Service"); return; }

  const btn = document.getElementById('placeOrderBtn');
  btn.textContent = 'Processing…';
  btn.disabled = true;

  // --- PAYMENT PROCESSING ---
  // In production, integrate Stripe:
  //
  // const stripe = Stripe('pk_live_YOUR_PUBLISHABLE_KEY');
  // const { paymentMethod, error } = await stripe.createPaymentMethod({
  //   type: 'card',
  //   card: cardElement, // Stripe Elements card object
  //   billing_details: { name: document.getElementById('cardName').value }
  // });
  //
  // if (error) { showToast(error.message); btn.disabled = false; return; }
  //
  // const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  // const response = await fetch('/api/create-payment-intent', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     amount: Math.round(totalAmount * 100), // in cents
  //     currency: 'usd',
  //     payment_method: paymentMethod.id,
  //     receipt_email: document.getElementById('shEmail').value,
  //     metadata: {
  //       order_items: JSON.stringify(cart.map(i => ({ id: i.id, name: i.name, qty: i.qty }))),
  //       customer_name: `${document.getElementById('shFirstName').value} ${document.getElementById('shLastName').value}`
  //     }
  //   })
  // });
  // const { client_secret, error: intentError } = await response.json();
  // if (intentError) { showToast(intentError); return; }
  //
  // const result = await stripe.confirmCardPayment(client_secret);
  // if (result.error) { showToast(result.error.message); return; }

  // Simulate processing delay (remove in production)
  await new Promise(r => setTimeout(r, 2000));

  // ---- SUCCESS ----
  const orderNum = 'GD' + Date.now().toString().slice(-8);
  const email = document.getElementById('shEmail').value;

  document.getElementById('successEmail').textContent = email;
  document.getElementById('orderNumber').textContent = orderNum;

  // Hide all steps, show success
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`checkoutStep${i}`);
    if (el) el.classList.add('hidden');
  }
  document.getElementById('checkoutSuccess').classList.remove('hidden');

  // Clear cart
  cart = [];
  saveCart();
  updateCartUI();

  // In production: send confirmation email via your backend
  // await fetch('/api/send-confirmation', { method:'POST', body: JSON.stringify({ email, orderNum }) })
}

// ---- SUBSCRIBE NEWSLETTER ----
function subscribeNewsletter() {
  const email = document.getElementById('newsletterEmail').value;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast("Please enter a valid email");
    return;
  }
  // In production: POST to your email list service (Klaviyo, Mailchimp, etc.)
  // await fetch('/api/subscribe', { method:'POST', body: JSON.stringify({ email }) })
  document.getElementById('newsletterSuccess').style.display = 'block';
  document.querySelector('.newsletter-form').style.display = 'none';
}

// ---- CONTACT FORM ----
function submitContact() {
  const name = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const msg = document.getElementById('contactMessage').value.trim();

  if (!name || !email || !msg) { showToast("Please fill in all required fields"); return; }

  // In production: POST to your backend or use a service like Resend, SendGrid
  // await fetch('/api/contact', { method:'POST', body: JSON.stringify({ name, email, subject, message }) })

  document.getElementById('contactSuccess').style.display = 'block';
  ['contactName','contactEmail','contactMessage'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('contactSubject').value = '';
}

// ============================================
//  GEODOR FASHION — Shop (live catalog + cart + Stripe checkout)
//  Products live in Firestore and are managed from admin.html.
//  Checkout redirects to Stripe's hosted payment page via the
//  Cloudflare Worker in worker/checkout.js (see DOCUMENTATION.md).
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, SHOP, formatPrice } from "./config.js";

const db = getFirestore(initializeApp(firebaseConfig));

// ---- State ----
let products = [];                 // live catalog from Firestore
let cart = loadCart();             // [{key,id,name,price,size,color,qty,image,unavailable}]
let activeFilter = 'all';
let searchTerm = '';
let currentProduct = null;
let currentQty = 1;
let selectedSize = null;
let selectedColor = null;

// ---- DOM ----
const grid      = document.getElementById('productsGrid');
const statusEl  = document.getElementById('shopStatus');
const tabsEl    = document.getElementById('filterTabs');

// ---- Helpers ----
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function loadCart() {
  try { return JSON.parse(localStorage.getItem('geodor_cart') || '[]'); }
  catch { return []; }
}
function saveCart() { localStorage.setItem('geodor_cart', JSON.stringify(cart)); }
function toast(msg) { window.showToast ? window.showToast(msg) : alert(msg); }
function categoryLabel(key) {
  return (SHOP.categories.find(c => c.key === key) || {}).label || key || '';
}
function badgeFor(p) {
  if (p.inStock === false) return '<div class="product-badge badge-sold">Sold Out</div>';
  if (p.badge === 'sale')  return '<div class="product-badge badge-sale">Sale</div>';
  if (p.badge === 'new')   return '<div class="product-badge badge-new">New</div>';
  return '';
}

// ---- Filter tabs ----
function renderTabs() {
  const tabs = [{ key: 'all', label: 'All' }, ...SHOP.categories];
  tabsEl.innerHTML = tabs.map(t => `
    <button class="filter-tab ${t.key === activeFilter ? 'active' : ''}"
      onclick="filterProducts('${t.key}', this)">${escapeHTML(t.label)}</button>
  `).join('');
}

window.filterProducts = (category, btn) => {
  activeFilter = category;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderProducts();
};

// ---- Live catalog ----
onSnapshot(collection(db, 'products'), snap => {
  products = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.active !== false)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  reconcileCart();
  renderProducts();
  updateCartUI();
}, err => {
  console.error('[shop] catalog listener error:', err);
  statusEl.textContent = 'Could not load the collection. Please refresh.';
});

// Keep cart entries in sync with the live catalog (price/name changes,
// products removed or sold out since they were added).
function reconcileCart() {
  let changed = false;
  cart.forEach(item => {
    const p = products.find(x => x.id === item.id);
    if (!p || p.inStock === false) {
      if (!item.unavailable) { item.unavailable = true; changed = true; }
    } else {
      if (item.unavailable) { item.unavailable = false; changed = true; }
      if (item.price !== p.price) { item.price = p.price; changed = true; }
      if (item.name !== p.name)   { item.name = p.name;   changed = true; }
      const img = (p.images || [])[0] || '';
      if (item.image !== img)     { item.image = img;     changed = true; }
    }
  });
  if (changed) { saveCart(); renderCartSidebar(); }
}

// ---- Render grid ----
function renderProducts() {
  let list = activeFilter === 'all' ? products : products.filter(p => p.category === activeFilter);
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    list = list.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      categoryLabel(p.category).toLowerCase().includes(q));
  }

  if (!products.length) {
    statusEl.textContent = 'The collection is being curated — check back soon.';
    grid.innerHTML = '';
    return;
  }
  statusEl.textContent = list.length ? '' : 'No pieces match — try another filter or search.';

  grid.innerHTML = list.map(p => `
    <div class="product-card" data-id="${escapeHTML(p.id)}">
      <div class="product-img">
        <div class="img-placeholder">
          <div class="placeholder-inner">
            ${(p.images || [])[0]
              ? `<img src="${escapeHTML(p.images[0])}" alt="${escapeHTML(p.name)}" loading="lazy" />`
              : `<p>${escapeHTML(p.name)}</p>`}
          </div>
        </div>
        ${badgeFor(p)}
        <div class="product-quick">Quick View</div>
      </div>
      <div class="product-info">
        <div class="product-category">${escapeHTML(categoryLabel(p.category))}</div>
        <div class="product-name">${escapeHTML(p.name)}</div>
        <div class="product-price">
          ${p.originalPrice ? `<span class="price-old">${formatPrice(p.originalPrice)}</span>` : ''}
          <span class="${p.originalPrice ? 'price-new' : ''}">${formatPrice(p.price)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ---- Search (in-page + ?q= from other pages) ----
const searchInput = document.getElementById('shopSearch');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value.trim();
    renderProducts();
  });
}
const urlParams = new URLSearchParams(location.search);
if (urlParams.get('q')) {
  searchTerm = urlParams.get('q');
  if (searchInput) searchInput.value = searchTerm;
}
if (urlParams.get('canceled')) {
  setTimeout(() => toast('Checkout canceled — your bag is saved.'), 600);
}

// ---- Product modal ----
window.openProductModal = (id) => {
  const p = products.find(x => x.id === id);
  if (!p) return;
  currentProduct = p;
  currentQty = 1;
  selectedSize = (p.sizes || [])[0] || '';
  selectedColor = (p.colors || [])[0]?.name || '';

  document.getElementById('modalTag').textContent = categoryLabel(p.category);
  document.getElementById('modalName').textContent = p.name;
  document.getElementById('modalPrice').innerHTML =
    (p.originalPrice ? `<span class="price-old">${formatPrice(p.originalPrice)}</span> ` : '') + formatPrice(p.price);
  document.getElementById('modalDesc').textContent = p.description || '';
  document.getElementById('qtyDisplay').textContent = '1';

  // Images (click handling is delegated — see listeners below)
  const imgs = p.images || [];
  setMainImage(imgs[0] || '');
  document.getElementById('modalThumbs').innerHTML = imgs.map((src, i) => `
    <div class="modal-thumb" data-src="${escapeHTML(src)}">
      <img src="${escapeHTML(src)}" alt="View ${i + 1}" loading="lazy"
        style="width:100%;height:100%;object-fit:cover;object-position:center top;" />
    </div>
  `).join('');

  // Sizes
  const sizeWrap = document.getElementById('modalSizeWrap');
  sizeWrap.style.display = (p.sizes || []).length ? '' : 'none';
  document.getElementById('modalSizes').innerHTML = (p.sizes || []).map((s, i) => `
    <button class="size-btn ${i === 0 ? 'active' : ''}" data-size="${escapeHTML(s)}">${escapeHTML(s)}</button>
  `).join('');

  // Colors
  const colorWrap = document.getElementById('modalColorWrap');
  colorWrap.style.display = (p.colors || []).length ? '' : 'none';
  document.getElementById('modalColorName').textContent = selectedColor;
  document.getElementById('modalColors').innerHTML = (p.colors || []).map((c, i) => `
    <div class="color-swatch ${i === 0 ? 'active' : ''}"
      style="background:${escapeHTML(c.hex || '#333')}"
      title="${escapeHTML(c.name)}"
      data-color="${escapeHTML(c.name)}"></div>
  `).join('');

  // Material / care
  document.getElementById('modalMeta').innerHTML =
    (p.material ? `<div class="meta-item"><strong>Material:</strong> ${escapeHTML(p.material)}</div>` : '') +
    (p.care ? `<div class="meta-item"><strong>Care:</strong> ${escapeHTML(p.care)}</div>` : '');

  // Stock
  const addBtn = document.getElementById('modalAddBtn');
  const soldOut = p.inStock === false;
  addBtn.disabled = soldOut;
  addBtn.textContent = soldOut ? 'Sold Out' : 'Add to Bag';
  addBtn.classList.toggle('btn--disabled', soldOut);

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('productModal').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.setMainImage = (src) => {
  document.getElementById('modalMainImg').innerHTML = src
    ? `<img src="${escapeHTML(src)}" alt="Product view" style="width:100%;height:100%;object-fit:cover;object-position:center top;" />`
    : '';
};

window.closeModal = () => {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('productModal').classList.remove('open');
  document.body.style.overflow = '';
};

// Delegated clicks (safe for any characters in sizes/colors/keys)
document.getElementById('productsGrid').addEventListener('click', e => {
  const card = e.target.closest('.product-card');
  if (card) window.openProductModal(card.dataset.id);
});
document.getElementById('modalThumbs').addEventListener('click', e => {
  const thumb = e.target.closest('.modal-thumb');
  if (thumb) window.setMainImage(thumb.dataset.src);
});
document.getElementById('modalSizes').addEventListener('click', e => {
  const btn = e.target.closest('.size-btn');
  if (!btn) return;
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedSize = btn.dataset.size;
});
document.getElementById('modalColors').addEventListener('click', e => {
  const swatch = e.target.closest('.color-swatch');
  if (!swatch) return;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  swatch.classList.add('active');
  selectedColor = swatch.dataset.color;
  document.getElementById('modalColorName').textContent = selectedColor;
});
document.getElementById('cartItems').addEventListener('click', e => {
  const qtyBtn = e.target.closest('[data-cart-qty]');
  if (qtyBtn) { cartQty(qtyBtn.dataset.key, Number(qtyBtn.dataset.cartQty)); return; }
  const removeBtn = e.target.closest('[data-cart-remove]');
  if (removeBtn) removeFromCart(removeBtn.dataset.key);
});

window.changeQty = (delta) => {
  currentQty = Math.max(1, Math.min(10, currentQty + delta));
  document.getElementById('qtyDisplay').textContent = currentQty;
};

window.addToCartFromModal = () => {
  if (!currentProduct || currentProduct.inStock === false) return;
  const p = currentProduct;
  const key = `${p.id}-${selectedSize}-${selectedColor}`;
  const existing = cart.find(i => i.key === key);
  if (existing) {
    existing.qty = Math.min(10, existing.qty + currentQty);
  } else {
    cart.push({
      key, id: p.id, name: p.name, price: p.price,
      size: selectedSize, color: selectedColor, qty: currentQty,
      image: (p.images || [])[0] || ''
    });
  }
  saveCart();
  updateCartUI();
  window.closeModal();
  toast(`${p.name} added to bag`);
};

// ---- Cart ----
function updateCartUI() {
  const total = cart.reduce((sum, i) => sum + i.qty, 0);
  const countEl = document.getElementById('cartCount');
  if (countEl) {
    countEl.textContent = total;
    countEl.classList.toggle('show', total > 0);
  }
  const headerCount = document.getElementById('cartItemCount');
  if (headerCount) headerCount.textContent = `(${total})`;
}

function renderCartSidebar() {
  const itemsEl = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');

  if (!cart.length) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">◻</div>
        <p>Your bag is empty.</p>
        <button onclick="toggleCart()" class="btn btn--outline">Start Shopping</button>
      </div>`;
    footerEl.style.display = 'none';
    return;
  }

  footerEl.style.display = 'flex';
  const available = cart.filter(i => !i.unavailable);
  const subtotal = available.reduce((sum, i) => sum + i.price * i.qty, 0);
  document.getElementById('cartSubtotal').textContent = formatPrice(subtotal);

  const note = document.getElementById('cartNote');
  if (note) {
    note.textContent = subtotal >= SHOP.freeShippingThreshold
      ? '✓ Your order qualifies for free standard shipping'
      : `Free standard shipping on orders over ${formatPrice(SHOP.freeShippingThreshold)}`;
  }

  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item ${item.unavailable ? 'cart-item--off' : ''}">
      <div class="cart-item-img">
        ${item.image ? `<img src="${escapeHTML(item.image)}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:center top;" />` : ''}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHTML(item.name)}</div>
        <div class="cart-item-meta">${escapeHTML([item.size, item.color].filter(Boolean).join(' · '))}</div>
        ${item.unavailable
          ? `<div class="cart-item-meta" style="color:#e74c3c">No longer available</div>`
          : `<div class="qty-controls qty-controls--sm">
               <button data-cart-qty="-1" data-key="${escapeHTML(item.key)}" aria-label="Decrease">−</button>
               <span>${item.qty}</span>
               <button data-cart-qty="1" data-key="${escapeHTML(item.key)}" aria-label="Increase">+</button>
             </div>`}
        <div class="cart-item-row">
          <div class="cart-item-price">${item.unavailable ? '—' : formatPrice(item.price * item.qty)}</div>
          <button class="cart-item-remove" data-cart-remove data-key="${escapeHTML(item.key)}">Remove</button>
        </div>
      </div>
    </div>
  `).join('');

  const checkoutBtn = document.getElementById('checkoutBtn');
  checkoutBtn.disabled = !available.length;
}

function cartQty(key, delta) {
  const item = cart.find(i => i.key === key);
  if (!item) return;
  item.qty = Math.max(1, Math.min(10, item.qty + delta));
  saveCart();
  updateCartUI();
  renderCartSidebar();
}

function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
  saveCart();
  updateCartUI();
  renderCartSidebar();
}

window.toggleCart = () => {
  const sidebar = document.getElementById('cartSidebar');
  const overlay = document.getElementById('cartOverlay');
  const isOpen = sidebar.classList.toggle('open');
  overlay.classList.toggle('open', isOpen);
  if (isOpen) {
    renderCartSidebar();
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
};

// ---- Checkout: redirect to Stripe's hosted payment page ----
window.startCheckout = async () => {
  const items = cart
    .filter(i => !i.unavailable)
    .map(i => ({ id: i.id, qty: i.qty, size: i.size, color: i.color }));
  if (!items.length) return;

  if (!SHOP.checkoutEndpoint) {
    toast('Checkout is not live yet — payment setup pending.');
    console.warn('[shop] SHOP.checkoutEndpoint is empty. Deploy worker/checkout.js and set the URL in js/config.js (see DOCUMENTATION.md).');
    return;
  }

  const btn = document.getElementById('checkoutBtn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing secure checkout…';

  try {
    const res = await fetch(SHOP.checkoutEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      throw new Error(data.error || `Checkout failed (${res.status})`);
    }
    window.location.href = data.url; // Stripe-hosted checkout page
  } catch (err) {
    console.error('[shop] checkout error:', err);
    toast('Could not start checkout — please try again.');
    btn.disabled = false;
    btn.textContent = original;
  }
};

// ---- Init ----
renderTabs();
updateCartUI();
if (location.hash === '#cart') window.toggleCart();

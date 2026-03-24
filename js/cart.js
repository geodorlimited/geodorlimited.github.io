// ============================================
//  GEODOR FASHION — Cart Management
// ============================================

let cart = JSON.parse(localStorage.getItem('geodor_cart') || '[]');
let currentProduct = null;
let currentQty = 1;
let selectedSize = null;
let selectedColor = null;

// ---- RENDER PRODUCTS ----
function renderProducts(filter = 'all') {
  const grid = document.getElementById('productsGrid');
  const filtered = filter === 'all' ? PRODUCTS : PRODUCTS.filter(p => p.category === filter);

  grid.innerHTML = filtered.map(p => `
    <div class="product-card" data-category="${p.category}" onclick="openProductModal(${p.id})">
      <div class="product-img">
        <div class="img-placeholder" data-label="">
          <div class="placeholder-inner">
            ${p.images[0] ? `<img src="${p.images[0]}" alt="${p.name}" loading="lazy" />` : `<div class="placeholder-icon">📷</div><p>${p.name}</p>`}
          </div>
        </div>
        ${p.badge ? `<div class="product-badge badge-${p.badge}">${p.badge === 'new' ? 'New' : p.badge === 'sale' ? 'Sale' : 'Sold Out'}</div>` : ''}
        <div class="product-quick">Quick View</div>
      </div>
      <div class="product-info">
        <div class="product-category">${p.categoryLabel}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-price">
          ${p.originalPrice ? `<span class="price-old">$${p.originalPrice}</span>` : ''}
          <span class="${p.originalPrice ? 'price-new' : ''}">$${p.price.toLocaleString()}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ---- FILTER PRODUCTS ----
function filterProducts(category, btn) {
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderProducts(category);
}

// ---- OPEN PRODUCT MODAL ----
function openProductModal(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;
  currentProduct = p;
  currentQty = 1;
  selectedSize = p.sizes[0];
  selectedColor = p.colorNames[0];

  document.getElementById('modalTag').textContent = p.categoryLabel;
  document.getElementById('modalName').textContent = p.name;
  document.getElementById('modalPrice').textContent = `$${p.price.toLocaleString()}`;
  document.getElementById('modalDesc').textContent = p.description;
  document.getElementById('modalImgLabel').textContent = p.imagePlaceholder;
  document.getElementById('qtyDisplay').textContent = '1';

  // Sizes
  document.getElementById('modalSizes').innerHTML = p.sizes.map((s, i) => `
    <button class="size-btn ${i === 0 ? 'active' : ''}" onclick="selectSize(this, '${s}')">${s}</button>
  `).join('');

  // Colors
  document.getElementById('modalColors').innerHTML = p.colors.map((c, i) => `
    <div class="color-swatch ${i === 0 ? 'active' : ''}"
      style="background:${c}"
      title="${p.colorNames[i]}"
      onclick="selectColor(this, '${p.colorNames[i]}')"></div>
  `).join('');

  // Thumbnails
  document.getElementById('modalThumbs').innerHTML = p.images.map((src, i) => `
    <div class="modal-thumb img-placeholder" style="min-height:0;position:relative;overflow:hidden;">
      <img src="${src}" alt="View ${i+1}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;" loading="lazy" />
    </div>
  `).join('');

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('productModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('productModal').classList.remove('open');
  document.body.style.overflow = '';
}

function selectSize(btn, size) {
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedSize = size;
}

function selectColor(swatch, colorName) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  swatch.classList.add('active');
  selectedColor = colorName;
}

function changeQty(delta) {
  currentQty = Math.max(1, Math.min(10, currentQty + delta));
  document.getElementById('qtyDisplay').textContent = currentQty;
}

// ---- ADD TO CART FROM MODAL ----
function addToCartFromModal() {
  if (!currentProduct) return;
  addToCart(currentProduct, selectedSize, selectedColor, currentQty);
  closeModal();
  showToast(`${currentProduct.name} added to bag`);
}

// ---- ADD TO CART ----
function addToCart(product, size, color, qty = 1) {
  const key = `${product.id}-${size}-${color}`;
  const existing = cart.find(i => i.key === key);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ key, id: product.id, name: product.name, price: product.price, size, color, qty, category: product.categoryLabel, placeholder: product.imagePlaceholder });
  }
  saveCart();
  updateCartUI();
}

// ---- REMOVE FROM CART ----
function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
  saveCart();
  updateCartUI();
  renderCartSidebar();
}

// ---- SAVE CART ----
function saveCart() {
  localStorage.setItem('geodor_cart', JSON.stringify(cart));
}

// ---- UPDATE CART UI ----
function updateCartUI() {
  const total = cart.reduce((sum, i) => sum + i.qty, 0);
  const countEl = document.getElementById('cartCount');
  countEl.textContent = total;
  countEl.classList.toggle('show', total > 0);
  document.getElementById('cartItemCount').textContent = `(${total})`;
}

// ---- RENDER CART SIDEBAR ----
function renderCartSidebar() {
  const itemsEl = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');
  const emptyEl = document.getElementById('cartEmpty');

  if (cart.length === 0) {
    emptyEl.style.display = 'block';
    footerEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  footerEl.style.display = 'flex';

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  document.getElementById('cartSubtotal').textContent = `$${subtotal.toLocaleString(undefined, {minimumFractionDigits:2})}`;

  const itemsHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img img-placeholder" data-label="${item.placeholder}" style="min-height:0">
        <div class="placeholder-inner" style="padding:4px"><span style="font-size:.55rem;opacity:.4">img</span></div>
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-meta">${item.size} · ${item.color} · Qty ${item.qty}</div>
        <div class="cart-item-row">
          <div class="cart-item-price">$${(item.price * item.qty).toLocaleString(undefined, {minimumFractionDigits:2})}</div>
          <button class="cart-item-remove" onclick="removeFromCart('${item.key}')">Remove</button>
        </div>
      </div>
    </div>
  `).join('');

  itemsEl.innerHTML = itemsHTML + emptyEl.outerHTML;
  document.getElementById('cartEmpty').style.display = 'none';
}

// ---- TOGGLE CART ----
function toggleCart() {
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
}

// ---- PROCEED TO CHECKOUT ----
function proceedToCheckout() {
  if (cart.length === 0) return;
  toggleCart();
  openCheckout();
}

// ---- LOAD MORE ----
function loadMore() {
  showToast("More pieces loading soon — stay tuned!");
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  renderProducts();
  updateCartUI();
});

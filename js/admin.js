// ============================================
//  GEODOR FASHION — Admin Panel
//  Shop-owner dashboard: product CRUD, contact inbox,
//  newsletter subscribers, review moderation.
//  Access = Firebase Auth login + a matching /admins/{uid} doc
//  (enforced by firestore.rules — see DOCUMENTATION.md).
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged,
  signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig, SHOP, formatPrice } from "./config.js";

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

// ---- DOM ----
const $ = id => document.getElementById(id);
const loginView = $('loginView'), dashView = $('dashView');

// ---- Helpers ----
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 3000);
}
function fmtDate(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '';
  return ts.toDate().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function categoryLabel(key) {
  return (SHOP.categories.find(c => c.key === key) || {}).label || key || '';
}

// ═══════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('loginBtn'), status = $('loginStatus');
  btn.disabled = true;
  status.textContent = 'Signing in…';
  try {
    await signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPassword').value);
    status.textContent = '';
  } catch (err) {
    console.error('[admin] login error:', err.code);
    status.textContent = {
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/user-not-found': 'No account with that email.',
      'auth/wrong-password': 'Wrong email or password.',
      'auth/too-many-requests': 'Too many attempts — try again later or reset your password.'
    }[err.code] || 'Sign-in failed. Please try again.';
  } finally {
    btn.disabled = false;
  }
});

$('forgotBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  if (!email) { $('loginStatus').textContent = 'Enter your email first, then click “Forgot password?”.'; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    $('loginStatus').textContent = `Password reset email sent to ${email}.`;
  } catch {
    $('loginStatus').textContent = 'Could not send reset email — check the address.';
  }
});

$('signOutBtn').addEventListener('click', () => signOut(auth));

let unsubscribers = [];
function stopListeners() {
  unsubscribers.forEach(u => u());
  unsubscribers = [];
}

onAuthStateChanged(auth, async user => {
  stopListeners();
  if (!user) {
    loginView.style.display = '';
    dashView.style.display = 'none';
    $('signOutBtn').style.display = 'none';
    $('adminUser').textContent = '';
    return;
  }
  // Verify this user is actually an admin (rules enforce it server-side;
  // this check just gives a clear message instead of permission errors).
  let isAdmin = false;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    isAdmin = snap.exists();
  } catch { isAdmin = false; }

  if (!isAdmin) {
    $('loginStatus').innerHTML =
      `This account is not an admin.<br>Add a document with ID <code>${escapeHTML(user.uid)}</code> ` +
      `to the <code>admins</code> collection in Firestore (see DOCUMENTATION.md), then sign in again.`;
    await signOut(auth);
    return;
  }

  loginView.style.display = 'none';
  dashView.style.display = '';
  $('signOutBtn').style.display = '';
  $('adminUser').textContent = user.email;
  startDashboard();
});

// ═══════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════
$('adminTabs').addEventListener('click', e => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  document.querySelectorAll('#adminTabs .filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.admin-tab-panel').forEach(p => p.style.display = 'none');
  $(`tab-${btn.dataset.tab}`).style.display = '';
});

// ═══════════════════════════════════════════
//  DASHBOARD DATA
// ═══════════════════════════════════════════
let products = [], editingId = null;

function startDashboard() {
  // Products
  unsubscribers.push(onSnapshot(collection(db, 'products'), snap => {
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderProductList();
  }, err => console.error('[admin] products error:', err)));

  // Messages
  unsubscribers.push(onSnapshot(collection(db, 'messages'), snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderMessages(msgs);
  }, err => {
    console.error('[admin] messages error:', err);
    $('messageList').innerHTML = '<p class="admin-muted">Could not load messages (check Firestore rules are published).</p>';
  }));

  // Subscribers
  unsubscribers.push(onSnapshot(collection(db, 'newsletter'), snap => {
    const subs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderSubscribers(subs);
  }, err => {
    console.error('[admin] newsletter error:', err);
    $('subscriberList').innerHTML = '<p class="admin-muted">Could not load subscribers.</p>';
  }));

  // Reviews
  unsubscribers.push(onSnapshot(collection(db, 'reviews'), snap => {
    const reviews = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderReviews(reviews);
  }, err => console.error('[admin] reviews error:', err)));
}

// ═══════════════════════════════════════════
//  PRODUCTS — list
// ═══════════════════════════════════════════
function renderProductList() {
  $('productCount').textContent = products.length ? `(${products.length})` : '';
  $('seedBtn').style.display = products.length ? 'none' : '';

  if (!products.length) {
    $('productList').innerHTML =
      '<p class="admin-muted">No products yet. Click <strong>+ Add Product</strong>, or import the starter catalog to begin.</p>';
    return;
  }

  $('productList').innerHTML = products.map(p => `
    <div class="admin-row ${p.active === false ? 'admin-row--off' : ''}">
      <div class="admin-row__thumb">
        ${(p.images || [])[0] ? `<img src="${escapeHTML(p.images[0])}" alt="" loading="lazy" />` : ''}
      </div>
      <div class="admin-row__main">
        <strong>${escapeHTML(p.name)}</strong>
        <span class="admin-muted">${escapeHTML(categoryLabel(p.category))} · ${formatPrice(p.price || 0)}
          ${p.originalPrice ? `<s>${formatPrice(p.originalPrice)}</s>` : ''}</span>
        <span>
          <span class="pill ${p.inStock === false ? 'pill--red' : 'pill--green'}">${p.inStock === false ? 'Sold out' : 'In stock'}</span>
          <span class="pill ${p.active === false ? 'pill--grey' : 'pill--gold'}">${p.active === false ? 'Hidden' : 'Live'}</span>
          ${p.badge ? `<span class="pill pill--grey">${escapeHTML(p.badge)}</span>` : ''}
        </span>
      </div>
      <div class="admin-row__actions">
        <button class="btn btn--outline btn--sm" onclick="editProduct('${p.id}')">Edit</button>
        <button class="btn btn--ghost btn--sm" onclick="toggleField('${p.id}','inStock')">${p.inStock === false ? 'Mark In Stock' : 'Mark Sold Out'}</button>
        <button class="btn btn--ghost btn--sm" onclick="toggleField('${p.id}','active')">${p.active === false ? 'Show' : 'Hide'}</button>
        <button class="btn btn--ghost btn--sm btn--danger" onclick="deleteProduct('${p.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

window.toggleField = async (id, field) => {
  const p = products.find(x => x.id === id);
  if (!p) return;
  try {
    await updateDoc(doc(db, 'products', id), {
      [field]: p[field] === false, updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error(err); toast('Update failed');
  }
};

window.deleteProduct = async (id) => {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Delete “${p.name}” permanently?\n\nTip: use “Hide” instead if you might bring it back.`)) return;
  try {
    await deleteDoc(doc(db, 'products', id));
    toast('Product deleted');
  } catch (err) { console.error(err); toast('Delete failed'); }
};

// ═══════════════════════════════════════════
//  PRODUCTS — editor
// ═══════════════════════════════════════════
$('pCategory').innerHTML = SHOP.categories
  .map(c => `<option value="${c.key}">${escapeHTML(c.label)}</option>`).join('');

function colorRow(name = '', hex = '#1a1a1a') {
  const row = document.createElement('div');
  row.className = 'dyn-row';
  row.innerHTML = `
    <input class="form-input" placeholder="Color name (e.g. Obsidian)" value="${escapeHTML(name)}" data-role="cname" />
    <input type="color" value="${escapeHTML(hex)}" data-role="chex" aria-label="Color swatch" />
    <button type="button" class="btn btn--ghost btn--sm btn--danger" onclick="this.parentElement.remove()">✕</button>`;
  return row;
}
function imageRow(src = '') {
  const row = document.createElement('div');
  row.className = 'dyn-row';
  row.innerHTML = `
    <input class="form-input" placeholder="images/your_photo.jpg or https://…" value="${escapeHTML(src)}" data-role="img"
      oninput="this.parentElement.querySelector('img').src = this.value" />
    <img src="${escapeHTML(src)}" alt="" class="dyn-thumb" onerror="this.style.opacity=.15" onload="this.style.opacity=1" />
    <button type="button" class="btn btn--ghost btn--sm btn--danger" onclick="this.parentElement.remove()">✕</button>`;
  return row;
}
$('addColorBtn').addEventListener('click', () => $('colorRows').appendChild(colorRow()));
$('addImageBtn').addEventListener('click', () => $('imageRows').appendChild(imageRow()));

// ── Photo upload → Firebase Storage ──
// Photos are downscaled/compressed in the browser (max 1600px JPEG) so the
// shop stays fast and storage stays within the free allowance.
$('uploadImageBtn').addEventListener('click', () => $('imageFileInput').click());

$('imageFileInput').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = ''; // allow re-selecting the same file later
  if (!files.length) return;

  const status = $('uploadStatus');
  const btn = $('uploadImageBtn');
  btn.disabled = true;

  let done = 0;
  try {
    for (const file of files) {
      status.textContent = `Uploading ${done + 1} of ${files.length} — ${file.name}…`;
      if (!/^image\//.test(file.type)) throw new Error(`${file.name} is not an image`);

      const blob = await compressImage(file);
      const safeName = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'photo';
      const path = `products/${Date.now()}-${safeName}.jpg`;
      const snapshot = await uploadBytes(storageRef(storage, path), blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(snapshot.ref);

      // drop the URL into the image list (replace a single empty row if present)
      const emptyRow = [...$('imageRows').querySelectorAll('[data-role="img"]')].find(i => !i.value.trim());
      if (emptyRow) {
        emptyRow.value = url;
        emptyRow.dispatchEvent(new Event('input'));
      } else {
        $('imageRows').appendChild(imageRow(url));
      }
      done++;
    }
    status.textContent = `✓ ${done} photo${done === 1 ? '' : 's'} uploaded. Remember to click Save Product.`;
  } catch (err) {
    console.error('[admin] upload error:', err);
    status.textContent = {
      'storage/unauthorized': 'Upload blocked — publish storage.rules in Firebase → Storage → Rules (see DOCUMENTATION.md §7.1).',
      'storage/unknown': 'Upload failed — is Firebase Storage enabled? Console → Build → Storage → Get started (see DOCUMENTATION.md §7.1).',
      'storage/retry-limit-exceeded': 'Upload failed — check your connection and try again.'
    }[err.code] || `Upload failed (${err.code || err.message}). If Storage isn't set up yet, see DOCUMENTATION.md §7.1.`;
  } finally {
    btn.disabled = false;
  }
});

async function compressImage(file, maxDim = 1600, quality = 0.85) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    return blob || file;
  } catch {
    return file; // if anything goes wrong, upload the original
  }
}

function openEditor(p = null) {
  editingId = p?.id || null;
  $('editorTitle').textContent = p ? `Edit — ${p.name}` : 'New Product';
  $('pName').value = p?.name || '';
  $('pCategory').value = p?.category || SHOP.categories[0].key;
  $('pBadge').value = p?.badge || '';
  $('pPrice').value = p?.price ?? '';
  $('pOriginalPrice').value = p?.originalPrice ?? '';
  $('pDescription').value = p?.description || '';
  $('pSizes').value = (p?.sizes || []).join(', ');
  $('pMaterial').value = p?.material || '';
  $('pCare').value = p?.care || '';
  $('pInStock').checked = p ? p.inStock !== false : true;
  $('pActive').checked = p ? p.active !== false : true;

  $('colorRows').innerHTML = '';
  (p?.colors || []).forEach(c => $('colorRows').appendChild(colorRow(c.name, c.hex)));
  $('imageRows').innerHTML = '';
  (p?.images?.length ? p.images : ['']).forEach(src => $('imageRows').appendChild(imageRow(src)));

  $('editorStatus').textContent = '';
  $('productEditor').style.display = '';
  $('productEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.editProduct = (id) => {
  const p = products.find(x => x.id === id);
  if (p) openEditor(p);
};
$('newProductBtn').addEventListener('click', () => openEditor());
$('cancelEditBtn').addEventListener('click', () => { $('productEditor').style.display = 'none'; editingId = null; });

$('productEditor').addEventListener('submit', async e => {
  e.preventDefault();
  const status = $('editorStatus'), btn = $('saveProductBtn');

  const name = $('pName').value.trim();
  const price = parseFloat($('pPrice').value);
  if (!name || isNaN(price) || price < 0) {
    status.textContent = 'Name and a valid price are required.'; return;
  }
  const originalPrice = parseFloat($('pOriginalPrice').value);
  const colors = [...$('colorRows').querySelectorAll('.dyn-row')].map(r => ({
    name: r.querySelector('[data-role="cname"]').value.trim(),
    hex: r.querySelector('[data-role="chex"]').value
  })).filter(c => c.name);
  const images = [...$('imageRows').querySelectorAll('[data-role="img"]')]
    .map(i => i.value.trim()).filter(Boolean);
  if (images.some(s => s.startsWith('data:') || s.length > 500)) {
    status.textContent = 'Images must be a repo path (e.g. images/photo.jpg) or a normal https:// link — ' +
      'pasted image data is too large to store and breaks checkout. Add the photo file to the images folder instead.';
    return;
  }

  const data = {
    name,
    category: $('pCategory').value,
    badge: $('pBadge').value || null,
    price,
    originalPrice: isNaN(originalPrice) ? null : originalPrice,
    description: $('pDescription').value.trim(),
    sizes: $('pSizes').value.split(',').map(s => s.trim()).filter(Boolean),
    colors,
    images,
    material: $('pMaterial').value.trim(),
    care: $('pCare').value.trim(),
    inStock: $('pInStock').checked,
    active: $('pActive').checked,
    updatedAt: serverTimestamp()
  };

  btn.disabled = true;
  status.textContent = 'Saving…';
  try {
    if (editingId) {
      await updateDoc(doc(db, 'products', editingId), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'products'), data);
    }
    $('productEditor').style.display = 'none';
    editingId = null;
    toast('Product saved — it is live on the shop now');
  } catch (err) {
    console.error('[admin] save error:', err);
    status.textContent = 'Save failed — are you signed in as an admin?';
  } finally {
    btn.disabled = false;
  }
});

// ── Starter catalog (uses images already in the repo) ──
const STARTER_PRODUCTS = [
  { name: "Eclipse Structured Coat", category: "avant-garde", price: 485, originalPrice: null, badge: "new",
    description: "An architectural marvel in heavyweight wool. The asymmetric lapel and oversized shoulder construction make a statement before you say a word. Lined in silk satin.",
    sizes: ["XS","S","M","L","XL"],
    colors: [{name:"Obsidian",hex:"#1a1a1a"},{name:"Espresso",hex:"#2d2420"},{name:"Ash Umber",hex:"#3d3530"}],
    images: ["images/women_1.jpeg","images/women_2.jpeg","images/women_3.jpeg"],
    material: "82% Wool, 18% Cashmere. Silk satin lining.", care: "Dry clean only." },
  { name: "Nomad Utility Jacket", category: "streetwear", price: 295, originalPrice: 380, badge: "sale",
    description: "Tactical meets minimal. Multi-pocket nylon shell with a hidden hood and adjustable hem. The uniform of the urban explorer.",
    sizes: ["S","M","L","XL","XXL"],
    colors: [{name:"Sage Ops",hex:"#4a5240"},{name:"Matte Black",hex:"#2a2a2a"},{name:"Desert Tan",hex:"#8b7355"}],
    images: ["images/women_4.jpeg"],
    material: "100% Recycled Nylon Shell.", care: "Machine wash cold, hang dry." },
  { name: "Bias-Cut Silk Slip Dress", category: "minimalist", price: 320, originalPrice: null, badge: null,
    description: "Pure seduction in motion. Cut on the bias for a liquid drape that moves with your body. Available in three considered colorways.",
    sizes: ["XS","S","M","L"],
    colors: [{name:"Sand Dune",hex:"#c8b89a"},{name:"Midnight",hex:"#1a1a2e"},{name:"Crimson",hex:"#8b2635"}],
    images: ["images/women_5.jpeg"],
    material: "100% Silk Charmeuse.", care: "Hand wash cold or dry clean." },
  { name: "Hand-Draped Couture Gown", category: "couture", price: 1850, originalPrice: null, badge: "new",
    description: "Atelier-crafted. Each piece is hand-draped and finished by a single master tailor. No two are identical. Allow 4–6 weeks for creation.",
    sizes: ["Custom"],
    colors: [{name:"Ivory",hex:"#f5f0eb"},{name:"Gold Leaf",hex:"#c9a84c"},{name:"Noir",hex:"#1a1a1a"}],
    images: ["images/women_7.jpeg"],
    material: "French Duchess Satin. Hand-beaded embellishments.", care: "Dry clean only. Professional care recommended." },
  { name: "Deconstructed Linen Blazer", category: "avant-garde", price: 395, originalPrice: null, badge: null,
    description: "Tailoring that refuses to conform. Exposed seams, raw edges, and a deliberately unfinished hem. Structure through deliberate unstructuring.",
    sizes: ["XS","S","M","L","XL"],
    colors: [{name:"Natural Linen",hex:"#d4cbb8"},{name:"Tobacco",hex:"#5c5248"},{name:"Dark Walnut",hex:"#2a2420"}],
    images: ["images/men_1.jpeg"],
    material: "100% Stone-washed Belgian Linen.", care: "Machine wash gentle, lay flat to dry." },
  { name: "Fluid Wide-Leg Trousers", category: "minimalist", price: 215, originalPrice: null, badge: null,
    description: "Movement as design. Crafted from a weightless crepe that creates a perfect silhouette whether you stand or walk.",
    sizes: ["XS","S","M","L","XL"],
    colors: [{name:"Noir",hex:"#1a1a1a"},{name:"Dove",hex:"#c8c4bc"},{name:"Forest",hex:"#2d4a3e"}],
    images: ["images/women_8.jpg"],
    material: "68% Viscose, 32% Polyester Crepe.", care: "Hand wash cold or dry clean." },
  { name: "Cargo Oversized Hoodie", category: "streetwear", price: 165, originalPrice: null, badge: "new",
    description: "The ultimate off-duty essential. Heavyweight French terry with a dropped shoulder and kangaroo pocket large enough to mean it.",
    sizes: ["S","M","L","XL","XXL"],
    colors: [{name:"Graphite",hex:"#3a3a3a"},{name:"Clay",hex:"#6b5c4e"},{name:"Forest Night",hex:"#2a3a2a"}],
    images: ["images/men_3.jpeg"],
    material: "100% Organic Cotton French Terry.", care: "Machine wash warm, tumble dry low." },
  { name: "Crystal-Pleated Midi Skirt", category: "couture", price: 680, originalPrice: null, badge: null,
    description: "Pleats set by hand using a traditional Japanese technique. The silk organza catches light with every movement, creating a luminous halo effect.",
    sizes: ["XS","S","M","L"],
    colors: [{name:"Pearl",hex:"#e8ddd0"},{name:"Gold Dust",hex:"#c9a84c"},{name:"Amethyst",hex:"#8b6b8b"}],
    images: ["images/women_9.jpg"],
    material: "100% Silk Organza. Hand-pressed pleats.", care: "Dry clean only." }
];

$('seedBtn').addEventListener('click', async () => {
  if (!confirm('Import 8 starter products? You can edit or delete them afterwards.')) return;
  $('seedBtn').disabled = true;
  try {
    for (const p of STARTER_PRODUCTS) {
      await addDoc(collection(db, 'products'), {
        ...p, inStock: true, active: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
    }
    toast('Starter catalog imported');
  } catch (err) {
    console.error(err); toast('Import failed');
  } finally {
    $('seedBtn').disabled = false;
  }
});

// ═══════════════════════════════════════════
//  MESSAGES
// ═══════════════════════════════════════════
function renderMessages(msgs) {
  const unread = msgs.filter(m => !m.read).length;
  $('msgBadge').textContent = unread ? unread : '';

  if (!msgs.length) {
    $('messageList').innerHTML = '<p class="admin-muted">No messages yet. Contact-form submissions land here.</p>';
    return;
  }
  $('messageList').innerHTML = msgs.map(m => `
    <div class="admin-row ${m.read ? 'admin-row--off' : ''}">
      <div class="admin-row__main">
        <strong>${escapeHTML(m.name)} ${m.read ? '' : '<span class="pill pill--gold">New</span>'}</strong>
        <span class="admin-muted">${escapeHTML(m.email)} · ${escapeHTML(m.subject || 'General')} · ${fmtDate(m.createdAt)}</span>
        <p class="admin-msg-body">${escapeHTML(m.message)}</p>
      </div>
      <div class="admin-row__actions">
        <a class="btn btn--outline btn--sm" href="mailto:${escapeHTML(m.email)}?subject=Re: ${encodeURIComponent(m.subject || 'Your message to GeoDor')}">Reply</a>
        <button class="btn btn--ghost btn--sm" onclick="toggleRead('${m.id}', ${m.read ? 'false' : 'true'})">${m.read ? 'Mark Unread' : 'Mark Read'}</button>
        <button class="btn btn--ghost btn--sm btn--danger" onclick="deleteMessage('${m.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}
window.toggleRead = async (id, read) => {
  try { await updateDoc(doc(db, 'messages', id), { read }); }
  catch (err) { console.error(err); toast('Update failed'); }
};
window.deleteMessage = async (id) => {
  if (!confirm('Delete this message?')) return;
  try { await deleteDoc(doc(db, 'messages', id)); }
  catch (err) { console.error(err); toast('Delete failed'); }
};

// ═══════════════════════════════════════════
//  SUBSCRIBERS
// ═══════════════════════════════════════════
let subscribersCache = [];
function renderSubscribers(subs) {
  subscribersCache = subs;
  $('subCount').textContent = subs.length ? `(${subs.length})` : '';
  if (!subs.length) {
    $('subscriberList').innerHTML = '<p class="admin-muted">No subscribers yet. Newsletter sign-ups land here.</p>';
    return;
  }
  $('subscriberList').innerHTML = subs.map(s => `
    <div class="admin-row">
      <div class="admin-row__main">
        <strong>${escapeHTML(s.email || s.id)}</strong>
        <span class="admin-muted">${fmtDate(s.createdAt)}</span>
      </div>
      <div class="admin-row__actions">
        <button class="btn btn--ghost btn--sm btn--danger" data-unsub="${escapeHTML(s.id)}">Remove</button>
      </div>
    </div>
  `).join('');
}
$('subscriberList').addEventListener('click', async e => {
  const btn = e.target.closest('[data-unsub]');
  if (!btn) return;
  const id = btn.dataset.unsub;
  if (!confirm(`Remove ${id} from the list?`)) return;
  try { await deleteDoc(doc(db, 'newsletter', id)); }
  catch (err) { console.error(err); toast('Delete failed'); }
});
$('exportSubsBtn').addEventListener('click', () => {
  if (!subscribersCache.length) { toast('No subscribers to export'); return; }
  const csv = 'email,subscribed_at\n' + subscribersCache
    .map(s => `${s.email || s.id},${s.createdAt?.toDate ? s.createdAt.toDate().toISOString() : ''}`)
    .join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `geodor-subscribers-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ═══════════════════════════════════════════
//  REVIEWS
// ═══════════════════════════════════════════
function renderReviews(reviews) {
  if (!reviews.length) {
    $('reviewList').innerHTML = '<p class="admin-muted">No reviews yet.</p>';
    return;
  }
  $('reviewList').innerHTML = reviews.map(r => `
    <div class="admin-row">
      <div class="admin-row__main">
        <strong>${escapeHTML(r.name || 'Anonymous')} <span class="review-card__stars">${'★'.repeat(r.rating || 0)}${'☆'.repeat(5 - (r.rating || 0))}</span></strong>
        <span class="admin-muted">${fmtDate(r.createdAt)}</span>
        <p class="admin-msg-body">${escapeHTML(r.message || '')}</p>
      </div>
      <div class="admin-row__actions">
        <button class="btn btn--ghost btn--sm btn--danger" onclick="deleteReview('${r.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}
window.deleteReview = async (id) => {
  if (!confirm('Delete this review permanently?')) return;
  try { await deleteDoc(doc(db, 'reviews', id)); toast('Review deleted'); }
  catch (err) { console.error(err); toast('Delete failed'); }
};

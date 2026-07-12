// ============================================
//  GEODOR FASHION — Live Reviews (Firebase Firestore)
// ============================================
//  Public visitors post reviews; everyone sees them update in real time.
//  Works on static hosting (GitHub Pages) — no server required.
//
//  SETUP (one time):
//    1. Create a free project at https://console.firebase.google.com
//    2. Build → Firestore Database → Create database (Production mode)
//    3. Project settings → Your apps → Web app (</>) → copy the config
//    4. Paste it into firebaseConfig below
//    5. Paste the security rules from REVIEWS_SETUP.md into Firestore → Rules
// ============================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, query,
  orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

// ---- DOM refs ----
const form      = document.getElementById('reviewForm');
const nameEl    = document.getElementById('reviewName');
const msgEl     = document.getElementById('reviewMessage');
const statusEl  = document.getElementById('reviewStatus');
const submitBtn = document.getElementById('reviewSubmitBtn');
const listEl    = document.getElementById('reviewsList');
const emptyEl   = document.getElementById('reviewsEmpty');
const summaryEl = document.getElementById('reviewsSummary');
const starInput = document.getElementById('starInput');

let rating = 0;

// ---- Star picker ----
const starBtns = [...starInput.querySelectorAll('.star-btn')];
const paintStars = val => starBtns.forEach(b =>
  b.classList.toggle('active', Number(b.dataset.value) <= val));

starBtns.forEach(btn => {
  btn.addEventListener('mouseenter', () => paintStars(Number(btn.dataset.value)));
  btn.addEventListener('click', () => { rating = Number(btn.dataset.value); paintStars(rating); });
});
starInput.addEventListener('mouseleave', () => paintStars(rating));

// ---- Helpers ----
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
const starGlyphs = n => '★'.repeat(n) + '☆'.repeat(5 - n);

function timeAgo(date) {
  if (!date) return 'Just now';
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)    return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60)    return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)     return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30)    return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'review-form__status' + (type ? ' ' + type : '');
}

// ---- Guard: not configured yet ----
const isConfigured = !firebaseConfig.apiKey.startsWith('YOUR_');
if (!isConfigured) {
  emptyEl.textContent = 'Reviews go live once Firebase is connected (see js/config.js).';
  form.addEventListener('submit', e => {
    e.preventDefault();
    setStatus('⚠ Connect Firebase first — see the setup steps in js/config.js.', 'err');
  });
  console.warn('[reviews] Firebase not configured — add your config in js/config.js');
} else {
  // ---- Init Firebase (may already be initialized by forms.js) ----
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const reviewsRef = collection(db, 'reviews');

  // ---- Real-time listener: render whenever the collection changes ----
  const q = query(reviewsRef, orderBy('createdAt', 'desc'), limit(100));
  onSnapshot(q, snap => {
    const reviews = snap.docs.map(d => d.data());
    renderSummary(reviews);
    renderList(reviews);
  }, err => {
    console.error('[reviews] listener error:', err);
    emptyEl.textContent = 'Could not load reviews. Please refresh.';
  });

  // ---- Submit a new review ----
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = nameEl.value.trim();
    const message = msgEl.value.trim();

    if (!name)            return setStatus('Please add your name.', 'err');
    if (!rating)          return setStatus('Please pick a star rating.', 'err');
    if (message.length < 3) return setStatus('Please write a short review.', 'err');

    submitBtn.disabled = true;
    setStatus('Posting…');
    try {
      await addDoc(reviewsRef, {
        name: name.slice(0, 40),
        rating,
        message: message.slice(0, 500),
        createdAt: serverTimestamp()
      });
      form.reset();
      rating = 0; paintStars(0);
      setStatus('✓ Thank you — your review is live.', 'ok');
    } catch (err) {
      console.error('[reviews] submit error:', err);
      setStatus('Something went wrong. Please try again.', 'err');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ---- Renderers ----
function renderSummary(reviews) {
  if (!reviews.length) { summaryEl.innerHTML = ''; return; }
  const avg = reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length;
  summaryEl.innerHTML =
    `<span class="rs-score">${avg.toFixed(1)}</span>` +
    `<span class="rs-stars">${starGlyphs(Math.round(avg))}</span>` +
    `<span class="rs-count">${reviews.length} review${reviews.length === 1 ? '' : 's'}</span>`;
}

function renderList(reviews) {
  if (!reviews.length) {
    listEl.innerHTML = '<p class="reviews-empty">Be the first to leave a review.</p>';
    return;
  }
  listEl.innerHTML = reviews.map(r => {
    // serverTimestamp() is null on the writer's optimistic local snapshot
    const date = r.createdAt && typeof r.createdAt.toDate === 'function' ? r.createdAt.toDate() : null;
    return `
      <div class="review-card">
        <div class="review-card__head">
          <strong>${escapeHTML(r.name || 'Anonymous')}</strong>
          <span class="review-card__stars" aria-label="${r.rating} out of 5">${starGlyphs(r.rating || 0)}</span>
        </div>
        <p class="review-card__msg">${escapeHTML(r.message || '')}</p>
        <span class="review-card__time">${timeAgo(date)}</span>
      </div>`;
  }).join('');
}

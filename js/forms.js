// ============================================
//  GEODOR FASHION — Newsletter + Contact forms
//  Submissions are stored in Firestore and appear in the
//  admin panel (admin.html → Messages / Subscribers).
// ============================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function toast(msg) { window.showToast ? window.showToast(msg) : alert(msg); }

// ---- NEWSLETTER ----
window.subscribeNewsletter = async () => {
  const input = document.getElementById('newsletterEmail');
  const email = input.value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) { toast('Please enter a valid email'); return; }

  try {
    // Email doubles as the document ID → automatic de-duplication.
    await setDoc(doc(db, 'newsletter', email), {
      email,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    // "permission denied" here usually means the address already exists
    // (rules forbid overwriting) — treat it as already subscribed.
    console.warn('[forms] newsletter:', err.code || err);
  }
  document.getElementById('newsletterSuccess').style.display = 'block';
  document.querySelector('.newsletter-form').style.display = 'none';
};

// ---- CONTACT ----
window.submitContact = async () => {
  const name = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const subject = document.getElementById('contactSubject').value;
  const message = document.getElementById('contactMessage').value.trim();

  if (!name || !email || !message) { toast('Please fill in all required fields'); return; }
  if (!EMAIL_RE.test(email)) { toast('Please enter a valid email'); return; }
  if (message.length < 3) { toast('Please write a longer message'); return; }

  const btn = document.querySelector('.contact__form .btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    await addDoc(collection(db, 'messages'), {
      name: name.slice(0, 80),
      email: email.slice(0, 120),
      subject: (subject || 'General Inquiry').slice(0, 100),
      message: message.slice(0, 2000),
      read: false,
      createdAt: serverTimestamp()
    });
    document.getElementById('contactSuccess').style.display = 'block';
    ['contactName', 'contactEmail', 'contactMessage'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('contactSubject').value = '';
  } catch (err) {
    console.error('[forms] contact error:', err);
    toast('Could not send — please try again or email us directly.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Message'; }
  }
};

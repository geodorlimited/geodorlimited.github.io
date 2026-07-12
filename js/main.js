// ============================================
//  GEODOR FASHION — Main JS
// ============================================

// ---- CUSTOM CURSOR ----
const cursor = document.getElementById('cursor');
const follower = document.getElementById('cursorFollower');
let mouseX = 0, mouseY = 0, followerX = 0, followerY = 0;

document.addEventListener('mousemove', e => {
  mouseX = e.clientX; mouseY = e.clientY;
  cursor.style.left = mouseX + 'px';
  cursor.style.top = mouseY + 'px';
});

function animateFollower() {
  followerX += (mouseX - followerX) * 0.12;
  followerY += (mouseY - followerY) * 0.12;
  follower.style.left = followerX + 'px';
  follower.style.top = followerY + 'px';
  requestAnimationFrame(animateFollower);
}
animateFollower();

document.querySelectorAll('a, button, .product-card, .collection-card, .size-btn, .color-swatch').forEach(el => {
  el.addEventListener('mouseenter', () => {
    cursor.style.width = '14px'; cursor.style.height = '14px';
    follower.style.width = '48px'; follower.style.height = '48px';
    follower.style.borderColor = 'rgba(201,168,76,.7)';
  });
  el.addEventListener('mouseleave', () => {
    cursor.style.width = '8px'; cursor.style.height = '8px';
    follower.style.width = '32px'; follower.style.height = '32px';
    follower.style.borderColor = 'rgba(201,168,76,.4)';
  });
});

// Hide on mobile
if ('ontouchstart' in window) {
  cursor.style.display = 'none';
  follower.style.display = 'none';
}

// ---- SCROLL: NAV ----
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 60);
});

// ---- SCROLL REVEAL ----
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal-up').forEach(el => revealObserver.observe(el));

// ---- MOBILE MENU ----
function toggleMenu() {
  const menu = document.getElementById('mobileMenu');
  const btn = document.getElementById('menuBtn');
  const isOpen = menu.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

// ---- SEARCH ----
function toggleSearch() {
  document.getElementById('searchOverlay').classList.toggle('open');
  if (document.getElementById('searchOverlay').classList.contains('open')) {
    setTimeout(() => document.querySelector('.search-input')?.focus(), 100);
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('searchOverlay')?.classList.remove('open');
    window.closeModal?.(); // defined on the shop page
  }
});

// On pages without a product grid, pressing Enter in search jumps to the shop
document.querySelector('.search-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('productsGrid')) {
    const q = e.target.value.trim();
    window.location.href = 'shop.html' + (q ? `?q=${encodeURIComponent(q)}` : '');
  }
});

// ---- LOOKBOOK DRAG SCROLL ----
const lookbookScroll = document.querySelector('.lookbook__scroll');
if (lookbookScroll) {
  let isDown = false, startX, scrollLeft;
  lookbookScroll.addEventListener('mousedown', e => {
    isDown = true; startX = e.pageX - lookbookScroll.offsetLeft;
    scrollLeft = lookbookScroll.scrollLeft;
  });
  lookbookScroll.addEventListener('mouseleave', () => isDown = false);
  lookbookScroll.addEventListener('mouseup', () => isDown = false);
  lookbookScroll.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - lookbookScroll.offsetLeft;
    const walk = (x - startX) * 2;
    lookbookScroll.scrollLeft = scrollLeft - walk;
  });
}

// ---- SMOOTH ANCHOR SCROLL ----
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ---- TOAST ----
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 3000);
}
window.showToast = showToast;

// ---- CART COUNT (shared across pages via localStorage) ----
(function () {
  const countEl = document.getElementById('cartCount');
  if (!countEl) return;
  try {
    const cart = JSON.parse(localStorage.getItem('geodor_cart') || '[]');
    const total = cart.reduce((sum, i) => sum + (i.qty || 0), 0);
    countEl.textContent = total;
    countEl.classList.toggle('show', total > 0);
  } catch { /* ignore corrupt cart */ }
})();

// ---- PARALLAX HERO (subtle) ----
window.addEventListener('scroll', () => {
  const hero = document.querySelector('.hero__bg');
  if (hero) {
    const scrolled = window.pageYOffset;
    hero.style.transform = `translateY(${scrolled * 0.3}px)`;
  }
});

// ---- SECTION ANIMATION ON SCROLL ----
const sections = document.querySelectorAll('section');
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
    }
  });
}, { threshold: 0.05 });
sections.forEach(s => sectionObserver.observe(s));

console.log(
  '%cGEODOR FASHION\n%cBuilt with precision. Wear your world.',
  'font-size:24px;font-weight:bold;color:#c9a84c;font-family:serif',
  'font-size:12px;color:#888'
);

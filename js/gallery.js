// ============================================
//  GEODOR FASHION — Gallery, Lightbox & Film
//  Any element with [data-full] opens in the lightbox.
//  Items are grouped by the nearest [data-gallery] ancestor,
//  so arrows only cycle within the same set.
// ============================================
(function () {
  const items = Array.from(document.querySelectorAll('[data-full]'));
  if (items.length) initLightbox(items);
  initReel();

  function initLightbox(all) {
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Image viewer');
    box.innerHTML = `
      <span class="lightbox__count" aria-hidden="true"></span>
      <button class="lightbox__btn lightbox__close" aria-label="Close">✕</button>
      <button class="lightbox__btn lightbox__prev" aria-label="Previous image">←</button>
      <figure class="lightbox__figure">
        <img class="lightbox__img" alt="" />
        <figcaption class="lightbox__cap"></figcaption>
      </figure>
      <button class="lightbox__btn lightbox__next" aria-label="Next image">→</button>`;
    document.body.appendChild(box);

    const img = box.querySelector('.lightbox__img');
    const cap = box.querySelector('.lightbox__cap');
    const count = box.querySelector('.lightbox__count');
    const prevBtn = box.querySelector('.lightbox__prev');
    const nextBtn = box.querySelector('.lightbox__next');
    let set = [], idx = 0, lastFocus = null;

    const groupOf = el => el.closest('[data-gallery]')?.dataset.gallery || 'default';
    const pad = n => String(n).padStart(2, '0');

    function show(i) {
      idx = (i + set.length) % set.length;
      const el = set[idx];
      const label = el.dataset.title || '';
      const text = el.dataset.caption || el.querySelector('img')?.alt || '';
      img.classList.add('loading');
      const pre = new Image();
      pre.onload = () => { img.src = pre.src; img.alt = text; img.classList.remove('loading'); };
      pre.src = el.dataset.full;
      cap.innerHTML = '';
      if (label) { const b = document.createElement('i'); b.textContent = label; cap.appendChild(b); }
      cap.appendChild(document.createTextNode(text));
      count.textContent = `${pad(idx + 1)} / ${pad(set.length)}`;
      const multi = set.length > 1;
      prevBtn.style.display = nextBtn.style.display = multi ? '' : 'none';
      count.style.display = multi ? '' : 'none';
      // warm the cache for the neighbours
      if (multi) [idx + 1, idx - 1].forEach(n => { new Image().src = set[(n + set.length) % set.length].dataset.full; });
    }

    function open(el) {
      const g = groupOf(el);
      set = all.filter(x => groupOf(x) === g);
      lastFocus = document.activeElement;
      show(set.indexOf(el));
      box.classList.add('open');
      document.body.style.overflow = 'hidden';
      box.querySelector('.lightbox__close').focus();
    }
    function close() {
      box.classList.remove('open');
      document.body.style.overflow = '';
      lastFocus?.focus();
    }

    all.forEach(el => {
      if (!el.matches('button, a')) { el.tabIndex = 0; el.setAttribute('role', 'button'); }
      el.addEventListener('click', () => open(el));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el); }
      });
    });

    prevBtn.addEventListener('click', () => show(idx - 1));
    nextBtn.addEventListener('click', () => show(idx + 1));
    box.querySelector('.lightbox__close').addEventListener('click', close);
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.addEventListener('keydown', e => {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') show(idx + 1);
      if (e.key === 'ArrowLeft') show(idx - 1);
    });

    // swipe on touch screens
    let sx = null;
    box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50 && set.length > 1) show(idx + (dx < 0 ? 1 : -1));
      sx = null;
    });
  }

  function initReel() {
    const reel = document.querySelector('.ex-reel');
    if (!reel) return;
    const video = reel.querySelector('video');
    const btn = reel.querySelector('.ex-reel__sound');
    const label = btn?.querySelector('.ex-reel__sound-label');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    btn?.addEventListener('click', () => {
      video.muted = !video.muted;
      if (!video.muted) video.play().catch(() => {});
      btn.classList.toggle('on', !video.muted);
      btn.setAttribute('aria-pressed', String(!video.muted));
      if (label) label.textContent = video.muted ? 'Sound off' : 'Sound on';
    });

    // Only play while on screen; respect reduced-motion users (they can still press play via controls)
    if (reduce) { video.removeAttribute('autoplay'); video.pause(); video.controls = true; return; }
    new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      });
    }, { threshold: 0.25 }).observe(video);
  }
})();

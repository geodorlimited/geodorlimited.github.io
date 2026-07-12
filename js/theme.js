// ============================================
//  GEODOR FASHION — Day / Night theme
//  Loaded in <head> of every page so the saved theme applies
//  before first paint (no flash). Night is the default look;
//  the toggle stores the visitor's choice in their browser.
// ============================================
(function () {
  var saved = null;
  try { saved = localStorage.getItem('geodor_theme'); } catch (e) { /* private mode */ }
  var theme = (saved === 'light' || saved === 'dark') ? saved : 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  function paintButtons() {
    var t = document.documentElement.getAttribute('data-theme');
    var btns = document.querySelectorAll('.btn-theme');
    for (var i = 0; i < btns.length; i++) {
      btns[i].textContent = t === 'dark' ? '☀' : '☾';
      btns[i].setAttribute('aria-label', t === 'dark' ? 'Switch to day mode' : 'Switch to night mode');
      btns[i].title = t === 'dark' ? 'Day mode' : 'Night mode';
    }
  }

  window.toggleTheme = function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('geodor_theme', next); } catch (e) { /* ignore */ }
    paintButtons();
  };

  document.addEventListener('DOMContentLoaded', paintButtons);
})();

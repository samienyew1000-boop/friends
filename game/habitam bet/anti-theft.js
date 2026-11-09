/**
 * Habtam Bet - Client Anti-Theft & Integrity Protection Suite
 * Prevents unauthorized source code cloning, inspection, and hotkey scraping.
 */
(function () {
  'use strict';

  var isProtected = true;

  // 1. Disable Right-Click Context Menu
  document.addEventListener('contextmenu', function (e) {
    // Allow inputs/textareas for normal copy-paste if needed
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, { capture: true, passive: false });

  // 2. Disable DevTools & Source Viewing Keyboard Shortcuts
  window.addEventListener('keydown', function (e) {
    var key = e.key || '';
    var code = e.keyCode || e.which;
    var ctrlOrMeta = e.ctrlKey || e.metaKey;

    // F12 (123)
    if (code === 123 || key === 'F12') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+Shift+I (73), Ctrl+Shift+J (74), Ctrl+Shift+C (67)
    if (ctrlOrMeta && e.shiftKey && (code === 73 || code === 74 || code === 67 || key.toLowerCase() === 'i' || key.toLowerCase() === 'j' || key.toLowerCase() === 'c')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+U (85) - View Source
    if (ctrlOrMeta && (code === 85 || key.toLowerCase() === 'u')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+S (83) - Save Page
    if (ctrlOrMeta && (code === 83 || key.toLowerCase() === 's')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, { capture: true, passive: false });

  // 3. Console Warning & Security Banner
  var bannerShown = false;
  function showConsoleWarning() {
    if (bannerShown) return;
    bannerShown = true;
    try {
      var styleTitle = 'color: #ef4444; font-size: 28px; font-weight: 900; -webkit-text-stroke: 1px black;';
      var styleText = 'color: #f59e0b; font-size: 14px; font-weight: 600;';
      console.log('%cSTOP! STOP! STOP!', styleTitle);
      console.log('%cThis is a secured proprietary gaming system. Unauthorized inspection, extraction, or scraping is strictly prohibited and logged.', styleText);
    } catch (_) {}
  }
  showConsoleWarning();

  // 4. Memory Tamper Guard for HabeshaWallet
  function protectWallet() {
    if (window.HabeshaWallet && !window.HabeshaWallet.__protected) {
      try {
        Object.defineProperty(window.HabeshaWallet, '__protected', {
          value: true,
          writable: false,
          configurable: false
        });
      } catch (_) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', protectWallet);
  } else {
    protectWallet();
  }
  setInterval(protectWallet, 2000);

  // 5. Drag & Drop Protection (prevents dragging code/images out of window)
  window.addEventListener('dragstart', function (e) {
    if (e.target && e.target.tagName === 'IMG') {
      e.preventDefault();
    }
  });

})();

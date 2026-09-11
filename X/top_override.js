// Prevent WhatsApp Web from detecting it is in an iframe
try {
  Object.defineProperty(window, 'top', {
    get: function () { return window.self; },
    configurable: true
  });
} catch (e) {}

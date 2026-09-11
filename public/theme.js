/**
 * Applies the stored colour theme before first paint.
 *
 * Loaded synchronously from <head>. Dark is the default; an explicit choice in
 * localStorage wins, otherwise the OS preference decides.
 */
(function () {
  try {
    var stored = localStorage.getItem('tz-theme');
    var prefersLight =
      stored === 'light' ||
      (stored === null && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.classList.toggle('dark', !prefersLight);
  } catch {
    /* storage unavailable — keep the default dark theme */
  }
})();

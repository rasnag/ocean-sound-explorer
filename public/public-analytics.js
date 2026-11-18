(() => {
  const publicPages = new Set(['/', '/about', '/activities/octopus-camouflage']);
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (window.location.hostname !== 'curiosityloop.me' || !publicPages.has(path)) return;

  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
  window.va('beforeSend', (event) => {
    const url = new URL(event.url, window.location.origin);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.href };
  });

  const script = document.createElement('script');
  script.src = '/_vercel/insights/script.js';
  document.head.append(script);
})();

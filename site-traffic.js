(() => {
  'use strict';

  // First-party, anonymous aggregate page-view and outbound-action counters.
  // No cookies, visitor IDs, IP addresses, full URLs, or form data are sent.
  function sourceFromVisit(search, referrer) {
    const params = new URLSearchParams(search);
    const src = (params.get('utm_source') || '').trim().toLowerCase();
    const medium = (params.get('utm_medium') || '').trim().toLowerCase();
    const campaign = (params.get('utm_campaign') || '').trim().toLowerCase();
    if (['2gis', '2-gis', '2_gis'].includes(src)) return '2gis';
    if (['yandex_maps', 'yandex-maps', 'yandexmaps'].includes(src) ||
        (src === 'yandex' && (medium === 'maps' || campaign.includes('maps')))) return 'yandex_maps';
    if (['google_maps', 'google-maps', 'googlemaps'].includes(src) ||
        (src === 'google' && (medium === 'maps' || campaign.includes('maps')))) return 'google_maps';
    if (['instagram', 'ig'].includes(src)) return 'instagram';
    // Explicit campaigns other than the mapped three must not be misattributed.
    if (src) return 'other';

    if (!referrer) return 'direct';
    try {
      const url = new URL(referrer);
      if (!['https:', 'http:'].includes(url.protocol)) return 'other';
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (host === '2gis.ru' || host.endsWith('.2gis.ru') ||
          host === '2gis.com' || host.endsWith('.2gis.com') ||
          host === '2gis.kz' || host.endsWith('.2gis.kz')) return '2gis';
      if ((host.startsWith('maps.yandex.') || host.startsWith('yandex.')) ||
          ((host === 'yandex.ru' || host.endsWith('.yandex.ru')) && url.pathname.startsWith('/maps'))) return 'yandex_maps';
      // Google search can provide only google.com as referrer: do not count as Maps.
      if (host.startsWith('maps.google.') ||
          (/(^|\.)google\.[a-z.]+$/.test(host) && url.pathname.startsWith('/maps'))) return 'google_maps';
      if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
      if (host === location.hostname || host.endsWith('.' + location.hostname)) return 'direct';
      return 'other';
    } catch { return 'other'; }
  }

  const source = sourceFromVisit(location.search, document.referrer);
  const labels = { '2gis': '2ГИС', yandex_maps: 'Яндекс Карты', google_maps: 'Google Карты',
    instagram: 'Instagram', direct: 'Прямой переход', other: 'Другой источник' };
  const allowed = new Set(['visit', 'dikidi_click', 'telegram_click', 'instagram_click', 'questionnaire_copy']);

  function track(action) {
    if (!allowed.has(action)) return;
    // Analytics must never interrupt navigation if the API is unreachable.
    try {
      void fetch('/api/site/event', {
        method: 'POST', mode: 'same-origin', credentials: 'omit', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, action })
      }).catch(() => {});
    } catch { /* Optional analytics */ }
  }

  window.SITE_TRAFFIC = Object.freeze({ source, sourceLabel: labels[source], track });
  track('visit');
})();

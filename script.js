(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const config = window.SITE_CONFIG || {};
  const toast = $('#toast');
  let toastTimer;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
  }

  // Мобильное меню. Закрывается по выбору раздела, Escape и изменению ширины.
  const menuButton = $('.menu-toggle');
  const mobileNav = $('#mobile-nav');
  function setMenu(open) {
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    mobileNav.hidden = !open;
  }
  menuButton?.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
  $$('#mobile-nav a').forEach((anchor) => anchor.addEventListener('click', () => setMenu(false)));
  window.addEventListener('resize', () => { if (innerWidth > 850) setMenu(false); });

  // Плавное проявление без зависимости от библиотек.
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries, self) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) { target.classList.add('visible'); self.unobserve(target); }
      });
    }, { threshold: .06, rootMargin: '0px 0px 30px 0px' });
    $$('.reveal').forEach(el => observer.observe(el));
    document.documentElement.classList.add('js-ready');
  }

  // Фильтрация без сетевого запроса, показ дополнительных работ.
  const allItems = $$('.gallery-item');
  const filters = $$('.filter');
  const showMore = $('#show-more');
  let currentFilter = 'all';
  let expanded = false;
  function visibleGalleryItems() { return allItems.filter(item => !item.classList.contains('is-hidden')); }
  function updateGallery() {
    allItems.forEach((item, index) => {
      const categoryMatch = currentFilter === 'all' || item.dataset.category.split(' ').includes(currentFilter);
      const firstEight = currentFilter !== 'all' || expanded || index < 8;
      item.classList.toggle('is-hidden', !categoryMatch || !firstEight);
      item.classList.toggle('expanded', expanded || currentFilter !== 'all');
    });
    showMore.hidden = currentFilter !== 'all' || expanded;
  }
  filters.forEach((button) => button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    filters.forEach(filter => {
      const isActive = filter === button;
      filter.classList.toggle('active', isActive);
      filter.setAttribute('aria-pressed', String(isActive));
    });
    updateGallery();
  }));
  showMore?.addEventListener('click', () => { expanded = true; updateGallery(); showToast('Все 12 работ открыты'); });
  updateGallery();

  // Галерея с диалогом, клавиатурной навигацией и возвратом фокуса.
  const dialog = $('#lightbox');
  const lightboxImage = $('#lightbox-image');
  const lightboxTitle = $('#lightbox-title');
  const lightboxIndex = $('#lightbox-index');
  let activeImage = 0;
  let lastTrigger = null;
  function renderLightbox() {
    const items = visibleGalleryItems();
    if (!items.length) return;
    activeImage = (activeImage + items.length) % items.length;
    const current = items[activeImage];
    lightboxImage.src = current.dataset.full;
    lightboxImage.alt = $('img', current).alt;
    lightboxTitle.textContent = current.dataset.title;
    lightboxIndex.textContent = `${activeImage + 1} / ${items.length}`;
  }
  function navigateLightbox(delta) { activeImage += delta; renderLightbox(); }
  allItems.forEach(item => item.addEventListener('click', () => {
    lastTrigger = item;
    activeImage = visibleGalleryItems().indexOf(item);
    renderLightbox();
    if (dialog?.showModal) { dialog.showModal(); document.body.classList.add('no-scroll'); }
  }));
  $('.lightbox-close')?.addEventListener('click', () => dialog.close());
  $('.lightbox-arrow.prev')?.addEventListener('click', () => navigateLightbox(-1));
  $('.lightbox-arrow.next')?.addEventListener('click', () => navigateLightbox(1));
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog?.addEventListener('close', () => { document.body.classList.remove('no-scroll'); lastTrigger?.focus({ preventScroll: true }); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobileNav && !mobileNav.hidden) setMenu(false);
    if (!dialog?.open) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); navigateLightbox(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); navigateLightbox(-1); }
  });

  // Контакты добавляются только из явно заполненного config.js.
  const contactsContainer = $('#contact-links');
  const phone = String(config.phone || '').replace(/\D/g, '');
  const instagram = String(config.instagram || '').trim();
  const telegram = String(config.telegram || '').replace(/^@/, '').trim();
  const address = String(config.address || '').trim();
  const validInstagram = /^https:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._/]+\/?(?:\?.*)?$/.test(instagram);
  const validTelegram = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(telegram);
  function contactLink(label, url) {
    const link = document.createElement('a');
    link.className = 'contact-chip'; link.textContent = `${label} ↗`;
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    contactsContainer.appendChild(link);
  }
  if (phone.length >= 10 && phone.length <= 15) contactLink('WhatsApp', `https://wa.me/${phone}`);
  if (validTelegram) contactLink('Telegram', `https://t.me/${telegram}`);
  if (validInstagram) contactLink('Instagram', instagram);
  if (address) {
    const addressLine = document.createElement('p');
    addressLine.className = 'contact-pending';
    addressLine.textContent = `Адрес: ${address}`;
    contactsContainer.appendChild(addressLine);
  }
  if (!contactsContainer.children.length) {
    const note = document.createElement('p'); note.className = 'contact-pending';
    note.textContent = 'Контакты и адрес мастера будут указаны после согласования. Пока можно подготовить текст обращения ниже.';
    contactsContainer.appendChild(note);
  }

  // Нет сервера, сбора персональных данных или фиктивной "отправки".
  // С реальным WhatsApp сообщение откроется в мессенджере, без него — копируется.
  const form = $('#booking-form');
  const feedback = $('#form-feedback');
  const formHelp = $('#form-help');
  if (phone.length >= 10 && phone.length <= 15) {
    $('#form-button-text').textContent = 'Перейти в WhatsApp';
    formHelp.textContent = 'Откроем WhatsApp с готовым сообщением. Отправка произойдёт только после вашего подтверждения в мессенджере.';
  }
  async function copyToClipboard(value) {
    try { await navigator.clipboard.writeText(value); return true; }
    catch {
      const temp = document.createElement('textarea');
      temp.value = value; temp.style.position = 'fixed'; temp.style.opacity = '0';
      document.body.appendChild(temp); temp.select();
      const ok = document.execCommand('copy'); temp.remove(); return ok;
    }
  }
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('#client-name');
    const service = $('#client-service');
    name.removeAttribute('aria-invalid'); service.removeAttribute('aria-invalid');
    if (!name.value.trim()) { name.setAttribute('aria-invalid', 'true'); name.focus(); showToast('Укажите ваше имя'); return; }
    if (!service.value) { service.setAttribute('aria-invalid', 'true'); service.focus(); showToast('Выберите услугу'); return; }
    const note = $('#client-comment').value.trim();
    const message = `Здравствуйте, Альбина! Меня зовут ${name.value.trim()}.\nХочу записаться: ${service.value}.${note ? `\nМои пожелания: ${note}` : ''}\nПодскажите, пожалуйста, свободное время.`;
    feedback.hidden = false;
    feedback.textContent = message;
    if (phone.length >= 10 && phone.length <= 15) {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      showToast('Открываем WhatsApp с текстом записи');
    } else {
      const copied = await copyToClipboard(message);
      showToast(copied ? 'Текст скопирован — можно отправить мастеру' : 'Текст готов — скопируйте его из блока');
    }
  });

  // Instagram Reels появляются только при добавлении реальных ссылок в config.js.
  // Внешний iframe загружается по нажатию, а не при открытии страницы.
  const reels = Array.isArray(config.reels) ? config.reels : [];
  const reelsSection = $('#reels');
  const reelsGrid = $('#reels-grid');
  const reelDialog = $('#reel-dialog');
  const reelContainer = $('#reel-frame-container');
  const reelInstagramLink = $('#reel-instagram-link');
  const parseReel = (value) => {
    const match = String(value || '').match(/^https:\/\/(?:www\.)?instagram\.com\/reel\/([A-Za-z0-9_-]+)\/?(?:\?.*)?$/);
    return match ? match[1] : null;
  };
  reels.slice(0, 6).forEach((reel, index) => {
    const code = parseReel(reel?.url);
    if (!code) return;
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'reel-card'; button.setAttribute('aria-label', `Смотреть видеоработу ${index + 1}`);
    const cover = /^assets\/images\/work-\d{2}\.webp$/.test(String(reel.cover || '')) ? reel.cover : 'assets/images/work-01.webp';
    const img = document.createElement('img'); img.src = cover; img.alt = `Превью видеоработы ${index + 1}`; img.loading = 'lazy';
    const text = document.createElement('span'); text.className = 'reel-card-text';
    const description = document.createElement('span'); description.textContent = `REEL ${String(index + 1).padStart(2, '0')}`;
    const play = document.createElement('span'); play.textContent = '▶'; play.setAttribute('aria-hidden', 'true');
    text.append(description, play); button.append(img, text); reelsGrid.appendChild(button);
    button.addEventListener('click', () => {
      const iframe = document.createElement('iframe'); iframe.title = `Instagram Reel ${index + 1}`;
      iframe.loading = 'eager'; iframe.allow = 'fullscreen; encrypted-media; picture-in-picture';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.src = `https://www.instagram.com/reel/${code}/embed/`;
      reelContainer.replaceChildren(iframe);
      reelInstagramLink.href = `https://www.instagram.com/reel/${code}/`;
      reelDialog.showModal(); document.body.classList.add('no-scroll');
    });
  });
  if (reelsGrid.children.length) reelsSection.hidden = false;
  $('.reel-close')?.addEventListener('click', () => reelDialog.close());
  reelDialog?.addEventListener('close', () => { reelContainer.replaceChildren(); document.body.classList.remove('no-scroll'); });

  $('#year').textContent = new Date().getFullYear();
})();

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const providers = [
    {id:'instagram', name:'Instagram', icon:'IG', type:'OAuth / Meta', description:'Сообщения и обращения из профессионального аккаунта.',
      note:'Для Instagram Business или Creator. Альбина входит на официальной странице Instagram и подтверждает доступ нашему приложению.'},
    {id:'whatsapp', name:'WhatsApp Business', icon:'WA', type:'Meta Embedded Signup', description:'Входящие сообщения WhatsApp Business Platform.',
      note:'Подключение через Meta Business. Нужен бизнес-аккаунт WhatsApp и разрешения на API. Обычный личный WhatsApp нельзя незаметно читать через этот интерфейс.'},
    {id:'telegram', name:'Telegram', icon:'TG', type:'Бот / Bot API', description:'Обращения, уведомления и управление базой клиентов через бота.',
      note:'Telegram Login не даёт права читать личные переписки. Для обращений создаём отдельного бота и направляем клиентов в него.'},
    {id:'google', name:'Google Business', icon:'G', type:'Google OAuth', description:'Доступ к карточке компании и отзывам, если Google разрешил API.',
      note:'После входа через Google могут потребоваться одобрение доступа к Business Profile API и настройка конкретных филиалов.'},
    {id:'yandex', name:'Яндекс Бизнес', icon:'Я', type:'Кабинет / API', description:'Карточка компании, отзывы и обращения из Яндекс.',
      note:'Открывается официальный кабинет. Сам по себе вход не даёт нашему серверу доступа к сообщениям: возможности API уточняются для нужного типа обращений.'},
    {id:'2gis', name:'2ГИС', icon:'2Г', type:'Кабинет компании', description:'Отзывы и обращения из карточки в 2ГИС.',
      note:'Можно войти в личный кабинет 2ГИС без передачи пароля. Автоматическая передача данных в нашу систему требует отдельного разрешённого способа интеграции.'},
    {id:'dikidi', name:'DIKIDI Business', icon:'DI', type:'API-ключ', description:'Записи на услуги и клиентская история из DIKIDI.',
      note:'Войдите в DIKIDI на официальном сайте. В разделе «Настройки → Интеграция → Доступ к API» создайте отдельный ключ. Вводите его только в этой защищённой панели, а не в чате.'}
  ];
  let statuses = {};
  let selected = null;
  let metaCode = null;
  let metaAssets = null;
  let metaSubmitting = false;

  function showPage(id) {
    ['login','dashboard','unavailable'].forEach(section => $(section).hidden = section !== id);
    $('logout').hidden = id !== 'dashboard';
  }
  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка сервера (' + res.status + ')');
    return data;
  }
  async function boot() {
    try {
      const session = await api('/api/admin/session');
      if (!session.authenticated) return showPage('login');
      showPage('dashboard');
      await refresh();
    } catch {
      showPage('unavailable');
    }
  }
  async function refresh() {
    const data = await api('/api/integrations/status');
    statuses = data.providers || {};
    renderCards();
    const authorized = providers.filter(p => statuses[p.id]?.state === 'authorized').length;
    $('authorized-count').textContent = String(authorized);
    $('pending-count').textContent = String(providers.length - authorized);
  }
  function stateInfo(id) {
    const state = statuses[id]?.state;
    if (state === 'authorized') return {text:'Авторизовано', className:'authorized'};
    if (state === 'key_saved_unverified') return {text:'Ключ сохранён · не проверен', className:'key_saved_unverified'};
    return {text:'Не подключено', className:'not_connected'};
  }
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function renderCards() {
    const target = $('service-cards');
    target.replaceChildren();
    providers.forEach(p => {
      const card = el('article','service-card');
      const top = el('div','card-top');
      const icon = el('div','service-icon',p.icon);
      icon.setAttribute('aria-hidden','true');
      const state = stateInfo(p.id);
      top.append(icon,el('span','status '+state.className,state.text));
      const title = el('h3','',p.name);
      const description = el('p','',p.description);
      const bottom = el('div','card-bottom');
      bottom.append(el('span','',p.type));
      const button = el('button','','Управлять');
      button.type = 'button';
      button.setAttribute('aria-label','Управлять подключением '+p.name);
      button.addEventListener('click',() => openProvider(p.id));
      bottom.append(button);
      card.append(top,title,description,bottom);
      target.append(card);
    });
  }
  function feedback(text, error = false) {
    const target = $('dialog-feedback');
    target.textContent = text;
    target.classList.toggle('error', error);
  }
  function actionButton(text, handler, secondary = false) {
    const button = el('button','button '+(secondary ? 'secondary' : 'primary'),text);
    button.type = 'button';
    button.addEventListener('click',handler);
    return button;
  }
  function actionLink(text, url) {
    const a = el('a','button secondary',text);
    a.href = url;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    return a;
  }
  function setActions(...actions) {
    const actionsNode = el('div','action-grid');
    actions.forEach(a => actionsNode.append(a));
    $('dialog-actions').replaceChildren(actionsNode);
  }
  function openPopup(url) {
    const popup = window.open(url, 'albina_authorization', 'popup,width=640,height=780,scrollbars=yes,resizable=yes');
    if (!popup) feedback('Разрешите всплывающие окна или откройте ссылку авторизации в браузере.',true);
    else popup.focus();
  }
  function openProvider(id) {
    selected = providers.find(p => p.id === id);
    if (!selected) return;
    const p = selected;
    $('dialog-icon').textContent = p.icon;
    $('dialog-title').textContent = p.name;
    $('dialog-description').textContent = p.description;
    $('dialog-note').textContent = p.note;
    $('dialog-actions').replaceChildren();
    $('disconnect').hidden = !['authorized','key_saved_unverified'].includes(statuses[p.id]?.state);
    feedback('');
    if (p.id === 'instagram' || p.id === 'google') {
      setActions(actionButton('Авторизоваться через '+(p.id === 'google'?'Google':'Instagram'),
        () => openPopup('/api/integrations/'+p.id+'/start')));
      if (!statuses[p.id]?.configured) feedback('Для запуска OAuth сначала настройте приложение разработчика на сервере.');
    } else if (p.id === 'whatsapp') {
      setActions(actionButton('Продолжить через Meta',startMetaSignup));
      if (!statuses.whatsapp?.configured) feedback('Для подключения нужны Meta App ID, App Secret и Configuration ID Embedded Signup v4 на сервере.');
    } else if (p.id === 'dikidi') {
      const form = el('form','');
      const label1 = el('label','field-label','ID проекта DIKIDI (необязательно)');
      label1.htmlFor = 'dikidi-company';
      const companyInput = el('input','field-input');
      companyInput.type = 'text'; companyInput.id = 'dikidi-company'; companyInput.maxLength = 100; companyInput.autocomplete = 'off'; companyInput.placeholder = 'Номер проекта';
      const label2 = el('label','field-label','API-ключ, созданный внутри DIKIDI');
      label2.htmlFor = 'dikidi-api-key';
      const keyInput = el('input','field-input');
      keyInput.type = 'password'; keyInput.id = 'dikidi-api-key'; keyInput.autocomplete = 'off';
      keyInput.required = true; keyInput.minLength = 12; keyInput.maxLength = 512; keyInput.placeholder = 'Вставьте ключ API, НЕ пароль';
      const hint = el('p','field-help','Ключ будет зашифрован на сервере. Пока API не проверен, статус останется «Ключ сохранён · не проверен».');
      const submit = actionButton('Сохранить API-ключ', () => {});
      submit.type = 'submit';
      form.addEventListener('submit',async event => {
        event.preventDefault();
        submit.disabled = true; feedback('Сохраняем ключ…');
        try {
          await api('/api/integrations/dikidi/key',{
            method:'POST', body:JSON.stringify({apiKey:keyInput.value,companyId:companyInput.value})
          });
          keyInput.value='';
          feedback('Ключ сохранён в зашифрованном хранилище. Доступ к DIKIDI пока не проверен.');
          await refresh(); $('disconnect').hidden = false;
        } catch(error) { feedback(error.message,true); }
        finally { submit.disabled=false; }
      });
      form.append(label1,companyInput,label2,keyInput,hint,submit);
      $('dialog-actions').append(actionLink('Открыть DIKIDI Business','https://dikidi.net/ru/business'),form);
    } else if (p.id === 'telegram') {
      setActions(actionLink('Создать отдельного бота через BotFather','https://t.me/BotFather'));
      feedback('После создания бота потребуется серверный Bot API webhook и проверка владения. Личные диалоги Telegram не импортируются.');
    } else if (p.id === 'yandex') {
      setActions(actionLink('Войти в Яндекс Бизнес','https://business.yandex.ru/'));
      feedback('Этот вход откроет только кабинет Яндекса. Подключение к нашей базе пока не подтверждено.');
    } else if (p.id === '2gis') {
      setActions(actionLink('Войти в кабинет 2ГИС','https://account.2gis.com/'));
      feedback('Этот вход откроет только кабинет 2ГИС. Подключение к нашей базе пока не подтверждено.');
    }
    const dialog = $('service-dialog');
    if (!dialog.open) dialog.showModal();
  }
  async function disconnect() {
    if (!selected || !confirm('Удалить сохранённый доступ для '+selected.name+'? Не забудьте отозвать доступ и в самом сервисе.')) return;
    try {
      await api('/api/integrations/'+selected.id,{method:'DELETE'});
      feedback('Сохранённый доступ удалён. При необходимости также отзовите разрешение в сервисе.');
      $('disconnect').hidden = true;
      await refresh();
    } catch(error) { feedback(error.message,true); }
  }

  async function loadMetaSdk(appId) {
    if (window.FB) return;
    await new Promise((resolve,reject) => {
      const existing = document.querySelector('script[data-meta-sdk]');
      if (existing) { reject(new Error('Meta SDK ещё загружается. Повторите попытку.')); return; }
      window.fbAsyncInit = () => {
        window.FB.init({appId,autoLogAppEvents:false,xfbml:false,version:'v25.0'});
        resolve();
      };
      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true; script.defer = true; script.crossOrigin = 'anonymous';
      script.dataset.metaSdk = '1'; script.onerror = () => reject(new Error('Не удалось загрузить Meta SDK'));
      document.head.appendChild(script);
    });
  }
  async function completeMetaWhenReady() {
    if (!metaCode || !metaAssets || metaSubmitting) return;
    metaSubmitting = true;
    feedback('Проверяем бизнес-аккаунт WhatsApp через Meta…');
    try {
      await api('/api/integrations/whatsapp/complete',{
        method:'POST', body:JSON.stringify({code:metaCode,wabaId:metaAssets.wabaId,phoneId:metaAssets.phoneId})
      });
      feedback('WhatsApp Business авторизован. Для поступления заявок ещё нужна настройка вебхуков.');
      await refresh();
      $('disconnect').hidden = false;
    } catch(error) { feedback(error.message,true); }
    finally { metaCode = null; metaAssets = null; metaSubmitting = false; }
  }
  window.addEventListener('message',event => {
    if (!['https://www.facebook.com','https://web.facebook.com','https://business.facebook.com'].includes(event.origin)) return;
    let body;
    try { body = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
    catch { return; }
    if (body?.type !== 'WA_EMBEDDED_SIGNUP') return;
    if (body.event === 'FINISH' && body.data) {
      const wabaId = String(body.data.waba_id || '');
      const phoneId = String(body.data.phone_number_id || '');
      if (/^\d+$/.test(wabaId) && /^\d+$/.test(phoneId)) {
        metaAssets = {wabaId,phoneId};
        void completeMetaWhenReady();
      }
    } else if (body.event === 'CANCEL' || body.event === 'ERROR') {
      feedback('Регистрация в Meta не завершена.',true);
    }
  });
  async function startMetaSignup() {
    try {
      const config = await api('/api/integrations/meta-config');
      if (!config.configured || !config.appId || !config.configurationId) {
        return feedback('Meta Embedded Signup пока не настроен на сервере.',true);
      }
      metaCode = null; metaAssets = null; metaSubmitting = false;
      await loadMetaSdk(config.appId);
      window.FB.login(response => {
        const code = response?.authResponse?.code;
        if (!code) return feedback('Meta не предоставила код авторизации. Повторите подключение.',true);
        metaCode = code;
        feedback('Авторизация Meta выполнена. Ожидаем сведения о WhatsApp Business...');
        void completeMetaWhenReady();
      },{config_id:config.configurationId,response_type:'code',override_default_response_type:true,
        extras:{setup:{}}});
    } catch(error) { feedback(error.message,true); }
  }

  window.addEventListener('message',event => {
    if (event.origin !== location.origin || event.data?.type !== 'albina-integration-result') return;
    if (!providers.some(p => p.id === event.data.provider)) return;
    feedback(event.data.ok ? 'Авторизация завершена. Сбор заявок настраивается отдельно.' :
      (event.data.message || 'Не удалось авторизоваться'), !event.data.ok);
    void refresh().then(() => {
      $('disconnect').hidden = !['authorized','key_saved_unverified'].includes(statuses[selected?.id]?.state);
    }).catch(()=>{});
  });

  $('login-form').addEventListener('submit',async event => {
    event.preventDefault();
    $('login-error').textContent='';
    const passwordInput = $('admin-password');
    try {
      await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:passwordInput.value})});
      passwordInput.value='';
      showPage('dashboard');
      await refresh();
    } catch(error) { $('login-error').textContent=error.message; }
  });
  $('logout').addEventListener('click',async () => {
    try { await api('/api/admin/logout',{method:'POST',body:'{}'}); } catch {}
    statuses={};showPage('login');
  });
  $('refresh').addEventListener('click',() => void refresh().catch(error => alert(error.message)));
  $('retry').addEventListener('click',() => void boot());
  $('close-dialog').addEventListener('click',() => $('service-dialog').close());
  $('service-dialog').addEventListener('click',event => {
    if (event.target === $('service-dialog')) $('service-dialog').close();
  });
  $('disconnect').addEventListener('click',() => void disconnect());
  void boot();
})();
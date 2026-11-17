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
  const guides = {
  "instagram": {
    "title": "Как подключить Instagram",
    "steps": [
      "Откройте свой Instagram и убедитесь, что профиль профессиональный (Business или Creator).",
      "Если профиль личный, в настройках типа аккаунта переключитесь на профессиональный, только если это подходит вашему бизнесу.",
      "Когда кнопка авторизации станет доступна, войдите через официальное окно Instagram и подтвердите запрошенные разрешения.",
      "Вернитесь сюда и обновите статус. Дождитесь подтверждения, что тестовое обращение поступает в CRM."
    ],
    "hint": "Ключ вручную не нужен. Приложение Meta и разрешения готовит разработчик.",
    "links": [
      [
        "Открыть Instagram",
        "https://www.instagram.com/"
      ]
    ]
  },
  "whatsapp": {
    "title": "Как подключить WhatsApp",
    "steps": [
      "Подготовьте рабочий номер и доступ к своему бизнес-аккаунту Meta.",
      "Если номер уже используется в WhatsApp Business, сохраните текущую работу: не удаляйте аккаунт и не переносите номер самостоятельно.",
      "После готовности подключения нажмите «Продолжить через Meta», выберите свой бизнес и рабочий номер.",
      "Подтвердите разрешения и номер в официальном окне Meta. Коды подтверждения вводите только там.",
      "Вернитесь в кабинет. Дождитесь проверки получения тестового сообщения."
    ],
    "hint": "Ключ вручную не нужен. Существующий номер подключаем только после проверки поддержки совместной работы с приложением WhatsApp Business.",
    "links": [
      [
        "Открыть Meta Business",
        "https://business.facebook.com/"
      ]
    ]
  },
  "telegram": {
    "title": "Как начать работу с ботом",
    "steps": [
      "Откройте @albina_hair_bot по кнопке ниже.",
      "Нажмите «Запустить» или отправьте /start.",
      "Сообщите разработчику, что запустили бота. Он назначит ваш аккаунт администратором после проверки владения.",
      "После подтверждения отправьте /start ещё раз: появится рабочее меню заявок и клиентов."
    ],
    "hint": "Создавать нового бота, получать токен или передавать код из Telegram не требуется. Личные переписки не импортируются.",
    "links": []
  },
  "google": {
    "title": "Как подключить профиль Google",
    "steps": [
      "Войдите в Google-аккаунт, который управляет вашим профилем компании.",
      "Откройте карточку компании и убедитесь, что профиль подтверждён и вы имеете права владельца или управляющего.",
      "Когда авторизация в этой панели станет доступна, нажмите кнопку входа через Google и подтвердите разрешения.",
      "Вернитесь сюда и обновите статус. Сбор отзывов и данных проверяется отдельно."
    ],
    "hint": "Ключ вручную не нужен. Доступ к Business Profile API и OAuth-приложение оформляет разработчик.",
    "links": [
      [
        "Открыть профиль компании",
        "https://business.google.com/"
      ],
      [
        "Справка о правах доступа",
        "https://support.google.com/business/answer/3403100?hl=ru"
      ]
    ]
  },
  "yandex": {
    "title": "Как настроить Яндекс Бизнес",
    "steps": [
      "Войдите в Яндекс Бизнес со своим аккаунтом.",
      "Выберите карточку салона и проверьте право управления.",
      "Если нужна онлайн-запись, откройте интеграцию Яндекс в DIKIDI и пройдите предложенные шаги и модерацию, если функция доступна вашему проекту.",
      "Проверьте кнопку записи в карточке компании."
    ],
    "hint": "Ключ для импорта обращений пока не запрашиваем. Онлайн-запись через DIKIDI не означает синхронизацию переписок с CRM.",
    "links": [
      [
        "Инструкция Яндекса по онлайн-записи",
        "https://yandex.ru/support/business-priority/ru/manage/booking"
      ]
    ]
  },
  "2gis": {
    "title": "Как подготовить карточку 2ГИС",
    "steps": [
      "Откройте личный кабинет 2ГИС и войдите в свой аккаунт.",
      "Выберите вашу компанию. Если доступа нет, запросите его через официальный кабинет.",
      "Проверьте телефон, сайт, часы работы и доступные способы записи.",
      "Если кабинет позволяет указать ссылку записи, добавьте свою публичную ссылку DIKIDI."
    ],
    "hint": "Ключ для CRM пока не нужен: официальный способ автоматического импорта обращений не подтверждён. Не покупайте ключи картографических API для этой задачи.",
    "links": [
      [
        "Справка 2ГИС",
        "https://help.2gis.ru/question/kak-vnesti-izmeneniya-vnbspkartochku-kompanii"
      ]
    ]
  },
  "dikidi": {
    "title": "Как получить ключ DIKIDI",
    "steps": [
      "Войдите в веб-версию DIKIDI Business и выберите свой проект.",
      "Откройте Настройки → Интеграция → Доступ к API.",
      "Нажмите «Добавить доступ» и задайте название Albina CRM.",
      "Выберите минимально необходимые права для чтения клиентов и записей. Если для создания токена требуется роль администратора, сначала согласуйте объём доступа с разработчиком.",
      "Нажмите «Добавить», скопируйте созданный токен и вставьте в защищённую форму ниже. ID проекта укажите, если он известен.",
      "Сохраните ключ. Статус «Ожидается активация» в DIKIDI может сохраняться до настройки партнёрского доступа."
    ],
    "hint": "Не вводите пароль DIKIDI, общий партнёрский ключ или одноразовые коды. Сохранение токена не активирует синхронизацию.",
    "links": [
      [
        "Пример получения ключа в справке DIKIDI",
        "https://support.dikidi.net/ru/knowledge-bases/4/articles/992-kak-nastroit-integratsiyu-dikidi-c-prodoktorov"
      ]
    ]
  }
};
  let statuses = {};
  let selected = null;
  let metaCode = null;
  let metaAssets = null;
  let metaSubmitting = false;
  let metaConfig = null;
  let metaActive = false;
  let metaTimer = null;
  let metaRun = 0;

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
    if (['instagram','whatsapp','google'].includes(id) && !statuses[id]?.configured && state !== 'authorized') return {text:'Готовится подключение', className:'pending_setup'};
    if (id === 'telegram') return {text:'Открыть бота', className:'not_connected'};
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
      const button = el('button','','Подключение и инструкция');
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
    $('dialog-note').replaceChildren(el('p','',p.note));
    const guide = guides[p.id];
    const instructions = el('section','connection-guide');
    instructions.append(el('h3','',guide.title));
    const steps = el('ol','guide-steps');
    guide.steps.forEach(step=>steps.append(el('li','',step)));
    instructions.append(steps,el('p','guide-hint',guide.hint));
    const links=el('div','guide-links');
    guide.links.forEach(([name,url])=>links.append(actionLink(name,url)));
    instructions.append(links);
    $('dialog-note').append(instructions);
    $('dialog-actions').replaceChildren();
    $('disconnect').hidden = !['authorized','key_saved_unverified'].includes(statuses[p.id]?.state);
    feedback('');
    if (p.id === 'instagram' || p.id === 'google') {
      const button=actionButton('Авторизоваться через '+(p.id === 'google'?'Google':'Instagram'),()=>openPopup('/api/integrations/'+p.id+'/start'));
      button.disabled=!statuses[p.id]?.configured;
      setActions(button);
      if (button.disabled) feedback('Подключение готовится. Пока можно выполнить подготовительные шаги из инструкции.');
    } else if (p.id === 'whatsapp') {
      const button = actionButton('Продолжить через Meta', startMetaSignup);
      button.disabled = true;
      setActions(button);
      if (!statuses[p.id]?.configured) { feedback('Подключение готовится. Пока можно проверить рабочий номер и доступ к Meta.'); }
      else {
      feedback('Готовим безопасную авторизацию Meta…');
      void prepareMetaSignup().then(() => {
        button.disabled = false;
        if (selected?.id === 'whatsapp') feedback('Meta готова. Нажмите кнопку для открытия официального окна.');
      }).catch(() => { if (selected?.id === 'whatsapp') feedback('Не удалось открыть авторизацию Meta. Попробуйте позже или обратитесь к разработчику.',true); });
      }
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
      setActions(actionLink('Открыть @albina_hair_bot','https://t.me/albina_hair_bot'));
      feedback('Доступ к рабочему меню предоставляется после проверки вашего Telegram-аккаунта.');
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
        window.FB.init({appId,autoLogAppEvents:false,xfbml:false,version:'v27.0'});
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
    if (!metaActive || !metaCode || !metaAssets || metaSubmitting) return;
    clearTimeout(metaTimer);
    metaSubmitting = true;
    feedback('Проверяем бизнес-аккаунт WhatsApp через Meta…');
    try {
      const result=await api('/api/integrations/whatsapp/complete',{
        method:'POST', body:JSON.stringify({code:metaCode,...metaAssets})
      });
      feedback(result.message||'Номер подтверждён. Проверьте тестовое сообщение.');
      await refresh();
      $('disconnect').hidden = false;
    } catch(error) { feedback(error.message,true); }
    finally { metaCode = null; metaAssets = null; metaSubmitting = false; metaActive=false; }
  }
  window.addEventListener('message',event => {
    if (!['https://www.facebook.com','https://web.facebook.com','https://business.facebook.com'].includes(event.origin)) return;
    let body;
    try { body = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
    catch { return; }
    if (!metaActive || metaSubmitting || body?.type !== 'WA_EMBEDDED_SIGNUP') return;
    if (['FINISH','FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(body.event) && body.data) {
      const wabaId=String(body.data.waba_id||'');
      const phoneId=String(body.data.phone_number_id||'');
      const mode=body.event==='FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'?'coexistence':'standard';
      if (/^\d{5,30}$/.test(wabaId)&&(/^\d{5,30}$/.test(phoneId)||(!phoneId&&mode==='coexistence'))) {
        metaAssets={wabaId,phoneId,mode};
        void completeMetaWhenReady();
      } else feedback('Meta не передала необходимые сведения о номере.',true);
    } else if (body.event==='FINISH_ONLY_WABA') {
      feedback('Выбран аккаунт без номера. Повторите подключение с нужным номером.',true);
      metaActive=false;clearTimeout(metaTimer);metaCode=null;metaAssets=null;
    } else if (body.event === 'CANCEL' || body.event === 'ERROR') {
      metaActive=false;clearTimeout(metaTimer);metaCode=null;metaAssets=null;
      feedback('Регистрация в Meta не завершена.',true);
    }
  });
  async function prepareMetaSignup() {
    const config = await api('/api/integrations/meta-config');
    if (!config.configured || !config.appId || !config.configurationId) {
      throw new Error('Meta Embedded Signup пока не настроен на сервере.');
    }
    await loadMetaSdk(config.appId);
    metaConfig = config;
  }
  function startMetaSignup() {
    // FB.login must run directly in a user click; awaiting a fetch here would block the popup.
    if (!metaConfig || !window.FB) return feedback('Meta SDK ещё не готова.',true);
    if(metaActive||metaSubmitting)return feedback('Подключение уже открыто. Завершите его в окне Meta.');
    metaCode = null; metaAssets = null; metaSubmitting = false;metaActive=true;
    const run=++metaRun;
    metaTimer=setTimeout(()=>{if(metaRun===run&&metaActive&&!metaSubmitting){metaActive=false;metaCode=null;metaAssets=null;feedback('Время подключения истекло. Повторите попытку.',true);}},600000);
    window.FB.login(response => {
      if(!metaActive||metaRun!==run)return;
      const code = response?.authResponse?.code;
      if (!code) {metaActive=false;clearTimeout(metaTimer);metaAssets=null;return feedback('Meta не предоставила код авторизации. Повторите подключение.',true);}
      metaCode = code;
      feedback('Авторизация Meta выполнена. Ожидаем сведения о WhatsApp Business...');
      void completeMetaWhenReady();
    },{config_id:metaConfig.configurationId,response_type:'code',override_default_response_type:true,
      extras:{setup:{},featureType:'whatsapp_business_app_onboarding'}});
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
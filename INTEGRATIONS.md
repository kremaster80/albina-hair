# ALBINA — панель подключения внешних аккаунтов

## Что сделано

Сайт остается обычным статическим лендингом. Отдельная внутренняя страница **/admin/** — защищённая панель интеграций. Реальные права доступа к данным — только через серверный API (Node.js, без npm-пакетов), а не через общедоступный JavaScript.

- Instagram: официальный Instagram OAuth (только профессиональные аккаунты); проверка ID аккаунта, обмен краткосрочного токена на долгосрочный. Потребуется Meta App Review для полноценной работы.
- WhatsApp: интерфейс Embedded Signup **v4**, проверка WABA/номера через Meta Graph API. Для автоматического получения сообщений дальше нужны подписка на webhooks и настройки Meta Business.
- Google Business Profile: OAuth с областью business.manage. Доступ к Business Profile API/отзывам требует включения API и, в некоторых случаях, одобрения Google.
- DIKIDI: ввод **только отдельно выпущенного API-ключа** в приватной панели. Сервер хранит зашифрованный ключ, однако пока не проверяет его валидность. Статус **«Ключ сохранён · не проверен»**, а не «Подключено».
- Telegram: переход в BotFather для создания отдельного бота. Вход в Telegram не предоставляет доступ к личным сообщениям пользователя. Для приёма обращений нужен Bot API/webhook.
- Яндекс Бизнес, 2ГИС: кнопки ведут на официальные кабинеты. Это **не OAuth-разрешение** для нашей системы; автоматический сбор обращений пока не реализован.
- Любое «Авторизовано» означает, что завершена авторизация, но **не** означает, что импорт переписок или клиентов уже работает.

## Безопасность

- Никаких паролей от соцсетей — логины вводятся на доменах самих платформ.
- У панели свой отдельный длинный секрет администратора (он не связан с соцсетями).
- Авторизация панели: HttpOnly cookie, SameSite=Lax, Secure при HTTPS, подпись HMAC, сессия 12 часов, ограничение попыток входа.
- OAuth state случайный и одноразовый, ограничен 10 минутами.
- Ключи/токены сохраняются **только на сервере** AES-256-GCM в DATA_FILE вне публичной директории, права 0600.
- При отключении запись удаляется локально. **Отзыв доступа также нужно выполнить в аккаунте поставщика**.
- Рабочие ключи, пароли, API-токены и файл integrations.env **не коммитить и не отправлять в чат**.
- Сервер слушает только 127.0.0.1:3077. Доступ к нему снаружи — только через HTTPS и Nginx.
- Включение только OAuth **не гарантирует** получения лидов. Следующим этапом будут сборщик/webhooks, база клиентов и Telegram-уведомления, с законным основанием обработки персональных данных.

## Как развернуть, не затрагивая другие проекты VPS

Сервер уже использует nginx и другие сайты. Не меняйте существующие конфиги и не занимайте общие порты.

### 1. Обновить код после слияния PR

На VPS:

~~~bash
sudo git -C /var/www/albina-hair pull --ff-only origin main
node --version   # нужен Node.js 20+
sudo mkdir -p /etc/albina-hair /var/lib/albina-hair
sudo useradd --system --home /var/lib/albina-hair --shell /usr/sbin/nologin albina-api 2>/dev/null || true
sudo chown albina-api:albina-api /var/lib/albina-hair
sudo chmod 700 /var/lib/albina-hair
~~~

### 2. Секреты на сервере (не в GitHub)

~~~bash
sudo cp /var/www/albina-hair/server/integrations.env.example /etc/albina-hair/integrations.env
sudo nano /etc/albina-hair/integrations.env
~~~

- Замените ADMIN_PASSWORD на уникальный сложный пароль для **нашей панели**, не пароль соцсети.
- Для SESSION_SECRET используйте вывод команды **openssl rand -hex 32**.
- Для DATA_KEY — ещё одно независимое **openssl rand -hex 32** (это ровно 64 hex символа).
- Сохраните оба секрета вне репозитория. Потеря DATA_KEY делает зашифрованные токены невосстановимыми.
- Заполните Meta/Google OAuth-приложения и их client ID/client secret по мере выдачи доступов. Пустые настройки просто помечаются как не настроенные.

~~~bash
sudo chown root:albina-api /etc/albina-hair/integrations.env
sudo chmod 640 /etc/albina-hair/integrations.env
~~~

### 3. Сервис systemd

~~~bash
sudo nano /etc/systemd/system/albina-integrations.service
~~~

Содержимое:

~~~ini
[Unit]
Description=ALBINA private integrations API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=albina-api
Group=albina-api
WorkingDirectory=/var/www/albina-hair
EnvironmentFile=/etc/albina-hair/integrations.env
ExecStart=/usr/bin/node /var/www/albina-hair/server/integrations.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/albina-hair

[Install]
WantedBy=multi-user.target
~~~

Если node расположен не в /usr/bin/node, подставьте его реальный путь из **command -v node**.

~~~bash
sudo systemctl daemon-reload
sudo systemctl enable --now albina-integrations
sudo systemctl status albina-integrations --no-pager
~~~

### 4. Nginx: в существующий HTTPS server-блок домена albinahair.swiftgifts.tg

Вставить **внутрь существующего server {}**, сохраняя текущий сертификат и другие сайты:

~~~nginx
location ^~ /api/ {
    proxy_pass http://127.0.0.1:3077;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 32k;
    proxy_read_timeout 35s;
}

# Закрыть от внешнего доступа серверные файлы из папки репозитория.
location ^~ /server/ { return 404; }
location ~ /\.(?!well-known).* { deny all; }

location ^~ /admin/ {
    add_header Cache-Control "no-store";
    try_files $uri $uri/ =404;
}
~~~

Существующий **location /** для сайта оставить как есть. Если такие location-блоки уже существуют, объедините правила без дубликатов, проверьте конфигурацию.

~~~bash
sudo nginx -t && sudo systemctl reload nginx
curl -i https://albinahair.swiftgifts.tg/api/admin/session
~~~

Ожидается ответ **{"authenticated":false}** (пока нет входа). Откройте **https://albinahair.swiftgifts.tg/admin/**.

### 5. OAuth redirect URI

Регистрируются точно, без звездочек:

- Instagram: https://albinahair.swiftgifts.tg/api/integrations/instagram/callback
- Google: https://albinahair.swiftgifts.tg/api/integrations/google/callback
- WhatsApp Embedded Signup: разрешённый HTTPS-домен и конфигурация Facebook Login for Business, тип v4. META_CONFIG_ID должен быть из конфигурации v4.

### 6. Проверка перед отдачей доступа Альбине

1. Зайти с длинным паролем панели; без пароля endpoint /api/integrations/status должен отвечать 401.
2. Проверить, что GET /server/integrations.mjs и /.git/config на домене не доступны.
3. Проверить редиректы Instagram и Google на официальные домены и одноразовые state.
4. Проверить DIKIDI: API-ключ не возвращается в ответе статуса; статус «ключ сохранён, не проверен».
5. Проверить отключение аккаунтов и повторный вход после logout.
6. Перед импортом реальных клиентских данных согласовать политику/согласия и сроки хранения.

## Следующие работы (ещё НЕ реализованы)

- Вебхуки Meta/Instagram, события WhatsApp, нормализация заявок и дедупликация.
- Bot API Telegram: создание бота, команды, панель клиентов, статусы и уведомления.
- Проверка DIKIDI API-ключа через официально доступный партнёрский метод, синхронизация записей.
- Яндекс/2ГИС: допустимый API или официальный канал уведомлений, без парсинга закрытых кабинетов.
- БД (PostgreSQL), история клиентов, привязка источников, поиск, напоминания и защищённые доступы.

Ни один неавторизованный сервис не должен отображаться как подключённый.

## CRM v0.2 — подготовка к развёртыванию

Рабочий кабинет `/admin/crm.html` подключён к общей авторизации `/admin/`. Реализованы PostgreSQL, ручное добавление и поиск заявок, карточки контактов, история входящих текстов, статусы, локальные записи, статистика, удаление контакта, дедупликация событий, очередь Telegram-уведомлений без текста сообщения. Контакты пока разделяются по источникам; автоматического объединения разных аккаунтов одного человека нет.

На VPS необходимо установить PostgreSQL, создать отдельную БД и пользователя с правами на эту БД, выполнить `cd /var/www/albina-hair/server && npm install --omit=dev`, установить Node.js 22+, заполнить DATABASE_URL и REQUIRE_CRM=1 в приватном env, перезапустить службу. Схема создаётся при старте. Не хранить БД/секреты под webroot. Обновить client_max_body_size для маршрутов вебхуков до 1m; запретить запись query string OAuth callbacks в access log. Для запуска новой версии сначала выполнить проверки на отдельной тестовой БД. Не передавать секреты в чат.

Вебхуки: `/api/webhooks/instagram`, `/api/webhooks/whatsapp`, `/api/webhooks/telegram` — подписи Meta и secret_token Telegram проверяются сервером. Настроить подписки Meta вручную в кабинете разработчика, задать META_WEBHOOK_VERIFY_TOKEN; Telegram: создать бота, задать TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (случайная строка из A-Z,a-z,0-9,_,-), TELEGRAM_ADMIN_CHAT_ID, вызвать setWebhook с HTTPS URL и secret_token. Администратор должен запустить бота ранее. Не считать доставку включённой до контрольного входящего сообщения и проверки уведомления. Для Instagram/WhatsApp дополнительно проверяются идентификаторы подключённых аккаунтов.

Локальные записи НЕ синхронизированы с DIKIDI. Для DIKIDI требуется партнёрская документация/доступ, Google/Яндекс/2ГИС — подтверждение доступных методов. Существующая WhatsApp-форма сайта не изменена. До включения сбора реальных данных настроить законное основание обработки, размещение и сроки хранения, резервное копирование PostgreSQL, проверку восстановления, ограничения доступа и мониторинг. OAuth refresh и полноценная проверка внешних аккаунтов остаются незавершёнными. Уведомления повторяются до 12 попыток; доставка может дублироваться при сбое после sendMessage, требуется мониторинг. Не считать релиз production-ready до интеграционных тестов и проверки безопасности.

## Telegram-first кабинет

Один бот разделяет клиентский и административный режимы по точному числовому TELEGRAM_ADMIN_CHAT_ID; доступ к CRM из групп не допускается. Альбина получает меню заявок, клиента, поиска по имени/телефону, последних сообщений, изменения статусов, назначения локального визита (МСК), статистики и перехода в веб-панель. Push о новой заявке открывает её непосредственно в боте. Клиент получает анкету из пяти вопросов, форму свободного обращения, управление согласием, опциональную ссылку на DIKIDI, opt-in напоминания. Пароли соцсетей в бот не вводятся.

Перед запуском: создать бот через BotFather; задать TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, числовой TELEGRAM_ADMIN_CHAT_ID, опубликованный проверенный TELEGRAM_PRIVACY_URL и подтверждённый DIKIDI_BOOKING_URL в приватном env; перезапустить службу; установить webhook на /api/webhooks/telegram с secret_token и allowed_updates=["message","callback_query"]; Альбина должна открыть бота и нажать /start. Токен никогда не отправлять в чат или GitHub. При отсутствии политики клиентский приём закрыт. Без ссылки на DIKIDI кнопка не показывается. Юридическую достаточность согласия и политику должен проверить владелец данных; до этого реальный приём не включать.

Напоминание об одном локально подтверждённом визите отправляется в окне за 24–1 час до начала только клиенту Telegram с действующим согласием и включёнными напоминаниями. Удаление/перенос визита или отзыв согласия исключают его из следующих выборок. Редкий сбой после успешного Telegram API вызова и до записи sent_at может вызвать дубликат. Веб и бот используют одни таблицы PostgreSQL. Синхронизации с DIKIDI пока нет. Деплой рассчитан на один Node-процесс; масштабирование на несколько экземпляров требует отдельной распределённой очереди блокировок. Установить политику очистки таблиц бот-состояний и update IDs, мониторинг неуспешных уведомлений. С тестовым ботом выполнить все сценарии до передачи клиенту.

## Long polling for Telegram behind an outgoing proxy

Set `TELEGRAM_UPDATE_MODE=polling` in the private environment file and restart the single CRM service. The worker deletes the existing Telegram webhook with `drop_pending_updates: false`, then retrieves updates via `getUpdates` with a 25-second server timeout and 45-second client timeout. It acknowledges only completed updates, retries transient failures with backoff, and reuses CRM deduplication on restart. An explicitly blocked outbound reply (Telegram 403) does not stall other users. Logs omit tokens and payloads. The Telegram webhook route returns 410 in polling mode; Instagram and WhatsApp routes are unchanged. Do not run another poller with the same token. To return to webhook mode, set `TELEGRAM_UPDATE_MODE=webhook`, restart, then register the webhook explicitly. Test with the actual bot before production handoff. Outgoing HTTP proxy configuration remains a deployment responsibility.

## Instagram Unified Login (new Meta applications)

Set INSTAGRAM_LOGIN_MODE=unified, META_APP_ID, META_APP_SECRET and INSTAGRAM_CONFIG_ID in the private environment file. Do not reuse INSTAGRAM_CONFIG_ID as META_CONFIG_ID (WhatsApp). The OAuth URL follows the Meta dashboard generated link with a fresh one-time state. Code exchange, debug_token and assigned_instagram_accounts use Graph API v27.0; only one verified professional account is supported. Configure instagram_basic and instagram_manage_messages; if account enumeration is rejected, investigate business_management and review requirements with Meta rather than using an unchecked account ID. The webhook signature uses META_APP_SECRET. The existing app-level messages subscription must be verified with a real incoming message; account-level delivery/required subscriptions and Advanced Access are not yet validated. No production success is implied by token verification. Test with an authorized professional account and do not collect client data until privacy requirements are met. Legacy Instagram Login remains available when INSTAGRAM_LOGIN_MODE is unset.

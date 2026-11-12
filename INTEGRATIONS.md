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

# Размещение сайта Альбины на VPS 77.222.42.139

Репозиторий: https://github.com/kremaster80/albina-hair

Это статический сайт (HTML/CSS/JS). Node.js и базы данных не нужны.

**Предположения:** доступ по SSH и Ubuntu/Debian на VPS, возможность выполнять команды через `sudo`. Для CentOS/AlmaLinux, контейнерного хостинга или сервера с панелью управления шаги будут другими. Если на VPS уже работают другие сайты, не заменяйте существующие конфиги: используйте отдельный виртуальный хост.

## 1. Подключиться

Откройте PowerShell на Windows:

```powershell
ssh root@77.222.42.139
```

Если провайдер выдал другое SSH-имя пользователя или порт, подставьте их (например, `ssh -p 2222 ubuntu@77.222.42.139`). Пароль и приватный SSH-ключ вводятся только в терминале, не в файлах сайта.

## 2. Проверить, что уже запущено

На VPS:

```bash
cat /etc/os-release
sudo ss -ltnp | grep -E ':(80|443)\b' || true
sudo systemctl status nginx --no-pager || true
```

Если порт 80 занят Apache, Caddy, Docker или панелью, не устанавливайте второй веб-сервер вслепую: разместите сайт через уже работающий сервис либо настройте reverse proxy.

## 3. Установить необходимое (Ubuntu/Debian, если Nginx ещё нет)

```bash
sudo apt update
sudo apt install -y nginx git
sudo systemctl enable --now nginx
```

## 4. Скачать актуальную версию сайта

```bash
sudo git clone https://github.com/kremaster80/albina-hair.git /var/www/albina-hair
```

Если папка `/var/www/albina-hair` уже содержит этот Git-репозиторий, вместо повторного клонирования:

```bash
sudo git -C /var/www/albina-hair pull --ff-only origin main
```

Проверить наличие `index.html`, `config.js` и `assets`:

```bash
ls -la /var/www/albina-hair/
```

## 5. Настроить отдельный сайт в Nginx

Создайте конфигурацию:

```bash
sudo nano /etc/nginx/sites-available/albina-hair
```

Вставьте:

```nginx
server {
    listen 80;
    server_name 77.222.42.139;

    root /var/www/albina-hair;
    index index.html;
    charset utf-8;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

Сохраните: Ctrl+O → Enter → Ctrl+X.

Включите конфигурацию **без удаления конфигураций других сайтов**:

```bash
sudo ln -s /etc/nginx/sites-available/albina-hair /etc/nginx/sites-enabled/albina-hair
sudo nginx -t
sudo systemctl reload nginx
```

Если симлинк уже существует, не создавайте его повторно. Если `nginx -t` показывает ошибку, **не перезагружайте** Nginx, пока не исправите её.

## 6. Открыть порт 80 и проверить

Если UFW активен:

```bash
sudo ufw status
sudo ufw allow 80/tcp
```

В панели VPS/провайдера также разрешите входящий TCP 80; для будущего HTTPS — TCP 443. Проверьте, что веб-сервер слушает порт:

```bash
sudo ss -ltnp | grep ':80'
curl -I -H 'Host: 77.222.42.139' http://127.0.0.1/
```

Откройте **http://77.222.42.139/**. До настройки TLS ссылка **https://77.222.42.139/** может не работать или выдавать предупреждение о сертификате. Если сайт не доступен снаружи — проверьте брандмауэр сервера, настройки провайдера и IP-адрес.

## 7. HTTPS и собственный домен (рекомендуется)

Для публичного сайта лучше использовать отдельный домен. Укажите A-запись домена на `77.222.42.139`. После обновления DNS замените `server_name 77.222.42.139;` на `server_name example.ru www.example.ru;` (укажите **реальный** домен), выполните:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.ru -d www.example.ru
```

Добавляйте вариант `www` только если он действительно указывает на этот VPS. Для корректной работы Certbot порты 80/443 должны быть доступны из интернета. Если сервер уже обслуживает другие сайты, согласуйте изменения HTTPS с существующей конфигурацией.

## 8. Как обновлять сайт после новых коммитов

```bash
ssh root@77.222.42.139
sudo git -C /var/www/albina-hair pull --ff-only origin main
```

Для обычных HTML/CSS/JS изменений перезапуск Nginx не требуется. На клиенте используйте Ctrl+F5, если видна старая версия. Reload нужен только при правках конфигурации Nginx.

## Контакты на сайте

Уже сохранены в `config.js` и автоматически выводятся в контактном блоке:
- Telegram: https://t.me/albinadumbrovskaya
- Instagram: https://www.instagram.com/albina_well_/
- WhatsApp: https://wa.me/79269952998

Исходная ссылка WhatsApp была дана в виде 10 цифр (9269952998), поэтому добавлен российский код страны 7. При нажатии кнопки записи открывается WhatsApp с текстом заявки — автоматической отправки и хранения данных нет.

## Оставшиеся данные

Пока не добавлены адрес студии, портрет Альбины и ссылки на Instagram Reels (для них в `config.js` оставлены поля). Не выдумывайте отсутствующие сведения.

# راه‌اندازیِ سرورِ PolyBot — راهنمای امنیت‌محور

این راهنما ربات را روی یک سرورِ شخصی (VPS) بالا می‌آورد: استراتژی فقط روی سرور اجرا
می‌شود، گوشی فقط پنلِ کنترل است، و همه‌چیز پشتِ توکن قفل است.

**فازِ فعلی: سایه (Shadow).** پولِ فرضی + نرخِ واقعیِ لحظه‌ایِ Polymarket + کندلِ
واقعیِ Binance. هیچ کلیدِ کیف‌پولی روی سرور نیست و هیچ سفارشِ واقعی ثبت نمی‌شود.
اجرای واقعی (فاز ۳) فقط بعد از موفقِ بودنِ دورهٔ سایه فعال می‌شود.

---

## ۰) قبل از هر چیز — سه قانونِ طلایی

1. **ریپوی کد را خصوصی (Private) کن.** استراتژی توی کدِ سرور است؛ ریپوی عمومی یعنی
   استراتژیِ عمومی.
2. **`POLYBOT_TOKEN` را همیشه ست کن.** بدونِ آن، API باز است و هر کسی که آدرسِ سرور
   را بداند می‌تواند ربات را کنترل کند.
3. (برای فازِ واقعی) **کیف‌پولِ ربات جدا و کوچک است.** سرمایهٔ اصلی در کیف‌پولِ سرد
   می‌ماند؛ کلیدش هیچ‌وقت روی سرور نمی‌آید. سقفِ خسارتِ بدترین حالت = موجودیِ همان
   کیف‌پولِ کوچک.

---

## ۱) سرور (Ubuntu 22.04/24.04، کوچک‌ترین پلن کافی است)

```bash
# به‌عنوانِ root، یک‌بار:
adduser bot && usermod -aG sudo bot

# ورودِ فقط-با-کلید (روی گوشی/کلاینتِ خودت کلید بساز و کپی کن):
#   ssh-keygen -t ed25519  →  ssh-copy-id bot@SERVER_IP
# بعد پسورد-لاگین و ورودِ root را ببند:
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/;s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh

# فایروال: فقط SSH و وب
apt update && apt -y install ufw fail2ban
ufw allow OpenSSH && ufw allow 443/tcp && ufw --force enable

# آپدیت‌های امنیتیِ خودکار
apt -y install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

## ۲) نصبِ ربات

```bash
sudo apt -y install python3-venv git caddy
git clone <آدرسِ ریپویِ خصوصی> polybot-app && cd polybot-app
python3 -m venv .venv && .venv/bin/pip install -r polybot/requirements.txt

# توکنِ قوی بساز و یادداشت کن (این را در پنلِ گوشی وارد می‌کنی):
openssl rand -hex 24
```

## ۳) سرویسِ systemd (اجرای دائم + بالا آمدنِ خودکار)

`/etc/systemd/system/polybot.service`:

```ini
[Unit]
Description=PolyBot trading server
After=network-online.target

[Service]
User=bot
WorkingDirectory=/home/bot/polybot-app
Environment=POLYBOT_TOKEN=توکنی-که-ساختی
ExecStart=/home/bot/polybot-app/.venv/bin/uvicorn polybot.api:app --host 127.0.0.1 --port 8700
Restart=always
RestartSec=5
# سخت‌سازی
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now polybot
```

نکته: سرویس فقط روی `127.0.0.1` گوش می‌دهد — از بیرون فقط از طریقِ HTTPSِ مرحلهٔ
بعد قابلِ دسترسی است.

## ۴) HTTPS با Caddy (گواهیِ خودکار)

`/etc/caddy/Caddyfile` — با دامنه (یک سابدامینِ ارزان/رایگان کافی است):

```
bot.example.com {
    reverse_proxy 127.0.0.1:8700
}
```

```bash
sudo systemctl reload caddy
```

حالا روی گوشی `https://bot.example.com` را باز کن، توکن را وارد کن — پنل بالا می‌آید.
می‌توانی Add to Home Screen هم بکنی؛ چون ربات روی سرور است، بسته بودنِ گوشی مهم نیست.

## ۵) استفاده

- **شروع/توقفِ دستی:** دکمهٔ شروع در پنل. ربات تا وقتی «توقف» نزنی کار می‌کند.
- **زمان‌بندی:** «از ساعت / تا ساعت» (ساعتِ تهران) را در پنل بگذار — فقط داخلِ آن
  بازه معامله می‌کند و هر شب تکرار می‌شود.
- **قطعِ اضطراری:** دکمهٔ Kill همه‌چیز را فوراً می‌بندد؛ فقط «ریست» بازش می‌کند.
- **سقف‌های ایمنی:** حداکثر مبلغِ هر معامله و حداکثر ضررِ روزانه را حتماً ست کن —
  زیرِ استراتژی اجرا می‌شوند و جلوی باگ/رفتارِ دیوانه را می‌گیرند.

## ۶) چک‌لیستِ امنیتیِ نهایی

- [ ] ریپو خصوصی است؛ لینکِ عمومیِ نسخهٔ آزمایشیِ HTML را دیگر به‌روز/پخش نکن.
- [ ] `POLYBOT_TOKEN` ستِ شده و فقط در پنلِ گوشیِ خودت ذخیره است.
- [ ] ورودِ SSH فقط با کلید؛ `ufw` فعال؛ آپدیتِ خودکار روشن.
- [ ] سرویس فقط روی `127.0.0.1`؛ دسترسیِ بیرونی فقط از HTTPS.
- [ ] (فازِ واقعی) کیف‌پولِ رباتی جدا با موجودیِ کم؛ کلیدِ سرمایهٔ اصلی آفلاین.
- [ ] (فازِ واقعی) قبل از بالا بردنِ مبلغ، حداقل ۱–۲ هفته آمارِ حالتِ سایه را ببین.

## ۷) نقشهٔ فازها

| فاز | وضعیت |
|---|---|
| ۱. سرور + پنلِ رمزدار + استراتژیِ v13 + زمان‌بند | ✅ همین ریپو |
| ۲. دورهٔ سایه با نرخِ واقعی (۱–۲ هفته) | با بالا آمدنِ سرور شروع می‌شود |
| ۳. اجرای واقعیِ کم‌مبلغ (py-clob-client، کیف‌پولِ کوچک) | فقط بعد از موفقیتِ فاز ۲ |
| ۴. مانیتورینگ/اعلانِ تلگرام + افزایشِ تدریجی | بعد از فاز ۳ |

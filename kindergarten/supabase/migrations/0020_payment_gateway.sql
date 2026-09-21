-- ============================================================
-- درگاه پرداخت اینترنتی — ارتقای ۱ سند بررسی طراحی
--
-- ماژول M17 در سند اصلی فاز ۳ بود با توضیح «ثبت دستی فعلاً کافی است».
-- به خواست مالک محصول به فاز ۱ آمد.
--
-- روال «والد فیش کارت‌به‌کارت را عکس می‌گیرد ← آپلود می‌کند ← منتظر
-- می‌ماند ← مدیر تأیید می‌کند» سه مشکل داشت: تأخیر ساعتی تا روزانه،
-- بار دستی روی مدیر، و صف اعلام‌هایی که خودش یک صفحه کامل لازم داشت.
--
-- بستر شاپرک، با یکی از واسط‌های داخلی (زیبال، وندار، زرین‌پال). معماری
-- با هر سه یکسان است، پس نام واسط ستون است نه فرض.
--
-- ── قاعده سفت معماری ──────────────────────────────────────────
--
--   وضعیت صورتحساب فقط با تأیید سمت سرور عوض می‌شود، هرگز با بازگشت
--   مرورگر.
--
-- بازگشت کاربر از درگاه یک سیگنال است، نه سند: کاربر می‌تواند صفحه را
-- ببندد، اینترنتش قطع شود، یا آدرس بازگشت را دستی بزند. تا verified_at
-- پر نشده، پرداختی وجود ندارد.
-- ============================================================

create type app.payment_method as enum ('online', 'manual_receipt', 'cash', 'cheque');
create type app.gateway_state as enum ('pending', 'verified', 'failed', 'cancelled');

alter table payment
  add column payment_method app.payment_method not null default 'manual_receipt',
  add column psp text,
  add column gateway_ref text,
  add column tracking_code text,
  -- کلید ضدتکرار. رسیدن دوباره وب‌هوک هرگز پرداخت دوم نمی‌سازد.
  add column idempotency_key text,
  add column gateway_state app.gateway_state,
  -- لحظه تأیید سمت سرور. تا پر نشدن، پرداخت وجود ندارد.
  add column verified_at timestamptz;

create unique index payment_idempotency_idx
  on payment (center_id, idempotency_key)
  where idempotency_key is not null;

create index payment_pending_gateway_idx
  on payment (center_id, created_at)
  where gateway_state = 'pending';

comment on column payment.verified_at is
  'تأیید سمت سرور. بازگشت مرورگر اینجا را پر نمی‌کند — فقط verify واسط.';

-- ------------------------------------------------------------
-- پرداخت آنلاینِ تأییدنشده، پرداخت نیست.
--
-- اگر این نبندد، یک ردیف pending همان‌قدر «پرداخت» به حساب می‌آید که
-- یک تراکنش موفق، و مانده صورتحساب غلط می‌شود.
-- ------------------------------------------------------------
create or replace function app.guard_online_payment()
returns trigger
language plpgsql
as $$
begin
  if new.payment_method <> 'online' then
    return new;
  end if;

  if new.gateway_state is null then
    new.gateway_state := 'pending';
  end if;

  if new.gateway_state = 'verified' and new.verified_at is null then
    raise exception 'پرداخت آنلاین بدون تأیید سمت سرور، تأییدشده ثبت نمی‌شود.';
  end if;

  if new.verified_at is not null and new.tracking_code is null then
    raise exception 'پرداخت تأییدشده باید کد رهگیری داشته باشد.';
  end if;

  return new;
end;
$$;

create trigger payment_online_guard
  before insert or update on payment
  for each row execute function app.guard_online_payment();

-- ------------------------------------------------------------
-- مانده صورتحساب فقط از پرداخت‌های واقعی.
--
-- «واقعی» یعنی دستی (که مدیر خودش دیده) یا آنلاینِ تأییدشده. ردیف
-- pending در هیچ جمعی نمی‌آید.
-- ------------------------------------------------------------
create or replace function app.invoice_paid(target uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(amount), 0)::bigint
  from payment
  where invoice_id = target
    and (payment_method <> 'online' or verified_at is not null);
$$;

-- ------------------------------------------------------------
-- تأیید سمت سرور.
--
-- تنها راه رسیدن یک پرداخت آنلاین به حالت verified. security definer
-- است چون وب‌هوک با نقش سرویس می‌آید، نه با حساب والد.
-- ------------------------------------------------------------
create or replace function app.verify_online_payment(
  key text,
  ref text,
  tracking text
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  target uuid;
begin
  -- رسیدن دوباره وب‌هوک: همان ردیف برمی‌گردد، پرداخت دوم ساخته نمی‌شود.
  select id into target
  from payment
  where idempotency_key = key and verified_at is not null;
  if target is not null then
    return target;
  end if;

  update payment
  set gateway_state = 'verified',
      gateway_ref = ref,
      tracking_code = tracking,
      verified_at = now(),
      paid_at = now()
  where idempotency_key = key
    and gateway_state = 'pending'
  returning id into target;

  if target is null then
    raise exception 'تراکنش در انتظاری با این کلید پیدا نشد.';
  end if;

  return target;
end;
$$;

-- تراکنشی که واسط ناموفق اعلام کرده. مبلغ برنگشته، فقط نشانه‌گذاری.
create or replace function app.fail_online_payment(key text)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  update payment
  set gateway_state = 'failed'
  where idempotency_key = key and gateway_state = 'pending';
end;
$$;

-- ------------------------------------------------------------
-- باز کردن تراکنش، از سمت خانواده.
--
-- کلید واسط پرداخت هرگز به مرورگر نمی‌رسد: این تابع فقط ردیف انتظار را
-- می‌سازد و کلید ضدتکرار را برمی‌گرداند. ساختن نشانی درگاه و امضایش
-- کار تابع لبه است، با کلیدی که فقط سرور دارد.
-- ------------------------------------------------------------
create or replace function app.start_online_payment(invoice uuid)
returns table (
  payment_id uuid,
  idempotency_key text,
  redirect_url text,
  amount bigint,
  psp text
)
language plpgsql
security definer
set search_path = public, app
as $$
declare
  bill   invoice;
  due    bigint;
  key    text;
  made   uuid;
  chosen text := 'zibal';
begin
  select * into bill from invoice where id = invoice;
  if bill.id is null then
    raise exception 'صورتحساب پیدا نشد.';
  end if;
  if not app.can_see_child(bill.child_id) then
    raise exception 'این صورتحساب به شما مربوط نیست.';
  end if;

  due := bill.amount - bill.discount + bill.late_fee + bill.extra_charges
         - app.invoice_paid(bill.id);
  if due <= 0 then
    raise exception 'این صورتحساب تسویه شده است.';
  end if;

  key := 'idem-' || encode(gen_random_bytes(9), 'hex');

  insert into payment (center_id, invoice_id, amount, payment_method, psp, idempotency_key)
  values (bill.center_id, bill.id, due, 'online', chosen, key)
  returning id into made;

  return query select made, key, '/pay/' || key, due, chosen;
end;
$$;

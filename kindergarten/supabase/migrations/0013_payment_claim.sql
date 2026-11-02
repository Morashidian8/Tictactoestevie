-- ============================================================
-- اعلام پرداخت از سوی خانواده — بخش ۸ و ۶.۵
-- ============================================================
--
-- بخش ۸ فقط «ثبت پرداخت دستی و رسید» به دست مدیر را تعریف کرده. آنچه
-- نگفته این است: خانواده کارت‌به‌کارت می‌کند و بعد باید تلفنی خبر دهد.
-- این جدول همان خبر دادن است، نه خودِ پرداخت.
--
-- تفکیک عمدی: اعلام خانواده هرگز مستقیم به جدول payment نمی‌رود. تا
-- مدیر رسید را ندیده و تأیید نکرده، هیچ ریالی در دفتر مالی ثبت نمی‌شود.
-- وگرنه هر خانواده‌ای می‌توانست بدهی خودش را صفر کند.

create type app.claim_status as enum ('pending', 'approved', 'rejected');

create table payment_claim (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  invoice_id uuid not null references invoice(id) on delete restrict,
  amount bigint not null,
  -- عکس رسید. تا وصل شدن استوریج، نشانی محلی مرورگر است.
  receipt_url text,
  note text,
  status app.claim_status not null default 'pending',

  declared_by uuid references user_account(id) on delete set null,
  declared_at timestamptz not null default now(),
  reviewed_by uuid references user_account(id) on delete set null,
  reviewed_at timestamptz,
  -- اگر رد شد، دلیلش برای خانواده نوشته می‌شود.
  reject_reason text,
  -- پرداختی که پس از تأیید ساخته شد.
  payment_id uuid references payment(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_claim_amount_positive check (amount > 0),
  constraint payment_claim_reviewed_has_reviewer
    check ((status = 'pending') = (reviewed_at is null)),
  constraint payment_claim_rejected_has_reason
    check (status <> 'rejected' or reject_reason is not null)
);

create index payment_claim_pending_idx
  on payment_claim (center_id, declared_at) where status = 'pending';

create trigger payment_claim_touch before update on payment_claim
  for each row execute function app.touch_updated_at();

-- ── سیاست سطر-محور ─────────────────────────────────────────────
alter table payment_claim enable row level security;
alter table payment_claim force row level security;

-- فقط سرپرست پرداخت‌کننده اعلام می‌کند و اعلام خودش را می‌بیند — بخش ۶.۵.
create policy payment_claim_visible on payment_claim
  for select using (
    center_id = app.current_center_id()
    and (
      app.is_manager()
      or exists (
        select 1 from invoice i
        where i.id = invoice_id
          and app.current_role() = 'guardian'
          and app.is_payer_for(i.child_id)
      )
    )
  );

create policy payment_claim_guardian_insert on payment_claim
  for insert with check (
    center_id = app.current_center_id()
    and status = 'pending'
    and exists (
      select 1 from invoice i
      where i.id = invoice_id
        and app.current_role() = 'guardian'
        and app.is_payer_for(i.child_id)
    )
  );

-- تصمیم فقط با مدیر است. خانواده اعلام خودش را هم نمی‌تواند تأیید کند.
create policy payment_claim_manager_write on payment_claim
  for update using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

-- ── رد پا ──────────────────────────────────────────────────────
create trigger audit_payment_claim
  after insert or update or delete on payment_claim
  for each row execute function app.write_audit();

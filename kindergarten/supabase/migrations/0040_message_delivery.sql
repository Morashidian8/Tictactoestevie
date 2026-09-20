-- ============================================================
-- صفِ ساعت کاری، واقعی می‌شود
--
-- بخش ۶.۶ یک جمله است و زیر کادرِ نوشتن هم به خانواده وعده داده
-- می‌شود: «نوشتن همیشه آزاد است؛ رسیدن است که صبر می‌کند.»
--
-- ارتقای ۰۰۲۹ ستون `queued_until` را ساخت و درست هم پرش کرد، ولی هیچ
-- جا از آن نخواند. نتیجه، دو دروغ در یک ستون:
--
--   ۱. **پیامِ در صف، همان لحظه دیده می‌شد.** سیاست `message_visible`
--      فقط عضویت در گفتگو را می‌سنجید، پس مربی نصف‌شب پیام را می‌خواند
--      در حالی که بالای صفحه نوشته بود «صبح تحویل می‌شود».
--   ۲. **و هیچ‌وقت «رسیده» نمی‌شد.** چیزی `sent_at` را پر نمی‌کرد، پس
--      آن پیام تا ابد از پیش‌نمایش و شمارِ نخوانده‌ها غایب می‌ماند.
--
-- قاعده‌ای که این مهاجرت بر آن سوار است: **صف یک زمانِ تحویل است، نه
-- حالتی که کسی باید بعداً عوضش کند.** پس هیچ کار زمان‌بندی‌شده‌ای لازم
-- نیست — گذشتنِ ساعت خودش تحویل است، و مهدی که کرون ندارد هم درست کار
-- می‌کند.
-- ============================================================

/**
 * لحظه‌ای که پیام رسیده حساب می‌شود.
 *
 * `sent_at` برای پیامی که در ساعت کاری رفته، و `queued_until` برای
 * پیامی که پشت صف مانده. یک‌جا تعریف می‌شود تا سیاستِ دیدن و شمارِ
 * نخوانده‌ها نتوانند دو جواب بدهند.
 */
create function app.message_delivered_at(sent_at timestamptz, queued_until timestamptz)
returns timestamptz
language sql immutable as $$
  select coalesce(sent_at, queued_until)
$$;

-- ────────────────────────────────────────────────────────────
-- ۱. بازگشتِ بی‌پایانِ سیاست عضویت
-- ────────────────────────────────────────────────────────────
/*
 * باگی که همین‌جا بیرون زد و ربطی به صف ندارد، ولی جلوی کل خواندنِ
 * گفتگو را می‌گرفت.
 *
 * سیاستِ `conversation_member_visible` برای دیدن یک سطر از همان جدول،
 * از **خودِ همان جدول** می‌پرسید. تا وقتی همه‌چیز از راه توابع
 * `security definer` خوانده می‌شد کسی متوجه نشد؛ ولی کلاینت رشتهٔ
 * پیام‌ها را مستقیم از جدول `message` می‌خواند، و سیاستِ آن هم به
 * `conversation_member` سر می‌زد. نتیجه روی کاربر واقعی:
 * «infinite recursion detected in policy».
 *
 * یک تابع `security definer` حلقه را می‌بُرد: داخلش سیاست‌ها اعمال
 * نمی‌شوند، پس پرسش تمام می‌شود.
 */
create function app.in_conversation(chat uuid, who uuid)
returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from conversation_member m
     where m.conversation_id = chat and m.user_account_id = who
  )
$$;

drop policy if exists conversation_member_visible on conversation_member;
create policy conversation_member_visible on conversation_member
  for select using (
    center_id = app.current_center_id()
    and app.in_conversation(conversation_member.conversation_id, app.current_account_id())
  );

drop policy if exists conversation_visible on conversation;
create policy conversation_visible on conversation
  for select using (
    center_id = app.current_center_id()
    and app.in_conversation(conversation.id, app.current_account_id())
  );

-- ────────────────────────────────────────────────────────────
-- ۲. پیامِ نرسیده را فقط فرستنده‌اش می‌بیند
-- ────────────────────────────────────────────────────────────
/*
 * فرستنده پیام خودش را همیشه می‌بیند — با برچسب «در صف تا …» — ولی
 * گیرنده تا وقت تحویل نه.
 *
 * این در سیاست است نه در تابعِ خواندن: کلاینت مستقیم از جدول `message`
 * می‌خواند، و قاعده‌ای که فقط در یک تابع باشد، اولین کسی که مستقیم
 * پرس‌وجو بزند دورش می‌زند.
 */
drop policy if exists message_visible on message;

create policy message_visible on message
  for select using (
    (
      thread_id is not null
      and exists (select 1 from message_thread t
                   where t.id = thread_id and app.can_see_child(t.child_id))
    )
    or (
      conversation_id is not null
      and app.in_conversation(message.conversation_id, app.current_account_id())
      and (
        sender_id = app.current_account_id()
        or app.message_delivered_at(sent_at, queued_until) <= now()
      )
    )
  );

-- ────────────────────────────────────────────────────────────
-- ۳. صندوق: پیش‌نمایش و شمارش، هر دو از «رسیده‌ها»
-- ────────────────────────────────────────────────────────────
create or replace function app.my_conversations()
returns table (
  conversation_id uuid,
  other_account_id uuid,
  other_name text,
  other_role app.account_role,
  child_id uuid,
  child_name text,
  last_message_at timestamptz,
  last_body text,
  unread integer
)
language sql
stable
security definer
set search_path = public, app
as $$
  with me as (select app.current_account_id() as id)
  select
    c.id,
    ob.user_account_id,
    coalesce(s.full_name, g.full_name, '—'),
    ua.role,
    c.child_id,
    (select ch.first_name || ' ' || ch.last_name from child ch where ch.id = c.child_id),
    /*
     * ترتیب فهرست از وقتِ **تحویل** است، نه وقتِ نوشتن.
     *
     * `conversation.last_message_at` لحظهٔ نوشتن را نگه می‌دارد؛ پیامی
     * که ساعت یازده شب نوشته شده باید صبح بالای صندوق بیاید، نه دیشب.
     */
    (select max(app.message_delivered_at(m.sent_at, m.queued_until)) from message m
      where m.conversation_id = c.id
        and app.message_delivered_at(m.sent_at, m.queued_until) <= now()),
    (select m.body from message m
      where m.conversation_id = c.id
        and app.message_delivered_at(m.sent_at, m.queued_until) <= now()
      order by app.message_delivered_at(m.sent_at, m.queued_until) desc, m.created_at desc
      limit 1),
    (select count(*)::integer from message m
      where m.conversation_id = c.id
        and app.message_delivered_at(m.sent_at, m.queued_until) <= now()
        and m.sender_id <> (select id from me)
        and (mine.read_at is null
             or app.message_delivered_at(m.sent_at, m.queued_until) > mine.read_at))
  from conversation c
  join conversation_member mine
    on mine.conversation_id = c.id and mine.user_account_id = (select id from me)
  join conversation_member ob
    on ob.conversation_id = c.id and ob.user_account_id <> (select id from me)
  join user_account ua on ua.id = ob.user_account_id
  left join staff s on s.id = ua.staff_id
  left join guardian g on g.id = ua.guardian_id
  order by 7 desc nulls last
$$;

comment on function app.message_delivered_at(timestamptz, timestamptz) is
  'زمان تحویل پیام. صف یک زمان است، نه حالتی که کسی باید عوضش کند.';

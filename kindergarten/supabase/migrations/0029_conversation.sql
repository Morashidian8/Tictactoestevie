-- ============================================================
-- گفتگوی نفر به نفر، بین هر سه نقش
-- ============================================================
--
-- خواسته مالک محصول: «سرپرست انتخاب کنه به کدوم مربی می‌خواد پیام بده.
-- مربی به هر سرپرستی که خواست بتونه پیام بده و مدیر هم به هر مربی یا
-- سرپرستی خواست بتونه جداگانه پیام بده و گفت و گو کنه».
--
-- آنچه بود: `message_thread` با قید `unique (child_id)` — یعنی هر کودک
-- دقیقاً یک گفتگو داشت و همه مربیانِ کلاس و همه سرپرستانِ کودک در همان
-- یک اتاق بودند. سه چیز را نمی‌شد گفت:
--   • این پیام برای کدام مربی است
--   • مدیر چطور با یک مربی حرف بزند (کودکی در میان نیست)
--   • مربی چطور فقط به یکی از دو سرپرست بگوید
--
-- ── پنج تصمیمی که این مهاجرت می‌گیرد و باید صریح بماند ────────
--
-- الف) **گفتگو بین دو حساب است، نه بین دو نفر.** یک نفر می‌تواند هم
--      مربی باشد هم سرپرست (بخش ۳.۲) و آن دو، دو گفتگوی جداگانه‌اند:
--      پیامی که به او به‌عنوان مربی رسیده نباید در صندوق سرپرستی‌اش
--      دیده شود.
--
-- ب) **کودک، زمینه است نه طرف گفتگو.** گفتگوی سرپرست و مربی درباره یک
--      کودک است و `child_id` دارد؛ گفتگوی مدیر و مربی ندارد. پس
--      nullable، و دو گفتگوی یک جفت درباره دو کودک، دو گفتگوی جدایند.
--
-- ج) **هیچ شماره‌ای جابه‌جا نمی‌شود.** گفتگو شناسه حساب را نگه می‌دارد،
--      نه تلفن. همان قاعده‌ای که نسخه پیشین هم داشت.
--
-- د) **ساعت کاری فقط بین خانواده و کارکنان.** بخش ۶.۶ درباره پیام
--      سرپرست است. مدیر که شب یازده به مربی می‌نویسد، پیامش نباید تا
--      صبح در صف بماند — آن یک قاعده محافظت از خانواده است، نه یک
--      قاعده عمومی.
--
-- ه) **گفتگوی تازه با هر کسی ساخته نمی‌شود.** چه کسی می‌تواند به چه
--      کسی پیام بدهد، تابعی در پایگاه داده است نه فهرستی در کلاینت:
--      سرپرست فقط به مربیانِ کلاسِ کودک خودش و به مدیر؛ مربی به
--      سرپرستانِ کودکانِ کلاسش و به مدیر؛ مدیر به همه.
-- ============================================================

create table conversation (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  /* زمینه گفتگو. گفتگوی مدیر و مربی کودکی در میان ندارد. */
  child_id uuid references child(id) on delete cascade,
  created_by uuid references user_account(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);
create index conversation_center_idx on conversation (center_id, last_message_at desc);

create table conversation_member (
  conversation_id uuid not null references conversation(id) on delete cascade,
  user_account_id uuid not null references user_account(id) on delete cascade,
  center_id uuid not null references center(id) on delete restrict,
  /* آخرین باری که این عضو گفتگو را باز کرد — پایه شمار نخوانده‌ها. */
  read_at timestamptz,
  primary key (conversation_id, user_account_id)
);
create index conversation_member_account_idx on conversation_member (user_account_id);

/*
 * یک گفتگو برای هر جفت و هر زمینه.
 *
 * بی این، هر بار که کسی «پیام تازه» می‌زد گفتگوی دومی ساخته می‌شد و
 * تاریخچه دو تکه می‌شد. کلید، جفتِ مرتب‌شده است تا «الف به ب» و «ب به
 * الف» یکی باشند.
 */
alter table conversation
  add column pair_key text;

create unique index conversation_pair_unique
  on conversation (center_id, pair_key, coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table message
  add column conversation_id uuid references conversation(id) on delete cascade;
create index message_conversation_idx on message (conversation_id, created_at);

comment on column message.thread_id is
  'ستون نسل پیشین — گفتگوی کودک‌محور. پیام تازه روی conversation_id می‌نشیند.';

/*
 * thread_id دیگر اجباری نیست.
 *
 * پیام‌های نسل پیشین سر جایشان می‌مانند (حذف داده گفتگو با خانواده،
 * کار این مهاجرت نیست) ولی پیام تازه گفتگو دارد، نه رشته کودک‌محور.
 */
alter table message alter column thread_id drop not null;

alter table message
  add constraint message_has_a_home
  check (thread_id is not null or conversation_id is not null);

-- ------------------------------------------------------------
-- چه کسی می‌تواند به چه کسی پیام بدهد
--
-- در پایگاه داده، نه در کلاینت: فهرست سمت کلاینت فقط رابط را می‌سازد،
-- و اگر تنها مرجع باشد، یک درخواست دستی از آن رد می‌شود.
-- ------------------------------------------------------------
create or replace function app.may_message(from_account uuid, to_account uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  with a as (select * from user_account where id = from_account),
       b as (select * from user_account where id = to_account)
  select exists (
    select 1 from a, b
    where a.center_id = b.center_id
      and a.id <> b.id
      and a.active and b.active
      and (
        -- مدیر با همه، و همه با مدیر.
        a.role = 'manager' or b.role = 'manager'

        -- سرپرست با مربیِ کلاسِ کودک خودش.
        or (a.role = 'guardian' and b.role = 'teacher' and exists (
          select 1
            from child_guardian cg
            join child c on c.id = cg.child_id
            join staff_class sc on sc.class_id = c.class_id
           where cg.guardian_id = a.guardian_id and sc.staff_id = b.staff_id
        ))

        -- و همان، از سمت مربی.
        or (a.role = 'teacher' and b.role = 'guardian' and exists (
          select 1
            from child_guardian cg
            join child c on c.id = cg.child_id
            join staff_class sc on sc.class_id = c.class_id
           where cg.guardian_id = b.guardian_id and sc.staff_id = a.staff_id
        ))
      )
  )
$$;

-- ------------------------------------------------------------
-- باز کردن یا پیدا کردن گفتگو
--
-- دوباره‌اجراپذیر: دو بار زدن «پیام تازه» گفتگوی دوم نمی‌سازد.
-- ------------------------------------------------------------
create or replace function app.open_conversation(other uuid, about uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  me     uuid := app.current_account_id();
  centre uuid := app.current_center_id();
  key    text;
  found  uuid;
begin
  if me is null then
    raise exception 'حساب فعالی پیدا نشد.';
  end if;
  if not app.may_message(me, other) then
    raise exception 'شما نمی‌توانید به این حساب پیام بدهید.';
  end if;
  if about is not null and not app.can_see_child(about) then
    raise exception 'این کودک به شما مربوط نیست.';
  end if;

  -- جفتِ مرتب‌شده: «الف به ب» و «ب به الف» یک گفتگواند.
  key := least(me::text, other::text) || '|' || greatest(me::text, other::text);

  select id into found
    from conversation
   where center_id = centre and pair_key = key
     and coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(about, '00000000-0000-0000-0000-000000000000'::uuid);
  if found is not null then
    return found;
  end if;

  insert into conversation (center_id, child_id, created_by, pair_key)
  values (centre, about, me, key)
  returning id into found;

  insert into conversation_member (conversation_id, user_account_id, center_id)
  values (found, me, centre), (found, other, centre);

  return found;
end;
$$;

-- ------------------------------------------------------------
-- فرستادن پیام
--
-- ساعت کاری فقط وقتی اعمال می‌شود که یک سرِ گفتگو خانواده باشد —
-- بخش ۶.۶ قاعده محافظت از خانواده است، نه یک قاعده عمومی.
-- ------------------------------------------------------------
/*
 * نام پارامتر عمداً `chat` است نه `conversation`.
 *
 * هم‌نام بودن با جدول، هر ارجاع را مبهم می‌کند و پستگرس همان‌جا رد
 * می‌کند — که بهتر از این است که بی‌صدا جدول را بخواند.
 */
create or replace function app.send_message(chat uuid, body text)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  me       uuid := app.current_account_id();
  centre   uuid := app.current_center_id();
  has_family boolean;
  opens    time;
  closes   time;
  queue_to timestamptz;
  made     uuid;
begin
  if nullif(btrim(coalesce(body, '')), '') is null then
    raise exception 'پیام خالی فرستاده نمی‌شود.';
  end if;
  if not exists (
    select 1 from conversation_member
     where conversation_id = chat and user_account_id = me
  ) then
    raise exception 'شما عضو این گفتگو نیستید.';
  end if;

  select exists (
    select 1
      from conversation_member m
      join user_account ua on ua.id = m.user_account_id
     where m.conversation_id = chat and ua.role = 'guardian'
  ) into has_family;

  select parent_message_start, parent_message_end into opens, closes
    from center where id = centre;

  /*
   * بیرون از ساعت کاری، پیام تا صبح در صف می‌ماند — بخش ۶.۶.
   *
   * نوشتن آزاد است؛ رسیدن است که صبر می‌کند. جلوگیری از نوشتن یعنی
   * والدی که نصفه‌شب نگران است، هیچ راهی ندارد.
   */
  if has_family and (localtime < opens or localtime > closes) then
    queue_to := case
      when localtime > closes then (current_date + 1) + opens
      else current_date + opens
    end;
  end if;

  insert into message (center_id, conversation_id, sender_id, body, sent_at, queued_until)
  values (
    centre, chat, me, btrim(body),
    case when queue_to is null then now() else null end,
    queue_to
  )
  returning id into made;

  update conversation set last_message_at = now() where id = chat;
  return made;
end;
$$;

-- ------------------------------------------------------------
-- صندوق: گفتگوهای من
--
-- «طرف مقابل» یک نفر است، پس نامش همان‌جا ساخته می‌شود — کلاینت لازم
-- نیست برای هر ردیف یک پرس‌وجوی دیگر بزند.
-- ------------------------------------------------------------
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
    c.last_message_at,
    (select m.body from message m
      where m.conversation_id = c.id and m.sent_at is not null
      order by m.created_at desc limit 1),
    (select count(*)::integer from message m
      where m.conversation_id = c.id
        and m.sent_at is not null
        and m.sender_id <> (select id from me)
        and (mine.read_at is null or m.sent_at > mine.read_at))
  from conversation c
  join conversation_member mine
    on mine.conversation_id = c.id and mine.user_account_id = (select id from me)
  join conversation_member ob
    on ob.conversation_id = c.id and ob.user_account_id <> (select id from me)
  join user_account ua on ua.id = ob.user_account_id
  left join staff s on s.id = ua.staff_id
  left join guardian g on g.id = ua.guardian_id
  order by c.last_message_at desc nulls last
$$;

-- ------------------------------------------------------------
-- با چه کسانی می‌توانم گفتگوی تازه باز کنم
--
-- همان تابع مجوز، برعکس: رابط از این می‌خواند تا فهرست انتخاب بسازد،
-- و چون هر دو از یک قاعده می‌خوانند، فهرست و مجوز نمی‌توانند فرق کنند.
-- ------------------------------------------------------------
create or replace function app.message_candidates()
returns table (
  account_id uuid,
  full_name text,
  account_role app.account_role,
  /* برای سرپرست: مربیِ کدام کلاس. برای بقیه خالی. */
  context text
)
language sql
stable
security definer
set search_path = public, app
as $$
  select ua.id,
         coalesce(s.full_name, g.full_name, '—'),
         ua.role,
         case
           when ua.role = 'teacher' then (
             select string_agg(cl.name, '، ')
               from staff_class sc join class cl on cl.id = sc.class_id
              where sc.staff_id = ua.staff_id
           )
           when ua.role = 'guardian' then (
             select string_agg(distinct ch.first_name || ' ' || ch.last_name, '، ')
               from child_guardian cg join child ch on ch.id = cg.child_id
              where cg.guardian_id = ua.guardian_id
           )
         end
    from user_account ua
    left join staff s on s.id = ua.staff_id
    left join guardian g on g.id = ua.guardian_id
   where ua.center_id = app.current_center_id()
     and ua.active
     and app.may_message(app.current_account_id(), ua.id)
   order by ua.role, 2
$$;

/** خواندن گفتگو. شمار نخوانده‌ها از همین‌جا صفر می‌شود. */
create or replace function app.mark_conversation_read(chat uuid)
returns void
language sql
security definer
set search_path = public, app
as $$
  update conversation_member
     set read_at = now()
   where conversation_id = chat
     and user_account_id = app.current_account_id()
$$;

-- ------------------------------------------------------------
-- سیاست سطر-محور
-- ------------------------------------------------------------
alter table conversation enable row level security;
alter table conversation force row level security;
alter table conversation_member enable row level security;
alter table conversation_member force row level security;

/*
 * فقط عضو گفتگو، گفتگو را می‌بیند — مدیر هم استثنا نیست.
 *
 * مدیر می‌تواند با هر کسی گفتگو باز کند، ولی گفتگوی مربی و سرپرست
 * خصوصی است. حق مدیریت، حق خواندنِ مکالمه دیگران نیست.
 */
create policy conversation_visible on conversation
  for select using (
    center_id = app.current_center_id()
    and exists (
      select 1 from conversation_member m
       where m.conversation_id = conversation.id
         and m.user_account_id = app.current_account_id()
    )
  );

create policy conversation_member_visible on conversation_member
  for select using (
    center_id = app.current_center_id()
    and exists (
      select 1 from conversation_member mine
       where mine.conversation_id = conversation_member.conversation_id
         and mine.user_account_id = app.current_account_id()
    )
  );

/*
 * پیام تازه فقط از راه app.send_message.
 *
 * تابع است که عضویت را بررسی و صف ساعت کاری را اعمال می‌کند؛ insert
 * مستقیم یعنی می‌شود پیام را با sent_at دلخواه نوشت و از صف گذشت.
 */
drop policy if exists message_visible on message;
drop policy if exists message_insert on message;

create policy message_visible on message
  for select using (
    (
      thread_id is not null
      and exists (select 1 from message_thread t
                   where t.id = thread_id and app.can_see_child(t.child_id))
    )
    or (
      conversation_id is not null
      and exists (select 1 from conversation_member m
                   where m.conversation_id = message.conversation_id
                     and m.user_account_id = app.current_account_id())
    )
  );

create policy message_legacy_insert on message
  for insert with check (
    center_id = app.current_center_id()
    and thread_id is not null
    and exists (select 1 from message_thread t
                 where t.id = thread_id and app.can_see_child(t.child_id))
  );

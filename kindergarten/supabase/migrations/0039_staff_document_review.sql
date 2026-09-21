-- ============================================================
-- مدارک مربی: مربی بارگذاری می‌کند، مدیر تأیید می‌کند
--
-- خواسته مالک محصول: «مربی‌ها تمام مدارکی که مدیر می‌خواد باید خودشون
-- تو پنل خودشون بارگذاری کنن و بعد از تأیید مدیر ثبت بشه براشون.»
--
-- ارتقای ۰۰۲۲ جدول staff_document را ساخت و درست هم اجازه داد مربی در
-- آن بنویسد («مدرکی که فقط مدیر بتواند بارگذاری کند، هرگز بارگذاری
-- نمی‌شود»). ولی دو چیز نداشت و بدون آن‌ها این جریان کار نمی‌کند:
--
--   ۱. **حالت تأیید.** هر چیزی که مربی می‌فرستاد، همان لحظه می‌شد
--      «مدرکِ ثبت‌شده» — یعنی عکسِ تارِ یک کاغذِ بی‌ربط هم پرونده
--      بازرسی را سبز می‌کرد. مهد روز بازرسی می‌فهمید.
--
--   ۲. **فهرست آنچه لازم است.** مربی نمی‌دانست چه باید بدهد و مدیر
--      نمی‌دانست چه کم دارد. «مدارکتان را بیاورید» یک بار در گروه
--      تلگرام گفته می‌شد و تمام.
--
-- قاعده‌ای که کل این مهاجرت بر آن سوار است: **مدرکِ تأییدنشده، مدرک
-- نیست.** هرجا شمارشی هست — کاستی‌های مربی، آمادگی بازرسی — فقط
-- مدرکِ تأییدشده شمرده می‌شود.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ۱. حالت تأیید روی خودِ مدرک
-- ────────────────────────────────────────────────────────────
create type app.document_review as enum ('pending', 'approved', 'rejected');

/*
 * پیش‌فرض 'pending' است، ولی سطرهای موجود 'approved' می‌شوند: آنچه تا
 * امروز در جدول است، مدیر خودش بارگذاری کرده. عقب‌گرد گذاشتنشان روی
 * «در انتظار» یعنی پرونده بازرسیِ مهدی که آماده بود، یک‌شبه قرمز شود.
 */
alter table staff_document add column review app.document_review not null default 'pending';
update staff_document set review = 'approved';

alter table staff_document add column reviewed_at timestamptz;
alter table staff_document add column reviewed_by uuid references user_account(id) on delete set null;
/*
 * دلیلِ رد، کنار خودِ مدرک.
 *
 * همان درسِ مرخصی در ۰۰۳۴: مربی‌ای که بی‌دلیل «نه» می‌شنود، دفعه بعد
 * عکسِ همان کاغذ را دوباره می‌فرستد.
 */
alter table staff_document add column review_note text;

create index staff_document_pending_idx on staff_document (center_id, uploaded_at)
  where review = 'pending';

comment on column staff_document.review is
  'تأییدنشده یعنی نشمرده. پرونده بازرسی و کاستی‌های مربی فقط approved را می‌بینند.';

-- ────────────────────────────────────────────────────────────
-- ۲. فهرست مدارکی که مدیر می‌خواهد
-- ────────────────────────────────────────────────────────────
/*
 * فهرست **داده است، نه کد** — همان استدلال چک‌لیست بازرسی در ۰۰۲۳:
 * مقررات از استانی به استان دیگر فرق دارد و مهدِ خصوصی چیزی می‌خواهد
 * که مهدِ دولتی نمی‌خواهد.
 */
create table staff_document_requirement (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete cascade,
  kind app.staff_document_kind not null,
  title text not null,
  /* توضیح برای مربی: «کارت بهداشتِ امسال، نه پارسال». */
  note text,
  /*
   * آیا تاریخ انقضا لازم است. کارت بهداشت بله، مدرک تحصیلی نه — و
   * اجبارِ تاریخ روی مدرکی که تاریخ ندارد، مربی را وادار می‌کند
   * تاریخِ الکی بزند.
   */
  needs_expiry boolean not null default false,
  sort_order integer not null default 100,
  active boolean not null default true,

  constraint staff_document_requirement_title check (length(btrim(title)) between 1 and 120),
  /* یک قلم از هر نوع بس است؛ دو «کارت بهداشت» یعنی مربی دو بار بفرستد. */
  unique (center_id, kind)
);

create index staff_document_requirement_center_idx
  on staff_document_requirement (center_id, sort_order) where active;

comment on table staff_document_requirement is
  'چه مدارکی مدیر از هر مربی می‌خواهد. مربی همین فهرست را در پنل خودش می‌بیند.';

/*
 * فهرست آغازین، برابر با همان سه قلمی که چک‌لیست بازرسیِ ۰۰۲۳ از
 * مربیان می‌خواست، به‌علاوه کارت ملی. مهد می‌تواند کم و زیادش کند.
 */
create function app.seed_document_requirements(centre uuid)
returns void
language sql security definer set search_path = public, app as $$
  insert into staff_document_requirement (center_id, kind, title, note, needs_expiry, sort_order)
  select centre, v.kind::app.staff_document_kind, v.title, v.note, v.needs_expiry, v.sort_order
    from (values
      ('health_card',     'کارت بهداشت',         'کارت بهداشتِ معتبر، با تاریخ اعتبار خوانا.', true,  10),
      ('criminal_record', 'گواهی عدم سوءپیشینه', 'برای پرونده بازرسی لازم است.',              true,  20),
      ('national_id',     'کارت ملی',            'هر دو رو.',                                  false, 30),
      ('degree',          'مدرک تحصیلی',         'آخرین مدرک.',                                false, 40)
    ) as v(kind, title, note, needs_expiry, sort_order)
  on conflict (center_id, kind) do nothing
$$;

select app.seed_document_requirements(c.id) from center c;

/*
 * مهدِ تازه هم با همین فهرست شروع می‌کند.
 *
 * فهرستِ خالی یعنی صفحه «مدارک من» مربی می‌گوید «چیزی از شما خواسته
 * نشده» — و مدیری که تازه اپ را باز کرده، هرگز نمی‌فهمد این فهرست
 * وجود دارد که پرش کند.
 */
create function app.seed_document_requirements_on_center()
returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.seed_document_requirements(new.id);
  return new;
end
$$;

create trigger center_document_requirements
  after insert on center
  for each row execute function app.seed_document_requirements_on_center();

-- ────────────────────────────────────────────────────────────
-- ۳. بارگذاری — یک در، دو رفتار
-- ────────────────────────────────────────────────────────────
/*
 * مدیر که بارگذاری می‌کند، مدرک همان لحظه تأیید است: کسی نمانده که
 * تأییدش کند و یک صف انتظارِ تک‌نفره فقط کار را کند می‌کند.
 *
 * مربی که بارگذاری می‌کند، 'pending' است و خودش نمی‌تواند این را عوض
 * کند — کل نکته همین است.
 */
create function app.submit_staff_document(
  target uuid,
  doc_kind app.staff_document_kind,
  doc_title text,
  file_url text,
  issued_at date default null,
  expires_at date default null
)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  centre uuid := app.current_center_id();
  me uuid := app.current_account_id();
  mine uuid := (select staff_id from user_account where id = me);
  boss boolean := app.is_manager();
  made uuid;
begin
  if centre is null then
    raise exception 'مرکز مشخص نیست';
  end if;

  if not boss and (mine is null or mine <> target) then
    raise exception 'فقط مدارک خودتان را می‌توانید بارگذاری کنید';
  end if;

  if not exists (select 1 from staff where id = target and center_id = centre) then
    raise exception 'این مربی در این مرکز نیست';
  end if;

  insert into staff_document (
    center_id, staff_id, kind, title, file_url, issued_at, expires_at,
    uploaded_by, review, reviewed_at, reviewed_by
  ) values (
    centre, target, doc_kind, btrim(doc_title), file_url,
    submit_staff_document.issued_at, submit_staff_document.expires_at,
    me,
    case when boss then 'approved' else 'pending' end::app.document_review,
    case when boss then now() end,
    case when boss then me end
  )
  returning id into made;

  return made;
end
$$;

-- ────────────────────────────────────────────────────────────
-- ۴. تأیید یا رد
-- ────────────────────────────────────────────────────────────
create function app.review_staff_document(
  document uuid,
  approve boolean,
  note text default null
)
returns void
language plpgsql security definer set search_path = public, app as $$
declare
  centre uuid := app.current_center_id();
begin
  if not app.is_manager() then
    raise exception 'فقط مدیر مدرک را تأیید می‌کند';
  end if;

  /*
   * رد بدون دلیل نمی‌شود.
   *
   * مربی‌ای که فقط «رد شد» می‌بیند، همان عکس را دوباره می‌فرستد —
   * و مدیر دوباره ردش می‌کند. یک جمله این حلقه را می‌بندد.
   */
  if not approve and length(btrim(coalesce(note, ''))) = 0 then
    raise exception 'دلیل رد را بنویسید';
  end if;

  update staff_document d
     set review = case when approve then 'approved' else 'rejected' end::app.document_review,
         reviewed_at = now(),
         reviewed_by = app.current_account_id(),
         review_note = nullif(btrim(coalesce(note, '')), '')
   where d.id = document and d.center_id = centre;

  if not found then
    raise exception 'مدرک پیدا نشد';
  end if;
end
$$;

-- ────────────────────────────────────────────────────────────
-- ۵. نماها
-- ────────────────────────────────────────────────────────────
/*
 * app.staff_documents حالا حالت تأیید را هم می‌دهد. امضایش عوض می‌شود،
 * پس اول کهنه را می‌اندازیم — وگرنه پستگرس دومی را **سربار** می‌سازد
 * و هر صدا زدنی مبهم می‌شود.
 */
drop function if exists app.staff_documents(uuid, uuid);

create function app.staff_documents(centre uuid, target uuid)
returns table (
  id uuid,
  kind app.staff_document_kind,
  title text,
  file_url text,
  issued_at date,
  expires_at date,
  state text,
  uploaded_at timestamptz,
  review app.document_review,
  review_note text,
  reviewed_at timestamptz
)
language sql stable security definer set search_path = public, app as $$
  select d.id, d.kind, d.title, d.file_url, d.issued_at, d.expires_at,
         app.document_state(d.expires_at), d.uploaded_at,
         d.review, d.review_note, d.reviewed_at
    from staff_document d
   where d.staff_id = target
     and d.center_id = centre
   order by d.review = 'pending' desc, d.kind, d.expires_at nulls last
$$;

/**
 * چک‌لیست مدارک یک مربی: هر قلمِ خواسته‌شده، و آخرین چیزی که برایش آمده.
 *
 * یک ردیف برای هر **خواسته**، نه برای هر مدرک. مربی باید ببیند چه کم
 * دارد؛ فهرستی که فقط داشته‌ها را نشان بدهد، همان کشوی کاغذِ قدیم است.
 */
create function app.staff_document_checklist(centre uuid, target uuid, at date default current_date)
returns table (
  requirement_id uuid,
  kind app.staff_document_kind,
  title text,
  note text,
  needs_expiry boolean,
  document_id uuid,
  review app.document_review,
  review_note text,
  expires_at date,
  state text
)
language sql stable security definer set search_path = public, app as $$
  select
    r.id, r.kind, r.title, r.note, r.needs_expiry,
    d.id, d.review, d.review_note, d.expires_at,
    case
      when d.id is null then 'missing'
      when d.review = 'pending' then 'pending'
      when d.review = 'rejected' then 'rejected'
      else app.document_state(d.expires_at, at)
    end
  from staff_document_requirement r
  /*
   * آخرین مدرکِ همان نوع، با این ترتیب: تأییدشده مقدم است، بعد
   * تازه‌ترین. مربی‌ای که مدرک تأییدشده دارد و تازه یکی دیگر فرستاده،
   * نباید ردیفش «در انتظار» شود — مدرکش معتبر است.
   */
  left join lateral (
    select d2.*
      from staff_document d2
     where d2.staff_id = target and d2.center_id = centre and d2.kind = r.kind
     order by (d2.review = 'approved') desc, d2.uploaded_at desc
     limit 1
  ) d on true
  where r.center_id = centre and r.active
  order by r.sort_order, r.title
$$;

/** صف تأیید مدیر: هرچه مربیان فرستاده‌اند و هنوز جواب نگرفته. */
create function app.staff_document_queue(centre uuid)
returns table (
  id uuid,
  staff_id uuid,
  full_name text,
  kind app.staff_document_kind,
  title text,
  file_url text,
  issued_at date,
  expires_at date,
  uploaded_at timestamptz
)
language sql stable security definer set search_path = public, app as $$
  select d.id, s.id, s.full_name, d.kind, d.title, d.file_url,
         d.issued_at, d.expires_at, d.uploaded_at
    from staff_document d
    join staff s on s.id = d.staff_id
   where d.center_id = centre and d.review = 'pending'
   order by d.uploaded_at
$$;

/** فهرست مدارک لازم، برای صفحه تنظیمِ مدیر. */
create function app.staff_document_requirements(centre uuid)
returns table (
  id uuid,
  kind app.staff_document_kind,
  title text,
  note text,
  needs_expiry boolean
)
language sql stable security definer set search_path = public, app as $$
  select r.id, r.kind, r.title, r.note, r.needs_expiry
    from staff_document_requirement r
   where r.center_id = centre and r.active
   order by r.sort_order, r.title
$$;

create function app.set_staff_document_requirement(
  doc_kind app.staff_document_kind,
  req_title text,
  req_note text default null,
  expiry_needed boolean default false
)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  centre uuid := app.current_center_id();
  made uuid;
begin
  if not app.is_manager() then
    raise exception 'فقط مدیر فهرست مدارک را می‌چیند';
  end if;

  insert into staff_document_requirement (center_id, kind, title, note, needs_expiry)
  values (centre, doc_kind, btrim(req_title), nullif(btrim(coalesce(req_note, '')), ''), expiry_needed)
  on conflict (center_id, kind) do update
    set title = excluded.title,
        note = excluded.note,
        needs_expiry = excluded.needs_expiry,
        active = true
  returning id into made;

  return made;
end
$$;

/*
 * برداشتن یک قلم، نرم است.
 *
 * حذفِ سخت یعنی مدارکی که به خاطرش بارگذاری شده‌اند، بی‌پدر شوند و
 * چک‌لیستِ پارسال دیگر قابل بازسازی نباشد.
 */
create function app.drop_staff_document_requirement(requirement uuid)
returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_manager() then
    raise exception 'فقط مدیر فهرست مدارک را می‌چیند';
  end if;

  update staff_document_requirement
     set active = false
   where id = requirement and center_id = app.current_center_id();

  if not found then
    raise exception 'این قلم پیدا نشد';
  end if;
end
$$;

-- ────────────────────────────────────────────────────────────
-- ۶. مدرکِ تأییدنشده جایی شمرده نمی‌شود
-- ────────────────────────────────────────────────────────────
/*
 * هر دو نمای زیر پیش‌تر هر سطرِ staff_document را می‌شمردند. حالا فقط
 * approved. بدون این، جریان تأیید تزئینی است: مربی عکسی می‌فرستد و
 * پرونده بازرسی همان لحظه سبز می‌شود.
 */
drop function if exists app.staff_document_gaps(uuid, date);

create function app.staff_document_gaps(centre uuid, at date default current_date)
returns table (
  staff_id uuid,
  full_name text,
  expired integer,
  expiring integer,
  total integer,
  waiting integer
)
language sql stable security definer set search_path = public, app as $$
  select s.id, s.full_name,
         count(*) filter (where d.review = 'approved'
                            and app.document_state(d.expires_at, at) = 'expired')::integer,
         count(*) filter (where d.review = 'approved'
                            and app.document_state(d.expires_at, at) = 'expiring')::integer,
         count(d.id) filter (where d.review = 'approved')::integer,
         count(d.id) filter (where d.review = 'pending')::integer
    from staff s
    left join staff_document d on d.staff_id = s.id
   where s.center_id = centre and s.active
   group by s.id, s.full_name
   order by 3 desc, 4 desc, s.full_name
$$;

drop function if exists app.inspection_readiness(uuid, date);

create function app.inspection_readiness(centre uuid, at date default current_date)
returns table (
  requirement_id uuid,
  title text,
  source app.requirement_source,
  satisfied boolean,
  expires_at date,
  state text,
  note text
)
language sql stable security definer set search_path = public, app as $$
  select
    r.id,
    r.title,
    r.source,
    case r.source
      when 'app_report' then true
      when 'center_document' then exists (
        select 1 from center_document d
         where d.center_id = centre and d.kind::text = r.source_key
           and (d.expires_at is null or d.expires_at >= at)
      )
      when 'staff_document' then not exists (
        -- تأمین‌شده یعنی هیچ مربی فعالی این مدرک را کم نداشته باشد.
        -- «داشتن» یعنی مدرکِ **تأییدشده**؛ چیزی که هنوز در صف مدیر
        -- است، روز بازرسی به کار نمی‌آید.
        select 1 from staff s
         where s.center_id = centre and s.active
           and not exists (
             select 1 from staff_document sd
              where sd.staff_id = s.id and sd.kind::text = r.source_key
                and sd.review = 'approved'
                and (sd.expires_at is null or sd.expires_at >= at)
           )
      )
      else false
    end,
    case r.source
      when 'center_document' then (
        select min(d.expires_at) from center_document d
         where d.center_id = centre and d.kind::text = r.source_key
           and d.expires_at is not null
      )
      when 'staff_document' then (
        select min(sd.expires_at) from staff_document sd
          join staff s on s.id = sd.staff_id and s.center_id = centre and s.active
         where sd.kind::text = r.source_key and sd.review = 'approved'
           and sd.expires_at is not null
      )
    end,
    app.document_state(
      case r.source
        when 'center_document' then (
          select min(d.expires_at) from center_document d
           where d.center_id = centre and d.kind::text = r.source_key
             and d.expires_at is not null
        )
        when 'staff_document' then (
          select min(sd.expires_at) from staff_document sd
            join staff s on s.id = sd.staff_id and s.center_id = centre and s.active
           where sd.kind::text = r.source_key and sd.review = 'approved'
             and sd.expires_at is not null
        )
      end, at),
    r.note
  from inspection_requirement r
  where r.center_id = centre and r.active
  order by r.sort_order, r.title
$$;

-- ────────────────────────────────────────────────────────────
-- ۷. دسترسی
-- ────────────────────────────────────────────────────────────
/*
 * سیاستِ درج ۰۰۲۲ اجازه می‌داد مربی خودش سطر بنویسد — و حالا می‌تواند
 * review را هم 'approved' بنویسد و از تأیید رد شود. تریگر جلویش را
 * می‌گیرد، نه سیاست: سیاست نمی‌تواند به ستونِ در حال درج نگاه کند و
 * هم‌زمان مسیرِ security definer را باز بگذارد.
 */
create function app.guard_document_review()
returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.is_manager() then
    return new;
  end if;

  /*
   * بی‌حساب یعنی مهاجرت، بذر، یا کار مستقیم روی پایگاه — جایی که RLS
   * هم دست‌وپا ندارد و حالتِ صریح محترم است. از مسیر اپ، سیاستِ درج
   * بدون حساب اصلاً رد می‌شود چون center_id تهی است.
   */
  if app.current_account_id() is null then
    return new;
  end if;

  new.review := 'pending';
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.review_note := null;
  return new;
end
$$;

create trigger staff_document_review_guard
  before insert on staff_document
  for each row execute function app.guard_document_review();

/*
 * تغییر پس از درج فقط کار مدیر است. مربی‌ای که مدرکش رد شده، یکی تازه
 * می‌فرستد — سابقه رد هم می‌ماند، که همان چیزی است که روز اختلاف لازم
 * می‌شود.
 */
create policy staff_document_review_update on staff_document
  for update using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

alter table staff_document_requirement enable row level security;

/* مربی باید ببیند چه از او خواسته‌اند؛ چیدنش کار مدیر است. */
create policy staff_document_requirement_read on staff_document_requirement
  for select using (center_id = app.current_center_id());

create policy staff_document_requirement_write on staff_document_requirement
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

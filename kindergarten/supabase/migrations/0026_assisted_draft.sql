-- ============================================================
-- پیش‌نویس کمکی گزارش ماهانه
--
-- تصمیم مالک محصول، گزینه (ب): هوش مصنوعی **جملات خودِ مربی** را
-- مرتب و روان می‌کند؛ مربی ویرایش می‌کند و پایش را امضا.
--
-- گزینه (الف) — نتیجه‌گیری ماشین درباره کودک، مثل «سارا درون‌گراست» —
-- همچنان بسته است. پیوست ج سند و بند ۱۰ سر جایشان‌اند.
--
-- ── چرا این فایل وجود دارد ───────────────────────────────────
--
-- فاصله (الف) و (ب) یک جمله در دستورالعمل مدل نیست. مدلی که ورودی
-- کافی داشته باشد، دیر یا زود نتیجه‌گیری می‌کند — نه از بدجنسی، از
-- اینکه کارش همین است.
--
-- پس مرز جای دیگری گذاشته می‌شود: **مدل فقط چیزی را می‌بیند که تابع
-- app.report_material برمی‌گرداند.** آن تابع متن مشاهدات مربی است و
-- بس. نه حضور و غیاب، نه خلق، نه غذا، نه هیچ عددی — چون از عدد،
-- نتیجه‌گیری در می‌آید و از جمله مربی، فقط ویرایش.
--
-- ── سه چیزی که ثبت می‌شوند تا بشود پرسید ─────────────────────
--
--   ۱. پیش‌نویس ماشین، جدا از متن نهایی مربی. تا بشود دید مربی چه
--      عوض کرده.
--   ۲. کدام مشاهده‌ها به مدل داده شدند. جمله‌ای که در گزارش هست و
--      ریشه‌اش در هیچ مشاهده‌ای نیست، باید پیدا شود.
--   ۳. اینکه مربی پیش‌نویس را دست‌نخورده امضا کرده یا نه. این خطا
--      نیست — گاهی پیش‌نویس درست است — ولی مدیر باید بتواند ببیند.
-- ============================================================

create type app.draft_source as enum ('manual', 'assisted');

alter table monthly_report
  add column draft_source app.draft_source not null default 'manual',
  -- خروجی خام ماشین. هرگز جای teacher_summary را نمی‌گیرد و هرگز
  -- به خانواده نمی‌رود؛ فقط برای مقایسه نگه داشته می‌شود.
  add column assisted_draft text,
  add column draft_generated_at timestamptz,
  add column draft_model text;

alter table monthly_report
  add constraint monthly_report_draft_pairing
    check (
      (draft_source = 'manual' and assisted_draft is null)
      or (draft_source = 'assisted' and assisted_draft is not null
          and draft_generated_at is not null)
    );

comment on column monthly_report.assisted_draft is
  'خروجی خام ماشین، برای مقایسه با متن نهایی مربی. به خانواده نمی‌رود.';

-- ────────────────────────────────────────────────────────────
-- ۱. ردِ مصالح
-- ────────────────────────────────────────────────────────────
/*
 * کدام مشاهده‌ها به مدل داده شدند.
 *
 * بدون این، ادعای «فقط جملات مربی» قابل بررسی نیست. با این، هر
 * جمله‌ای که در پیش‌نویس هست و ریشه‌اش در این فهرست نیست، پیدا
 * می‌شود.
 */
create table monthly_report_source (
  report_id uuid not null references monthly_report(id) on delete cascade,
  observation_id uuid not null references observation(id) on delete cascade,
  primary key (report_id, observation_id)
);

-- ────────────────────────────────────────────────────────────
-- ۲. تنها ورودی مجاز مدل
-- ────────────────────────────────────────────────────────────
/*
 * مرز (الف) و (ب)، به شکل یک تابع.
 *
 * چیزی که اینجا نیست، مدل نمی‌بیند. عمداً فقط متن مشاهدات مربی است:
 *
 *   ـ حضور و غیاب نیست. از «۱۸ روز حاضر» نتیجه‌گیری درمی‌آید.
 *   ـ خلق نیست. از «۹ بار بی‌قرار» تشخیص درمی‌آید.
 *   ـ غذا و خواب نیست. الگو دادن به مدل یعنی دعوت به تحلیل.
 *   ـ نام کودکان دیگر نیست. گزارش سارا درباره سارا است.
 *
 * این اعداد در گزارش نهایی هستند — ولی اپ خودش کنار متن می‌گذاردشان،
 * نه اینکه مدل درباره‌شان جمله بنویسد.
 */
create function app.report_material(centre uuid, target uuid, from_date date, to_date date)
returns table (observation_id uuid, date date, lens app.observation_lens, body text)
language sql stable security definer set search_path = public, app as $$
  select o.id, o.date, o.lens, o.body
    from observation o
   where o.center_id = centre and o.child_id = target
     and o.date between from_date and to_date
   order by o.lens, o.date
$$;

comment on function app.report_material is
  'تنها ورودی مجاز پیش‌نویس کمکی: متن مشاهدات مربی. هیچ عدد و هیچ نام دیگری.';

-- ────────────────────────────────────────────────────────────
-- ۳. ثبت پیش‌نویس
-- ────────────────────────────────────────────────────────────
/*
 * پیش‌نویس را می‌نویسد و همان لحظه ردِ مصالحش را هم ثبت می‌کند. یکی
 * بدون دیگری ممکن نیست، چون ادعای بی‌سند همان چیزی است که این فایل
 * برای جلوگیری از آن نوشته شده.
 *
 * در audit_log می‌نشیند: ماشین به داده کودک دست زده و بند ۱۰.۲
 * می‌گوید هر دسترسی به داده کودک ردِ پا می‌خواهد.
 */
create function app.record_assisted_draft(
  report uuid,
  draft text,
  model text,
  sources uuid[]
) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  centre uuid;
  kid    uuid;
  stray  integer;
begin
  select center_id, child_id into centre, kid from monthly_report where id = report;
  if centre is null then
    raise exception 'گزارش ماهانه پیدا نشد';
  end if;

  /*
   * هر مشاهده‌ای که به مدل داده شده باید مالِ همین کودک باشد. بی این
   * بررسی، یک اشتباه در فراخوانی می‌تواند مشاهده کودک دیگری را وارد
   * گزارش کند — و آن دقیقاً همان چیزی است که هیچ‌وقت نباید بشود.
   */
  select count(*) into stray
    from unnest(sources) s(id)
    left join observation o on o.id = s.id and o.child_id = kid
   where o.id is null;
  if stray > 0 then
    raise exception 'مشاهده‌ای از کودک دیگر در مصالح گزارش است';
  end if;

  update monthly_report
     set draft_source = 'assisted',
         assisted_draft = draft,
         draft_generated_at = now(),
         draft_model = model
   where id = report;

  delete from monthly_report_source where report_id = report;
  insert into monthly_report_source (report_id, observation_id)
  select report, s.id from unnest(sources) s(id);

  insert into audit_log (center_id, actor_id, action, entity, entity_id)
  values (centre, app.current_account_id(), 'assisted_draft', 'monthly_report', report);
end $$;

-- ────────────────────────────────────────────────────────────
-- ۴. آنچه مدیر باید بتواند ببیند
-- ────────────────────────────────────────────────────────────
/*
 * آیا مربی پیش‌نویس را دست‌نخورده امضا کرده.
 *
 * خطا نیست — گاهی پیش‌نویس درست است. ولی گزارشی که ماشین نوشته و
 * آدمی رویش فکر نکرده، چیزی است که مدیر حق دارد بداند، و کل ارزش
 * گزینه (ب) به همین بستگی دارد.
 */
create function app.assisted_report_review(centre uuid, span text)
returns table (
  report_id uuid,
  child_name text,
  status app.monthly_report_status,
  source app.draft_source,
  untouched boolean,
  sources_used integer
)
language sql stable security definer set search_path = public, app as $$
  select r.id, c.first_name, r.status, r.draft_source,
         r.draft_source = 'assisted'
           and btrim(coalesce(r.teacher_summary, '')) = btrim(coalesce(r.assisted_draft, '')),
         (select count(*)::integer from monthly_report_source s where s.report_id = r.id)
    from monthly_report r
    join child c on c.id = r.child_id
   where r.center_id = centre and r.period = span
   order by c.first_name
$$;

-- ────────────────────────────────────────────────────────────
-- ۵. دسترسی
-- ────────────────────────────────────────────────────────────
alter table monthly_report_source enable row level security;

create policy monthly_report_source_staff on monthly_report_source
  for all using (
    exists (
      select 1 from monthly_report r
       where r.id = report_id
         and r.center_id = app.current_center_id()
         and app.can_see_child(r.child_id)
    ) and app.can_write()
  )
  with check (
    exists (
      select 1 from monthly_report r
       where r.id = report_id
         and r.center_id = app.current_center_id()
         and app.can_see_child(r.child_id)
    ) and app.can_write()
  );

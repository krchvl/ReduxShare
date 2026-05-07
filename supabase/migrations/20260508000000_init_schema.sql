create schema if not exists public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

alter default privileges in schema public grant all on tables to postgres, service_role;
alter default privileges in schema public grant all on functions to postgres, service_role;
alter default privileges in schema public grant all on sequences to postgres, service_role;

create table if not exists public.reduxshare_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  username text not null unique check (char_length(trim(username)) between 3 and 32),
  moodle_domain text,
  solved_tests_count integer not null default 0 check (solved_tests_count >= 0),
  solved_tasks_count integer not null default 0 check (solved_tasks_count >= 0),
  last_login_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reduxshare_tasks (
  id bigserial primary key,
  moodle_domain text not null,
  course_id integer not null,
  quiz_id integer not null,
  question_id text not null,
  question_hash text not null,
  question_type text,
  slot_key text not null default 'question',
  slot_index integer check (slot_index is null or slot_index >= 0),
  answer_key text not null,
  answer_label text not null,
  correct_count integer not null default 0 check (correct_count >= 0),
  selected_correct_count integer not null default 0 check (selected_correct_count >= 0),
  selected_incorrect_count integer not null default 0 check (selected_incorrect_count >= 0),
  selected_unknown_count integer not null default 0 check (selected_unknown_count >= 0),
  first_contributor_id uuid references public.reduxshare_users(id) on delete set null,
  last_contributor_id uuid references public.reduxshare_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reduxshare_tasks_identity_key unique (
    moodle_domain,
    course_id,
    quiz_id,
    question_id,
    question_hash,
    slot_key,
    answer_key
  )
);

create table if not exists public.reduxshare_review_imports (
  user_id uuid not null references public.reduxshare_users(id) on delete cascade,
  moodle_domain text not null,
  attempt_key text not null,
  course_id integer,
  quiz_id integer,
  page_url text,
  imported_question_count integer not null default 0 check (imported_question_count >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, moodle_domain, attempt_key)
);

create table if not exists public.reduxshare_review_answer_imports (
  user_id uuid not null references public.reduxshare_users(id) on delete cascade,
  moodle_domain text not null,
  attempt_key text not null,
  question_id text not null,
  question_hash text not null,
  slot_key text not null,
  answer_key text not null,
  created_at timestamptz not null default now(),
  primary key (
    user_id,
    moodle_domain,
    attempt_key,
    question_id,
    question_hash,
    slot_key,
    answer_key
  )
);

create index if not exists reduxshare_tasks_lookup_idx
on public.reduxshare_tasks (moodle_domain, course_id, quiz_id, question_id, question_hash);

create index if not exists reduxshare_tasks_question_latest_idx
on public.reduxshare_tasks (moodle_domain, course_id, quiz_id, question_id, updated_at desc);

create index if not exists reduxshare_tasks_updated_idx
on public.reduxshare_tasks (updated_at desc);

alter table public.reduxshare_users enable row level security;
alter table public.reduxshare_tasks enable row level security;
alter table public.reduxshare_review_imports enable row level security;
alter table public.reduxshare_review_answer_imports enable row level security;

drop policy if exists "reduxshare_users_select_own" on public.reduxshare_users;
create policy "reduxshare_users_select_own"
on public.reduxshare_users
for select
to authenticated
using ((select auth.uid()) = id);

revoke all on public.reduxshare_tasks from public, anon, authenticated;
revoke all on public.reduxshare_review_imports from public, anon, authenticated;
revoke all on public.reduxshare_review_answer_imports from public, anon, authenticated;
revoke all on public.reduxshare_users from public, anon;

grant select on public.reduxshare_users to authenticated;

create or replace function public.set_reduxshare_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reduxshare_users_set_updated_at on public.reduxshare_users;
create trigger reduxshare_users_set_updated_at
before update on public.reduxshare_users
for each row execute function public.set_reduxshare_updated_at();

drop trigger if exists reduxshare_tasks_set_updated_at on public.reduxshare_tasks;
create trigger reduxshare_tasks_set_updated_at
before update on public.reduxshare_tasks
for each row execute function public.set_reduxshare_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requested_username text;
begin
  requested_username = nullif(trim(new.raw_user_meta_data ->> 'username'), '');

  if requested_username is null then
    requested_username = nullif(split_part(new.email, '@', 1), '');
  end if;

  if requested_username is null then
    requested_username = replace(new.id::text, '-', '');
  end if;

  insert into public.reduxshare_users (id, email, username)
  values (new.id, lower(new.email), requested_username);

  return new;
exception
  when unique_violation then
    raise exception 'Username already exists' using errcode = '23505';
end;
$$;

drop trigger if exists reduxshare_auth_user_created on auth.users;
create trigger reduxshare_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.touch_user_profile(profile_moodle_domain text default null)
returns table (
  id uuid,
  email text,
  username text,
  moodle_domain text,
  solved_tests_count integer,
  solved_tasks_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid = auth.uid();
  current_email text = lower(coalesce(auth.jwt() ->> 'email', ''));
  current_username text = nullif(trim(auth.jwt() -> 'user_metadata' ->> 'username'), '');
begin
  if current_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if current_email = '' then
    select lower(au.email)
    into current_email
    from auth.users au
    where au.id = current_user_id;
  end if;

  if current_username is null then
    current_username = nullif(split_part(current_email, '@', 1), '');
  end if;

  if current_username is null then
    current_username = replace(current_user_id::text, '-', '');
  end if;

  insert into public.reduxshare_users as ru (
    id,
    email,
    username,
    moodle_domain,
    last_login_at
  )
  values (
    current_user_id,
    current_email,
    current_username,
    profile_moodle_domain,
    now()
  )
  on conflict on constraint reduxshare_users_pkey do update
  set
    email = excluded.email,
    moodle_domain = coalesce(excluded.moodle_domain, ru.moodle_domain),
    last_login_at = now();

  return query
  select
    ru.id,
    ru.email,
    ru.username,
    ru.moodle_domain,
    ru.solved_tests_count,
    ru.solved_tasks_count
  from public.reduxshare_users ru
  where ru.id = current_user_id;
end;
$$;

create or replace function public.record_quiz_progress(
  progress_moodle_domain text default null,
  solved_tests_delta integer default 0,
  solved_tasks_delta integer default 0
)
returns table (
  id uuid,
  email text,
  username text,
  moodle_domain text,
  solved_tests_count integer,
  solved_tasks_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid = auth.uid();
  tests_delta integer = greatest(coalesce(solved_tests_delta, 0), 0);
  tasks_delta integer = greatest(coalesce(solved_tasks_delta, 0), 0);
begin
  if current_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  perform public.touch_user_profile(progress_moodle_domain);

  update public.reduxshare_users ru
  set
    moodle_domain = coalesce(progress_moodle_domain, ru.moodle_domain),
    solved_tests_count = ru.solved_tests_count + tests_delta,
    solved_tasks_count = ru.solved_tasks_count + tasks_delta
  where ru.id = current_user_id;

  return query
  select
    ru.id,
    ru.email,
    ru.username,
    ru.moodle_domain,
    ru.solved_tests_count,
    ru.solved_tasks_count
  from public.reduxshare_users ru
  where ru.id = current_user_id;
end;
$$;

create or replace function public.fetch_reduxshare_tasks(
  task_moodle_domain text,
  task_course_id integer,
  task_quiz_id integer,
  task_questions jsonb
)
returns table (
  question_id text,
  question_type text,
  question_hash text,
  data jsonb,
  answer_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if task_moodle_domain is null or task_course_id is null or task_quiz_id is null then
    return;
  end if;

  return query
  with requested as (
    select
      question_item.ordinality::integer as request_order,
      nullif(question_item.value ->> 'questionId', '') as requested_question_id,
      nullif(question_item.value ->> 'questionType', '') as requested_question_type,
      nullif(question_item.value ->> 'questionHash', '') as requested_question_hash
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(task_questions, '[]'::jsonb)) = 'array' then coalesce(task_questions, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) with ordinality as question_item(value, ordinality)
  ),
  candidate_rows as (
    select
      rq.request_order,
      rq.requested_question_id,
      rq.requested_question_type,
      rq.requested_question_hash,
      rt.*,
      (rq.requested_question_hash is not null and rt.question_hash = rq.requested_question_hash) as hash_matches,
      greatest(rt.correct_count + rt.selected_correct_count, 0) as verified_total,
      greatest(rt.correct_count + rt.selected_correct_count + rt.selected_incorrect_count + rt.selected_unknown_count, 0) as observed_total
    from requested rq
    join public.reduxshare_tasks rt
      on rq.requested_question_id = rt.question_id
    where rq.requested_question_id is not null
      and rt.moodle_domain = task_moodle_domain
      and rt.course_id = task_course_id
      and rt.quiz_id = task_quiz_id
      and (
        rq.requested_question_type is null
        or rt.question_type is null
        or rt.question_type = rq.requested_question_type
      )
      and not (
        lower(coalesce(rq.requested_question_type, '')) = 'match'
        and rq.requested_question_hash is not null
        and rt.question_hash <> rq.requested_question_hash
      )
  ),
  hash_groups as (
    select
      cr.request_order,
      cr.question_hash,
      bool_or(cr.hash_matches) as hash_matches,
      max(cr.updated_at) as hash_updated_at
    from candidate_rows cr
    group by cr.request_order, cr.question_hash
  ),
  ranked_hashes as (
    select
      hg.*,
      row_number() over (
        partition by hg.request_order
        order by
          case when hg.hash_matches then 0 else 1 end,
          hg.hash_updated_at desc,
          hg.question_hash
      ) as hash_rank
    from hash_groups hg
  ),
  matching as (
    select cr.*
    from candidate_rows cr
    join ranked_hashes rh
      on rh.request_order = cr.request_order
     and rh.question_hash = cr.question_hash
    where rh.hash_rank = 1
  ),
  scored as (
    select
      mt.*,
      sum(mt.verified_total) over (
        partition by mt.request_order, mt.slot_key
      ) as slot_verified_total
    from matching mt
  ),
  slot_rows as (
    select
      sc.request_order,
      max(sc.requested_question_id) as requested_question_id,
      max(sc.requested_question_type) as requested_question_type,
      sc.question_id as slot_question_id,
      max(sc.question_type) as slot_question_type,
      max(sc.question_hash) as slot_question_hash,
      sc.slot_key as slot_key,
      min(sc.slot_index) as slot_index,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'correctness', 2,
            'confidence',
              case
                when sc.slot_verified_total > 0
                  then round((sc.verified_total::numeric / sc.slot_verified_total::numeric), 4)::double precision
                else 0
              end,
            'label', sc.answer_label
          )
          order by sc.verified_total desc, sc.answer_label asc
        ) filter (where sc.correct_count > 0),
        '[]'::jsonb
      ) as suggestions,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'correctness',
              case
                when sc.correct_count + sc.selected_correct_count > 0 then 2
                when sc.selected_incorrect_count > 0 then 0
                when sc.selected_unknown_count > 0 then 1
                else 1
              end,
            'count', sc.observed_total,
            'label', sc.answer_label
          )
          order by sc.observed_total desc, sc.answer_label asc
        ) filter (where sc.observed_total > 0),
        '[]'::jsonb
      ) as submissions,
      count(*)::integer as slot_answer_count
    from scored sc
    group by sc.request_order, sc.question_id, sc.slot_key
  )
  select
    sr.requested_question_id as question_id,
    coalesce(max(sr.slot_question_type), max(sr.requested_question_type)) as question_type,
    max(sr.slot_question_hash) as question_hash,
    jsonb_agg(
      jsonb_build_object(
        'anchor', jsonb_build_object(
          'index', coalesce(sr.slot_index, 1),
          'label', sr.slot_key
        ),
        'suggestions', sr.suggestions,
        'submissions', sr.submissions
      )
      order by coalesce(sr.slot_index, 1), sr.slot_key
    ) as data,
    sum(sr.slot_answer_count)::integer as answer_count
  from slot_rows sr
  group by sr.request_order, sr.requested_question_id
  order by sr.request_order;
end;
$$;

create or replace function public.save_reduxshare_review_answers(
  review_moodle_domain text,
  review_course_id integer,
  review_quiz_id integer,
  review_attempt_key text,
  review_page_url text,
  review_questions jsonb
)
returns table (
  imported boolean,
  saved_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid = auth.uid();
  saved_entries integer = 0;
  answer_imported_rows integer = 0;
  question_item jsonb;
  answer_item jsonb;
  q_question_id text;
  q_question_type text;
  q_question_hash text;
  a_label text;
  a_key text;
  a_slot_key text;
  a_slot_index integer;
  a_correctness integer;
  a_is_correct boolean;
  a_was_selected boolean;
  a_correct_delta integer;
  a_selected_correct_delta integer;
  a_selected_incorrect_delta integer;
  a_selected_unknown_delta integer;
  raw_slot_index text;
  raw_correctness text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if review_moodle_domain is null
    or review_course_id is null
    or review_quiz_id is null
    or nullif(trim(review_attempt_key), '') is null
  then
    return query select false, 0;
    return;
  end if;

  perform public.touch_user_profile(review_moodle_domain);

  insert into public.reduxshare_review_imports (
    user_id,
    moodle_domain,
    attempt_key,
    course_id,
    quiz_id,
    page_url,
    imported_question_count
  )
  values (
    current_user_id,
    review_moodle_domain,
    review_attempt_key,
    review_course_id,
    review_quiz_id,
    review_page_url,
    case
      when jsonb_typeof(coalesce(review_questions, '[]'::jsonb)) = 'array' then jsonb_array_length(coalesce(review_questions, '[]'::jsonb))
      else 0
    end
  )
  on conflict (user_id, moodle_domain, attempt_key) do update
  set
    course_id = coalesce(excluded.course_id, public.reduxshare_review_imports.course_id),
    quiz_id = coalesce(excluded.quiz_id, public.reduxshare_review_imports.quiz_id),
    page_url = coalesce(excluded.page_url, public.reduxshare_review_imports.page_url),
    imported_question_count = greatest(
      public.reduxshare_review_imports.imported_question_count,
      excluded.imported_question_count
    );

  for question_item in
    select question_value.value
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(review_questions, '[]'::jsonb)) = 'array' then coalesce(review_questions, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as question_value(value)
  loop
    q_question_id = nullif(trim(question_item ->> 'questionId'), '');
    q_question_type = nullif(trim(question_item ->> 'questionType'), '');
    q_question_hash = nullif(trim(question_item ->> 'questionHash'), '');

    if q_question_id is null or q_question_hash is null then
      continue;
    end if;

    for answer_item in
      select answer_value.value
      from jsonb_array_elements(
        case
          when jsonb_typeof(coalesce(question_item -> 'answers', '[]'::jsonb)) = 'array' then coalesce(question_item -> 'answers', '[]'::jsonb)
          else '[]'::jsonb
        end
      ) as answer_value(value)
    loop
      a_label = nullif(regexp_replace(trim(answer_item ->> 'label'), '\s+', ' ', 'g'), '');
      a_key = nullif(regexp_replace(trim(answer_item ->> 'answerKey'), '\s+', ' ', 'g'), '');
      a_slot_key = coalesce(nullif(trim(answer_item ->> 'slotKey'), ''), 'question');
      raw_slot_index = nullif(trim(answer_item ->> 'slotIndex'), '');
      raw_correctness = nullif(trim(answer_item ->> 'correctness'), '');
      a_slot_index = case when raw_slot_index ~ '^\d+$' then raw_slot_index::integer else null end;
      a_is_correct = coalesce((answer_item ->> 'isCorrect')::boolean, false);
      a_was_selected = coalesce((answer_item ->> 'wasSelected')::boolean, false);
      a_correctness = case
        when raw_correctness ~ '^-?\d+$' then raw_correctness::integer
        when a_is_correct then 2
        when a_was_selected then 0
        else 1
      end;

      if a_label is null then
        continue;
      end if;

      if a_key is null then
        a_key = lower(regexp_replace(a_label, '\s+', ' ', 'g'));
      end if;

      if a_correctness <> 2 and not a_was_selected then
        continue;
      end if;

      insert into public.reduxshare_review_answer_imports (
        user_id,
        moodle_domain,
        attempt_key,
        question_id,
        question_hash,
        slot_key,
        answer_key
      )
      values (
        current_user_id,
        review_moodle_domain,
        review_attempt_key,
        q_question_id,
        q_question_hash,
        a_slot_key,
        a_key
      )
      on conflict do nothing;

      get diagnostics answer_imported_rows = row_count;

      if answer_imported_rows = 0 then
        continue;
      end if;

      a_correct_delta = case when a_correctness = 2 then 1 else 0 end;
      a_selected_correct_delta = case when a_correctness = 2 and a_was_selected then 1 else 0 end;
      a_selected_incorrect_delta = case when a_correctness <= 0 and a_was_selected then 1 else 0 end;
      a_selected_unknown_delta = case when a_correctness = 1 and a_was_selected then 1 else 0 end;

      insert into public.reduxshare_tasks as rt (
        moodle_domain,
        course_id,
        quiz_id,
        question_id,
        question_hash,
        question_type,
        slot_key,
        slot_index,
        answer_key,
        answer_label,
        correct_count,
        selected_correct_count,
        selected_incorrect_count,
        selected_unknown_count,
        first_contributor_id,
        last_contributor_id
      )
      values (
        review_moodle_domain,
        review_course_id,
        review_quiz_id,
        q_question_id,
        q_question_hash,
        q_question_type,
        a_slot_key,
        a_slot_index,
        a_key,
        a_label,
        a_correct_delta,
        a_selected_correct_delta,
        a_selected_incorrect_delta,
        a_selected_unknown_delta,
        current_user_id,
        current_user_id
      )
      on conflict on constraint reduxshare_tasks_identity_key do update
      set
        question_type = coalesce(excluded.question_type, rt.question_type),
        slot_index = coalesce(excluded.slot_index, rt.slot_index),
        answer_label = excluded.answer_label,
        correct_count = rt.correct_count + excluded.correct_count,
        selected_correct_count = rt.selected_correct_count + excluded.selected_correct_count,
        selected_incorrect_count = rt.selected_incorrect_count + excluded.selected_incorrect_count,
        selected_unknown_count = rt.selected_unknown_count + excluded.selected_unknown_count,
        last_contributor_id = current_user_id,
        updated_at = now();

      saved_entries = saved_entries + 1;
    end loop;
  end loop;

  return query select saved_entries > 0, saved_entries;
end;
$$;

revoke all on function public.set_reduxshare_updated_at() from public;
revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.touch_user_profile(text) from public;
revoke all on function public.record_quiz_progress(text, integer, integer) from public;
revoke all on function public.fetch_reduxshare_tasks(text, integer, integer, jsonb) from public;
revoke all on function public.fetch_reduxshare_tasks(text, integer, integer, jsonb) from anon;
revoke all on function public.save_reduxshare_review_answers(text, integer, integer, text, text, jsonb) from public;
revoke all on function public.save_reduxshare_review_answers(text, integer, integer, text, text, jsonb) from anon;

grant execute on function public.touch_user_profile(text) to authenticated;
grant execute on function public.record_quiz_progress(text, integer, integer) to authenticated;
grant execute on function public.fetch_reduxshare_tasks(text, integer, integer, jsonb) to authenticated;
grant execute on function public.save_reduxshare_review_answers(text, integer, integer, text, text, jsonb) to authenticated;

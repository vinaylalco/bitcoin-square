-- Distinctive Journaling encrypted journal storage schema.
-- Paste this file into the Supabase SQL Editor; do not run it from the app.

create extension if not exists pgcrypto;

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_payload text not null,
  encryption_salt text not null,
  iv text not null,
  version integer not null default 1,
  display_title text not null default 'Untitled entry',
  status text not null default 'draft' check (status in ('draft', 'complete')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_entries
  add column if not exists display_title text not null default 'Untitled entry',
  add column if not exists status text not null default 'draft',
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_status_check'
      and conrelid = 'public.journal_entries'::regclass
  ) then
    alter table public.journal_entries
      add constraint journal_entries_status_check check (status in ('draft', 'complete'));
  end if;
end $$;

comment on table public.journal_entries is
  'Stores encrypted journal entries. Plaintext journal content and user encryption secrets must never be stored here.';

comment on column public.journal_entries.encrypted_payload is
  'Encrypted client-side before insert or update; Supabase stores ciphertext only.';

comment on column public.journal_entries.encryption_salt is
  'Salt used by client-side key derivation. This value is not a secret.';

comment on column public.journal_entries.iv is
  'Initialization vector used by client-side encryption. This value is not a secret.';

comment on column public.journal_entries.user_id is
  'Owner of the encrypted journal entry. The user encryption secret is never stored in this table.';

comment on column public.journal_entries.display_title is
  'Plain display title for entry lists. Do not store plaintext journal body content here.';

comment on column public.journal_entries.status is
  'Entry workflow state. Valid values are draft and complete.';

comment on column public.journal_entries.completed_at is
  'Timestamp set when an entry is marked complete.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_journal_entries_updated_at on public.journal_entries;

create trigger set_journal_entries_updated_at
before update on public.journal_entries
for each row
execute function public.set_updated_at();

create index if not exists journal_entries_user_id_idx
on public.journal_entries (user_id);

create index if not exists journal_entries_user_status_updated_idx
on public.journal_entries (user_id, status, updated_at desc);

alter table public.journal_entries enable row level security;

drop policy if exists "Users can select their own journal entries" on public.journal_entries;
create policy "Users can select their own journal entries"
on public.journal_entries
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own journal entries" on public.journal_entries;
create policy "Users can insert their own journal entries"
on public.journal_entries
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own journal entries" on public.journal_entries;
create policy "Users can update their own journal entries"
on public.journal_entries
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own journal entries" on public.journal_entries;
create policy "Users can delete their own journal entries"
on public.journal_entries
for delete
to authenticated
using (auth.uid() = user_id);

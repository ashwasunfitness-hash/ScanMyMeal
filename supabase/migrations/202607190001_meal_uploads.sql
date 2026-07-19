begin;

create table public.meal_uploads (
  id uuid primary key,
  client_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  upload_status text not null check (upload_status in ('pending_upload', 'uploaded', 'upload_failed')),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 12582912),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, idempotency_key)
);

create index meal_uploads_client_created_idx on public.meal_uploads(client_id, created_at desc);
create trigger meal_uploads_updated before update on public.meal_uploads for each row execute function public.set_updated_at();

alter table public.meal_uploads enable row level security;

create policy meal_uploads_select_authorised on public.meal_uploads for select to authenticated using (
  (select auth.uid()) = client_id
  or public.is_assigned_coach(client_id)
  or public.is_admin()
);

revoke all on public.meal_uploads from anon, authenticated;
grant select on public.meal_uploads to authenticated;

commit;

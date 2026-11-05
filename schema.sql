-- ReimFlow core schema: four operational entities plus an optional employee demo directory.
create extension if not exists pgcrypto;

create sequence if not exists public.reimflow_request_number_seq;

create or replace function public.generate_reimflow_request_number()
returns text
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select 'RF-' || to_char(current_date, 'YYYYMM') || '-' ||
    lpad(nextval('public.reimflow_request_number_seq')::text, 6, '0');
$$;

revoke all on function public.generate_reimflow_request_number() from public, anon;
grant execute on function public.generate_reimflow_request_number() to authenticated;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  department_name text not null unique check (length(trim(department_name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  email text not null unique,
  department_id uuid references public.departments(id) on delete restrict,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists is_active boolean not null default true;

create table if not exists public.employee_directory (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  email text unique check (email is null or length(trim(email)) between 3 and 254),
  department_id uuid not null references public.departments(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.employee_demo_reimbursements (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique,
  employee_id uuid not null references public.employee_directory(id) on delete cascade,
  transaction_date date not null,
  category text not null,
  amount numeric(14, 2) not null check (amount > 0),
  status text not null check (status in ('Menunggu Persetujuan', 'Disetujui', 'Ditolak', 'Dibayarkan')),
  created_at timestamptz not null default now()
);

create table if not exists public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default public.generate_reimflow_request_number(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  transaction_date date not null,
  category text not null check (length(trim(category)) between 1 and 100),
  amount numeric(14, 2) not null check (amount > 0),
  description text not null check (length(trim(description)) between 1 and 1000),
  receipt_path text not null check (length(trim(receipt_path)) > 0),
  status text not null default 'Menunggu Persetujuan'
    check (status in ('Menunggu Persetujuan', 'Disetujui', 'Ditolak', 'Dibayarkan')),
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reimbursements_review_state_check check (
    (status = 'Menunggu Persetujuan' and reviewed_by is null and reviewed_at is null and rejection_reason is null)
    or (status = 'Disetujui' and reviewed_by is not null and reviewed_at is not null and rejection_reason is null)
    or (status = 'Ditolak' and reviewed_by is not null and reviewed_at is not null and length(trim(coalesce(rejection_reason, ''))) > 0)
    or (status = 'Dibayarkan' and reviewed_by is not null and reviewed_at is not null and rejection_reason is null)
  )
);

create or replace function public.validate_reimbursement_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
begin
  if new.transaction_date > current_date then
    raise exception 'Tanggal transaksi tidak boleh di masa depan.';
  end if;
  if split_part(new.receipt_path, '/', 1) <> new.employee_id::text
    or not exists (
      select 1
      from storage.objects
      where bucket_id = 'receipts'
        and name = new.receipt_path
        and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'pdf')
    )
  then
    raise exception 'Bukti transaksi harus berupa file yang sudah diunggah oleh pengaju.';
  end if;
  return new;
end;
$$;

drop trigger if exists reimbursements_receipt_exists on public.reimbursements;
create trigger reimbursements_receipt_exists
  before insert on public.reimbursements
  for each row execute function public.validate_reimbursement_receipt();

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reimbursement_id uuid not null unique references public.reimbursements(id) on delete restrict,
  paid_by uuid not null references public.profiles(id) on delete restrict,
  payment_date date not null,
  paid_amount numeric(14, 2) not null check (paid_amount > 0),
  payment_reference text not null check (length(trim(payment_reference)) between 1 and 150),
  created_at timestamptz not null default now()
);

create index if not exists profiles_department_id_idx on public.profiles(department_id);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists employee_directory_department_id_idx on public.employee_directory(department_id);
create index if not exists employee_demo_reimbursements_employee_date_idx on public.employee_demo_reimbursements(employee_id, transaction_date desc);
create index if not exists reimbursements_employee_created_idx on public.reimbursements(employee_id, created_at desc);
create index if not exists reimbursements_status_created_idx on public.reimbursements(status, created_at desc);
create index if not exists reimbursements_transaction_date_idx on public.reimbursements(transaction_date);
create index if not exists reimbursements_reviewed_by_idx on public.reimbursements(reviewed_by);
create index if not exists payments_paid_by_date_idx on public.payments(paid_by, payment_date desc);

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.employee_directory enable row level security;
alter table public.employee_demo_reimbursements enable row level security;
alter table public.reimbursements enable row level security;
alter table public.payments enable row level security;

create or replace function public.reimflow_is_active()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active
  );
$$;

create or replace function public.reimflow_is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and is_active
  );
$$;

revoke all on function public.reimflow_is_admin() from public, anon;
revoke all on function public.reimflow_is_active() from public, anon;
grant execute on function public.reimflow_is_admin() to authenticated;
grant execute on function public.reimflow_is_active() to authenticated;

drop policy if exists employee_directory_admin_manage on public.employee_directory;
create policy employee_directory_admin_manage on public.employee_directory
  for all to authenticated
  using (public.reimflow_is_admin())
  with check (public.reimflow_is_admin());
drop policy if exists employee_demo_reimbursements_admin_read on public.employee_demo_reimbursements;
create policy employee_demo_reimbursements_admin_read on public.employee_demo_reimbursements
  for select to authenticated
  using (public.reimflow_is_admin());

drop policy if exists departments_read_authenticated on public.departments;
create policy departments_read_authenticated on public.departments
  for select to authenticated using (public.reimflow_is_active());
drop policy if exists departments_admin_manage on public.departments;
create policy departments_admin_manage on public.departments
  for all to authenticated
  using (public.reimflow_is_admin())
  with check (public.reimflow_is_admin());

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (public.reimflow_is_active() and public.reimflow_is_admin())
  );
drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (public.reimflow_is_active() and (id = (select auth.uid()) or public.reimflow_is_admin()))
  with check (public.reimflow_is_active() and (id = (select auth.uid()) or public.reimflow_is_admin()));

drop policy if exists reimbursements_read_owner_or_admin on public.reimbursements;
create policy reimbursements_read_owner_or_admin on public.reimbursements
  for select to authenticated
  using (public.reimflow_is_active() and (employee_id = (select auth.uid()) or public.reimflow_is_admin()));
drop policy if exists reimbursements_insert_owner_pending on public.reimbursements;
create policy reimbursements_insert_owner_pending on public.reimbursements
  for insert to authenticated
  with check (
    public.reimflow_is_active()
    and
    employee_id = (select auth.uid())
    and status = 'Menunggu Persetujuan'
    and reviewed_by is null
    and reviewed_at is null
    and rejection_reason is null
  );

drop policy if exists payments_read_owner_or_admin on public.payments;
create policy payments_read_owner_or_admin on public.payments
  for select to authenticated
  using (
    public.reimflow_is_active()
    and (public.reimflow_is_admin()
    or exists (
      select 1 from public.reimbursements r
      where r.id = payments.reimbursement_id
        and r.employee_id = (select auth.uid())
    ))
  );

revoke all on public.departments, public.profiles, public.employee_directory, public.employee_demo_reimbursements, public.reimbursements, public.payments from anon, authenticated;
grant select on public.departments, public.profiles, public.employee_directory, public.employee_demo_reimbursements, public.reimbursements, public.payments to authenticated;
grant insert, update, delete on public.departments to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant insert (employee_id, transaction_date, category, amount, description, receipt_path) on public.reimbursements to authenticated;

create or replace function public.create_employee_directory_with_demo_history(
  p_full_name text,
  p_email text,
  p_department_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_employee_id uuid;
  clean_email text;
begin
  if auth.uid() is null or not public.reimflow_is_admin() then
    raise exception 'Hanya admin yang dapat menambahkan data karyawan.';
  end if;
  if p_full_name is null or length(trim(p_full_name)) not between 1 and 120 then
    raise exception 'Nama karyawan wajib diisi dan maksimal 120 karakter.';
  end if;
  clean_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  if clean_email is not null and clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Alamat email tidak valid.';
  end if;
  if not exists (select 1 from public.departments where id = p_department_id) then
    raise exception 'Departemen tidak ditemukan.';
  end if;

  insert into public.employee_directory (full_name, email, department_id)
  values (trim(p_full_name), clean_email, p_department_id)
  returning id into new_employee_id;

  insert into public.employee_demo_reimbursements (
    request_number, employee_id, transaction_date, category, amount, status
  ) values
    ('DEMO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), new_employee_id, current_date - 4, 'Transportasi', 125000, 'Menunggu Persetujuan'),
    ('DEMO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), new_employee_id, current_date - 7, 'Konsumsi', 86000, 'Disetujui');

  return new_employee_id;
end;
$$;

revoke all on function public.create_employee_directory_with_demo_history(text, text, uuid) from public, anon;
grant execute on function public.create_employee_directory_with_demo_history(text, text, uuid) to authenticated;

create or replace function public.review_reimbursement(
  p_reimbursement_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_status text;
begin
  if auth.uid() is null or not public.reimflow_is_admin() then
    raise exception 'Hanya admin yang dapat memeriksa pengajuan.';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'Keputusan tidak valid.';
  end if;
  if p_decision = 'reject' and length(trim(coalesce(p_rejection_reason, ''))) = 0 then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  select status into current_status
  from public.reimbursements
  where id = p_reimbursement_id
  for update;
  if not found then raise exception 'Pengajuan tidak ditemukan.'; end if;
  if current_status <> 'Menunggu Persetujuan' then
    raise exception 'Hanya pengajuan yang menunggu persetujuan yang dapat ditinjau.';
  end if;

  update public.reimbursements
  set status = case when p_decision = 'approve' then 'Disetujui' else 'Ditolak' end,
      rejection_reason = case when p_decision = 'reject' then trim(p_rejection_reason) else null end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_reimbursement_id;
  return p_reimbursement_id;
end;
$$;

create or replace function public.record_reimbursement_payment(
  p_reimbursement_id uuid,
  p_payment_date date,
  p_paid_amount numeric,
  p_payment_reference text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  reimbursement_row public.reimbursements%rowtype;
  new_payment_id uuid;
begin
  if auth.uid() is null or not public.reimflow_is_admin() then
    raise exception 'Hanya admin yang dapat mencatat pembayaran.';
  end if;
  if p_payment_date is null or p_payment_date > current_date then
    raise exception 'Tanggal pembayaran tidak valid.';
  end if;
  if p_paid_amount is null or p_paid_amount <= 0 then
    raise exception 'Nominal pembayaran harus lebih besar dari nol.';
  end if;
  if length(trim(coalesce(p_payment_reference, ''))) = 0 then
    raise exception 'Referensi pembayaran wajib diisi.';
  end if;

  select * into reimbursement_row
  from public.reimbursements
  where id = p_reimbursement_id
  for update;
  if not found then raise exception 'Pengajuan tidak ditemukan.'; end if;
  if reimbursement_row.status <> 'Disetujui' then
    raise exception 'Pembayaran hanya dapat dicatat untuk pengajuan yang disetujui.';
  end if;
  if p_paid_amount <> reimbursement_row.amount then
    raise exception 'Nominal pembayaran harus sama dengan nominal pengajuan.';
  end if;

  insert into public.payments (reimbursement_id, paid_by, payment_date, paid_amount, payment_reference)
  values (p_reimbursement_id, auth.uid(), p_payment_date, p_paid_amount, trim(p_payment_reference))
  returning id into new_payment_id;

  update public.reimbursements set status = 'Dibayarkan'
  where id = p_reimbursement_id;
  return new_payment_id;
end;
$$;

create or replace function public.create_employee_demo_reimbursement(
  p_employee_id uuid,
  p_transaction_date date,
  p_category text,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_request_id uuid;
begin
  if auth.uid() is null or not public.reimflow_is_admin() then
    raise exception 'Hanya admin yang dapat menambahkan data simulasi.';
  end if;
  if not exists (select 1 from public.employee_directory where id = p_employee_id) then
    raise exception 'Data karyawan tidak ditemukan.';
  end if;
  if p_transaction_date is null or p_transaction_date > current_date then
    raise exception 'Tanggal transaksi tidak boleh di masa depan.';
  end if;
  if p_category is null or length(trim(p_category)) not between 1 and 100 then
    raise exception 'Kategori wajib diisi.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal harus lebih besar dari nol.';
  end if;

  insert into public.employee_demo_reimbursements (
    request_number, employee_id, transaction_date, category, amount, status
  ) values (
    'SIM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    p_employee_id, p_transaction_date, trim(p_category), p_amount, 'Menunggu Persetujuan'
  )
  returning id into new_request_id;

  return new_request_id;
end;
$$;

revoke all on function public.create_employee_demo_reimbursement(uuid, date, text, numeric) from public, anon;
grant execute on function public.create_employee_demo_reimbursement(uuid, date, text, numeric) to authenticated;

revoke all on function public.review_reimbursement(uuid, text, text) from public, anon;
revoke all on function public.record_reimbursement_payment(uuid, date, numeric, text) from public, anon;
grant execute on function public.review_reimbursement(uuid, text, text) to authenticated;
grant execute on function public.record_reimbursement_payment(uuid, date, numeric, text) to authenticated;

notify pgrst, 'reload schema';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf'];

drop policy if exists receipts_read_owner_or_admin on storage.objects;
create policy receipts_read_owner_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and public.reimflow_is_active()
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.reimflow_is_admin()
    )
  );
drop policy if exists receipts_insert_own_folder on storage.objects;
create policy receipts_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.reimflow_is_active()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'pdf')
  );
drop policy if exists receipts_delete_unsubmitted_own_file on storage.objects;
create policy receipts_delete_unsubmitted_own_file on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and public.reimflow_is_active()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.reimbursements r where r.receipt_path = storage.objects.name
    )
  );

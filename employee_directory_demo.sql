-- Add admin-only employee records that do not require Supabase Auth accounts.
-- Demo reimbursement rows are kept separate from real reimbursements/payments.

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

create index if not exists employee_directory_department_id_idx on public.employee_directory(department_id);
create index if not exists employee_demo_reimbursements_employee_date_idx on public.employee_demo_reimbursements(employee_id, transaction_date desc);

alter table public.employee_directory enable row level security;
alter table public.employee_demo_reimbursements enable row level security;

revoke all on public.employee_directory, public.employee_demo_reimbursements from anon, authenticated;
grant select on public.employee_directory, public.employee_demo_reimbursements to authenticated;

drop policy if exists employee_directory_admin_manage on public.employee_directory;
create policy employee_directory_admin_manage on public.employee_directory
  for all to authenticated
  using (public.reimflow_is_admin())
  with check (public.reimflow_is_admin());

drop policy if exists employee_demo_reimbursements_admin_read on public.employee_demo_reimbursements;
create policy employee_demo_reimbursements_admin_read on public.employee_demo_reimbursements
  for select to authenticated
  using (public.reimflow_is_admin());

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

notify pgrst, 'reload schema';

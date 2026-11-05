-- Seed departments and profile rows for Auth users that already exist.
-- Create these accounts in Supabase Auth first, with the emails below.
insert into public.departments (department_name) values
  ('Finance'),
  ('Engineering'),
  ('Product'),
  ('Marketing'),
  ('Human Resources')
on conflict (department_name) do nothing;

insert into public.profiles (id, full_name, email, department_id, role)
select
  u.id,
  case lower(u.email)
    when 'admin@arunikadigital.co.id' then 'Nadia Pratama'
    when 'andi@arunikadigital.co.id' then 'Andi Wijaya'
    when 'sinta@arunikadigital.co.id' then 'Sinta Maharani'
    when 'budi@arunikadigital.co.id' then 'Budi Santoso'
  end,
  lower(u.email),
  d.id,
  case when lower(u.email) = 'admin@arunikadigital.co.id' then 'admin' else 'employee' end
from auth.users u
join public.departments d on d.department_name = case
  when lower(u.email) = 'admin@arunikadigital.co.id' then 'Finance'
  when lower(u.email) = 'andi@arunikadigital.co.id' then 'Engineering'
  when lower(u.email) = 'sinta@arunikadigital.co.id' then 'Product'
  when lower(u.email) = 'budi@arunikadigital.co.id' then 'Marketing'
end
where lower(u.email) in (
  'admin@arunikadigital.co.id',
  'andi@arunikadigital.co.id',
  'sinta@arunikadigital.co.id',
  'budi@arunikadigital.co.id'
)
on conflict (id) do update
set full_name = excluded.full_name,
    email = excluded.email,
    department_id = excluded.department_id,
    role = excluded.role;

-- Optional demo transactions. Upload a valid PNG/JPG/PDF in Storage first:
-- <employee-auth-uuid>/seed/demo-receipt.png for Andi, Sinta, and Budi.
-- Rows are inserted only when their evidence objects exist.
with demo_rows as (
  select
    'RF-DEMO-001'::text as request_number,
    a.id as employee_id,
    current_date - 4 as transaction_date,
    'Transportasi'::text as category,
    125000::numeric as amount,
    'Perjalanan ke lokasi rapat klien.'::text as description,
    a.id::text || '/seed/demo-receipt.png' as receipt_path,
    'Menunggu Persetujuan'::text as status,
    null::text as rejection_reason,
    null::uuid as reviewed_by,
    null::timestamptz as reviewed_at
  from public.profiles a
  where a.email = 'andi@arunikadigital.co.id'
  union all
  select
    'RF-DEMO-002', s.id, current_date - 7, 'Konsumsi', 86000,
    'Konsumsi untuk sesi perencanaan tim.', s.id::text || '/seed/demo-receipt.png',
    'Ditolak', 'Bukti transaksi tidak mencantumkan tanggal yang terbaca.', f.id, now() - interval '3 days'
  from public.profiles s
  cross join public.profiles f
  where s.email = 'sinta@arunikadigital.co.id'
    and f.email = 'admin@arunikadigital.co.id'
  union all
  select
    'RF-DEMO-003', b.id, current_date - 6, 'Perlengkapan Kantor', 240000,
    'Adapter dan kabel untuk ruang kerja.', b.id::text || '/seed/demo-receipt.png',
    'Disetujui', null, f.id, now() - interval '2 days'
  from public.profiles b
  cross join public.profiles f
  where b.email = 'budi@arunikadigital.co.id'
    and f.email = 'admin@arunikadigital.co.id'
  union all
  select
    'RF-DEMO-004', a.id, current_date - 14, 'Komunikasi dan Internet', 175000,
    'Paket data untuk keperluan proyek.', a.id::text || '/seed/demo-receipt.png',
    'Dibayarkan', null, f.id, now() - interval '10 days'
  from public.profiles a
  cross join public.profiles f
  where a.email = 'andi@arunikadigital.co.id'
    and f.email = 'admin@arunikadigital.co.id'
)
insert into public.reimbursements (
  request_number, employee_id, transaction_date, category, amount, description,
  receipt_path, status, rejection_reason, reviewed_by, reviewed_at
)
select d.*
from demo_rows d
where exists (
  select 1 from storage.objects o
  where o.bucket_id = 'receipts' and o.name = d.receipt_path
)
on conflict (request_number) do nothing;

insert into public.payments (
  reimbursement_id, paid_by, payment_date, paid_amount, payment_reference
)
select r.id, admin_profile.id, current_date - 9, r.amount, 'DEMO-TRANSFER-004'
from public.reimbursements r
join public.profiles employee on employee.id = r.employee_id
join public.profiles admin_profile on admin_profile.email = 'admin@arunikadigital.co.id'
where r.request_number = 'RF-DEMO-004'
  and r.status = 'Dibayarkan'
on conflict (reimbursement_id) do nothing;

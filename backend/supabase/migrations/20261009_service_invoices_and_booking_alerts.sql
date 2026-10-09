-- EcoStream service invoice workflow and booking notifications.
-- Applied to Supabase project ozvpxgtpsebatjzoixfz on 2026-10-09.
-- This migration is idempotent; review policies before adapting to another environment.

create sequence if not exists public.service_invoice_number_seq;

create table if not exists public.service_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('ECS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.service_invoice_number_seq')::text, 5, '0')),
  booking_id uuid references public.bookings(id) on delete set null,
  client_id uuid not null references public.profiles(id) on delete restrict,
  service_type text not null,
  client_name text not null,
  client_phone text,
  client_address text,
  service_address text not null,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  tax numeric(12,2) not null default 0 check (tax >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  currency text not null default 'GMD',
  payment_terms text,
  due_date date,
  service_date date,
  service_time text,
  schedule_status text not null default 'not-requested' check (schedule_status in ('not-requested','requested','confirmed','reschedule-requested','cancelled')),
  schedule_notes text,
  notes text,
  status text not null default 'draft' check (status in ('draft','approved','sent','paid','overdue','cancelled')),
  pdf_storage_key text,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_invoices_client_id_idx on public.service_invoices(client_id);
create index if not exists service_invoices_booking_id_idx on public.service_invoices(booking_id);
create index if not exists service_invoices_status_idx on public.service_invoices(status);
create index if not exists service_invoices_created_at_idx on public.service_invoices(created_at desc);

alter table public.service_invoices enable row level security;

drop policy if exists "service invoices visible to owner and staff" on public.service_invoices;
create policy "service invoices visible to owner and staff"
on public.service_invoices for select to authenticated
using (
  (client_id = auth.uid() and status in ('sent','paid','overdue','cancelled'))
  or (select private.is_staff_or_admin())
);

drop policy if exists "staff can create service invoices" on public.service_invoices;
create policy "staff can create service invoices"
on public.service_invoices for insert to authenticated
with check ((select private.is_staff_or_admin()));

drop policy if exists "staff can update service invoices" on public.service_invoices;
create policy "staff can update service invoices"
on public.service_invoices for update to authenticated
using ((select private.is_staff_or_admin()))
with check ((select private.is_staff_or_admin()));

create or replace function public.notify_admin_of_new_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_label text;
begin
  service_label := case new.request_type
    when 'drilling' then 'Borehole Drilling'
    when 'site-survey' then 'Site Survey'
    when 'maintenance' then 'Borehole Maintenance'
    when 'repair' then 'Borehole Repair'
    when 'solar-installation' then 'Solar Water Installation'
    when 'pump-service' then 'Water Pump Services'
    when 'cleaning' then 'Borehole Cleaning'
    when 'water-quality' then 'Water Quality Testing'
    else initcap(replace(new.request_type, '-', ' '))
  end;
  insert into public.notifications(user_id, type, title, message, read, date, created_at)
  values (
    null, 'booking', 'New service booking received',
    service_label || ' request received for ' || coalesce(new.drilling_location, 'site address not provided') || '. Open Bookings in the admin portal to review and prepare an invoice.',
    false, now(), now()
  );
  return new;
end;
$$;

drop trigger if exists bookings_notify_admin_after_insert on public.bookings;
create trigger bookings_notify_admin_after_insert
after insert on public.bookings
for each row execute function public.notify_admin_of_new_booking();

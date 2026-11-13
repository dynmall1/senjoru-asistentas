-- Pradinė schema: klientai, paslaugų teikėjai, paslaugos, laikai, registracijos.

create table public.clients (
  id             uuid primary key default gen_random_uuid(),
  phone          text not null unique,          -- formatas +3706xxxxxxx
  full_name      text,
  birth_year     int,
  relative_phone text,                          -- artimojo numeris (SMS kopijai)
  notes          text,
  created_at     timestamptz not null default now()
);

create table public.providers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null,                    -- gydytojas, kirpykla, odontologas, ...
  address     text,
  city        text,
  phone       text,
  description text,
  source_url  text,                             -- iš kur paimta (Firecrawl)
  created_at  timestamptz not null default now()
);

create table public.services (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references public.providers(id) on delete cascade,
  name         text not null,
  duration_min int  not null default 30,
  price_eur    numeric(8,2)                     -- null = nemokama / kompensuojama
);

create table public.slots (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  starts_at  timestamptz not null,
  is_booked  boolean not null default false
);
create index slots_free_idx on public.slots (service_id, starts_at) where not is_booked;

create table public.bookings (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  slot_id     uuid not null references public.slots(id) on delete cascade,
  status      text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_via text not null default 'phone',
  created_at  timestamptz not null default now()
);
-- Vienam laikui gali būti tik viena aktyvi registracija.
create unique index bookings_one_active_per_slot on public.bookings (slot_id) where status = 'confirmed';

-- Patogus vaizdas admin panelei (Lovable).
create view public.bookings_overview with (security_invoker = true) as
select b.id, b.status, b.created_via, b.created_at,
       sl.starts_at,
       c.full_name as client_name, c.phone as client_phone,
       s.name as service_name,
       p.name as provider_name, p.address, p.city, p.category
from public.bookings b
join public.clients   c  on c.id  = b.client_id
join public.slots     sl on sl.id = b.slot_id
join public.services  s  on s.id  = sl.service_id
join public.providers p  on p.id  = s.provider_id;

-- Atominė registracija: užima laiką ir sukuria registraciją vienoje transakcijoje.
create function public.book_slot(p_phone text, p_slot_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_client  uuid;
  v_booking uuid;
begin
  select id into v_client from clients where phone = p_phone;
  if v_client is null then
    raise exception 'CLIENT_NOT_FOUND';
  end if;

  update slots set is_booked = true
   where id = p_slot_id and not is_booked and starts_at > now();
  if not found then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  insert into bookings (client_id, slot_id) values (v_client, p_slot_id)
  returning id into v_booking;

  return json_build_object('booking_id', v_booking);
end $$;

-- Atšaukimas: tik savo (pagal telefoną) registraciją; laikas vėl tampa laisvas.
create function public.cancel_booking(p_phone text, p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_slot uuid;
begin
  update bookings b set status = 'cancelled'
    from clients c
   where b.id = p_booking_id and b.client_id = c.id
     and c.phone = p_phone and b.status = 'confirmed'
  returning b.slot_id into v_slot;
  if v_slot is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  update slots set is_booked = false where id = v_slot;
end $$;

-- Funkcijas kviečia tik Edge Functions (service role), ne naršyklė.
revoke execute on function public.book_slot(text, uuid)      from public, anon, authenticated;
revoke execute on function public.cancel_booking(text, uuid) from public, anon, authenticated;

-- RLS: anonimai nieko nemato; prisijungę darbuotojai (admin panelė) mato ir redaguoja viską.
-- Edge Functions naudoja service role, kuriam RLS netaikomas.
alter table public.clients   enable row level security;
alter table public.providers enable row level security;
alter table public.services  enable row level security;
alter table public.slots     enable row level security;
alter table public.bookings  enable row level security;

create policy "darbuotojai_viskas" on public.clients   for all to authenticated using (true) with check (true);
create policy "darbuotojai_viskas" on public.providers for all to authenticated using (true) with check (true);
create policy "darbuotojai_viskas" on public.services  for all to authenticated using (true) with check (true);
create policy "darbuotojai_viskas" on public.slots     for all to authenticated using (true) with check (true);
create policy "darbuotojai_viskas" on public.bookings  for all to authenticated using (true) with check (true);

-- Realtime: admin panelė iškart mato naujas registracijas.
alter publication supabase_realtime add table public.bookings;

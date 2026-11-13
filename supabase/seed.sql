-- Demo duomenys hakatonui (išgalvoti teikėjai). Firecrawl skriptas vėliau pridės tikrų.

insert into public.providers (id, name, category, address, city, phone, description) values
  ('a0000000-0000-0000-0000-000000000001', 'Šeimos klinika „Sveikata“',        'gydytojas',            'Gedimino pr. 10',  'Vilnius', '+37052000001', 'Šeimos gydytojas, slaugytoja, kraujo tyrimai, skiepai'),
  ('a0000000-0000-0000-0000-000000000002', 'Kirpykla „Sidabrinė šukuosena“',   'kirpykla',             'Žirmūnų g. 45',    'Vilnius', '+37052000002', 'Kirpimas, plaukų dažymas, senjorams nuolaida'),
  ('a0000000-0000-0000-0000-000000000003', 'Vilniaus socialinių paslaugų centras', 'socialinės paslaugos', 'Kalvarijų g. 30', 'Vilnius', '+37052000003', 'Pagalba namuose, socialinis darbuotojas, konsultacijos dėl išmokų'),
  ('a0000000-0000-0000-0000-000000000004', 'Odontologijos klinika „Šypsena“',  'odontologas',          'Laisvės al. 50',   'Kaunas',  '+37037000004', 'Dantų gydymas, protezavimas, dantų higiena'),
  ('a0000000-0000-0000-0000-000000000005', 'Kauno senjorų transportas',        'transportas',          'Savanorių pr. 100','Kaunas',  '+37037000005', 'Pavėžėjimas pas gydytoją, į parduotuvę, su neįgaliojo vežimėliu'),
  ('a0000000-0000-0000-0000-000000000006', 'Pėdų priežiūros kabinetas „Žingsnis“', 'pedikiūras',       'Vilniaus g. 12',   'Kaunas',  '+37037000006', 'Medicininis pedikiūras, nagų priežiūra, diabetinė pėda');

insert into public.services (provider_id, name, duration_min, price_eur) values
  ('a0000000-0000-0000-0000-000000000001', 'Šeimos gydytojo konsultacija', 20, null),
  ('a0000000-0000-0000-0000-000000000001', 'Kraujo tyrimai',               15, null),
  ('a0000000-0000-0000-0000-000000000001', 'Skiepijimas nuo gripo',         15, null),
  ('a0000000-0000-0000-0000-000000000002', 'Kirpimas',                      45, 15),
  ('a0000000-0000-0000-0000-000000000002', 'Plaukų dažymas',                90, 35),
  ('a0000000-0000-0000-0000-000000000003', 'Socialinio darbuotojo konsultacija', 45, null),
  ('a0000000-0000-0000-0000-000000000003', 'Pagalbos į namus užsakymas',    30, null),
  ('a0000000-0000-0000-0000-000000000004', 'Dantų patikra',                 30, 25),
  ('a0000000-0000-0000-0000-000000000004', 'Dantų protezų pataisymas',      60, 40),
  ('a0000000-0000-0000-0000-000000000005', 'Pavėžėjimas pas gydytoją',      60, 5),
  ('a0000000-0000-0000-0000-000000000006', 'Medicininis pedikiūras',        60, 30);

-- Laisvi laikai: ateinančios 7 dienos, darbo dienomis 9–16 val. (Vilniaus laiku),
-- ~30 % laikų atsitiktinai užimti, kad atrodytų tikroviškai.
insert into public.slots (service_id, starts_at, is_booked)
select s.id,
       (d::date + make_interval(hours => h)) at time zone 'Europe/Vilnius',
       random() < 0.3
from public.services s
cross join generate_series(current_date + 1, current_date + 7, interval '1 day') d
cross join generate_series(9, 16) h
where extract(isodow from d) < 6;

-- Demo klientė pristatymui.
insert into public.clients (phone, full_name, birth_year) values
  ('+37060000000', 'Ona Petraitienė', 1948);

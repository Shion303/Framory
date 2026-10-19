-- Framory — sincronizzazione automatica della libreria tra dispositivi.
-- Una sola riga JSON per libreria condivisa (nessun Sync Code manuale).
-- Esegui questo script in Supabase → SQL Editor.

create table if not exists public.watchlists (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.watchlists enable row level security;

-- ATTENZIONE: policy permissive pensate per un'app personale a utente singolo.
-- Chi possiede la anon key del progetto può leggere/scrivere la riga condivisa.
drop policy if exists "framory_read" on public.watchlists;
create policy "framory_read" on public.watchlists
  for select using (true);

drop policy if exists "framory_write" on public.watchlists;
create policy "framory_write" on public.watchlists
  for all using (true) with check (true);

-- Abilita il Realtime (idempotente)
do $$
begin
  alter publication supabase_realtime add table public.watchlists;
exception
  when duplicate_object then null;
end $$;

-- Riga iniziale della libreria condivisa
insert into public.watchlists (id, data)
values ('framory-global', '{}'::jsonb)
on conflict (id) do nothing;

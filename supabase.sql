-- ONE / ONE realtime rooms
-- Run once in Supabase Dashboard → SQL Editor.
create table if not exists public.rooms (
  id text primary key check (id ~ '^[0-9]{6}$'),
  mode text not null check (mode in ('random','private')),
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  player1 uuid not null,
  player2 uuid,
  player1_name text not null default '玩家 1',
  player2_name text,
  album_order jsonb not null default '[]'::jsonb,
  current_index integer not null default 0,
  choices jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
grant select, insert, update on public.rooms to authenticated;

drop policy if exists "read waiting or own rooms" on public.rooms;
create policy "read waiting or own rooms" on public.rooms for select to authenticated
using (status = 'waiting' or auth.uid() = player1 or auth.uid() = player2);

drop policy if exists "create own rooms" on public.rooms;
create policy "create own rooms" on public.rooms for insert to authenticated
with check (auth.uid() = player1 and player2 is null);

drop policy if exists "join or update own rooms" on public.rooms;
create policy "join or update own rooms" on public.rooms for update to authenticated
using (auth.uid() = player1 or auth.uid() = player2 or (status = 'waiting' and player2 is null))
with check (auth.uid() = player1 or auth.uid() = player2);

create or replace function public.touch_room()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists rooms_touch on public.rooms;
create trigger rooms_touch before update on public.rooms for each row execute function public.touch_room();

create or replace function public.submit_choice(p_room text, p_album text, p_choice jsonb)
returns setof public.rooms
language plpgsql security definer set search_path = public
as $$
declare r public.rooms; slot text; updated_choices jsonb; next_index integer;
begin
  select * into r from public.rooms where id = p_room for update;
  if r.id is null then raise exception 'room not found'; end if;
  if auth.uid() = r.player1 then slot := 'p1';
  elsif auth.uid() = r.player2 then slot := 'p2';
  else raise exception 'not a participant'; end if;
  if r.status <> 'playing' then raise exception 'room not playing'; end if;
  if r.album_order ->> r.current_index <> p_album then raise exception 'wrong album'; end if;
  updated_choices := coalesce(r.choices, '{}'::jsonb);
  if not (updated_choices ? p_album) then
    updated_choices := jsonb_set(updated_choices, array[p_album], '{}'::jsonb, true);
  end if;
  if (updated_choices -> p_album) ? slot then raise exception 'already chosen'; end if;
  updated_choices := jsonb_set(updated_choices, array[p_album,slot], p_choice, true);
  next_index := r.current_index;
  if (updated_choices -> p_album) ? 'p1' and (updated_choices -> p_album) ? 'p2' then
    next_index := next_index + 1;
  end if;
  update public.rooms set choices=updated_choices,current_index=next_index,
    status=case when next_index >= jsonb_array_length(r.album_order) then 'finished' else status end
  where id=p_room;
  return query select * from public.rooms where id=p_room;
end $$;

revoke all on function public.submit_choice(text,text,jsonb) from public;
grant execute on function public.submit_choice(text,text,jsonb) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

-- Optional cleanup helper: old rooms are ignored by matchmaking automatically.


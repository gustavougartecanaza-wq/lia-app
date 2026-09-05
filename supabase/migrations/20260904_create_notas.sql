create table public.notas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  titulo text not null,
  fecha date not null default current_date,
  asistentes text,
  contenido text not null,
  creado_en timestamptz not null default now()
);

alter table public.notas enable row level security;

create policy "Los usuarios pueden ver sus propias notas"
  on public.notas for select
  using (auth.uid() = usuario_id);

create policy "Los usuarios pueden crear sus propias notas"
  on public.notas for insert
  with check (auth.uid() = usuario_id);

create policy "Los usuarios pueden actualizar sus propias notas"
  on public.notas for update
  using (auth.uid() = usuario_id);

create policy "Los usuarios pueden borrar sus propias notas"
  on public.notas for delete
  using (auth.uid() = usuario_id);

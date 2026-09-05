create table public.contactos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  nombre text not null,
  cargo text,
  empresa text,
  telefono text,
  correo text,
  notas text,
  creado_en timestamptz not null default now()
);

alter table public.contactos enable row level security;

create policy "Los usuarios pueden ver sus propios contactos"
  on public.contactos for select
  using (auth.uid() = usuario_id);

create policy "Los usuarios pueden crear sus propios contactos"
  on public.contactos for insert
  with check (auth.uid() = usuario_id);

create policy "Los usuarios pueden actualizar sus propios contactos"
  on public.contactos for update
  using (auth.uid() = usuario_id);

create policy "Los usuarios pueden borrar sus propios contactos"
  on public.contactos for delete
  using (auth.uid() = usuario_id);

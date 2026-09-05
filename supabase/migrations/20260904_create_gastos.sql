create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  concepto text not null,
  monto numeric(10,2) not null,
  categoria text check (categoria in ('transporte','materiales','alimentacion','servicios','otros')),
  fecha date not null default current_date,
  creado_en timestamptz not null default now()
);

alter table public.gastos enable row level security;

create policy "Los usuarios pueden ver sus propios gastos"
  on public.gastos for select
  using (auth.uid() = usuario_id);

create policy "Los usuarios pueden crear sus propios gastos"
  on public.gastos for insert
  with check (auth.uid() = usuario_id);

create policy "Los usuarios pueden actualizar sus propios gastos"
  on public.gastos for update
  using (auth.uid() = usuario_id);

create policy "Los usuarios pueden borrar sus propios gastos"
  on public.gastos for delete
  using (auth.uid() = usuario_id);

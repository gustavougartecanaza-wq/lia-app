-- Adds a role system (admin/usuario) with a trigger that prevents any
-- non-admin, non-service-role caller from changing their own (or anyone
-- else's) role — closes the obvious self-promotion hole that a bare
-- RLS "own row" update policy would otherwise leave open.

alter table public.profiles
  add column if not exists rol text not null default 'usuario' check (rol in ('admin','usuario'));

create or replace function public.proteger_rol_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.rol is distinct from OLD.rol then
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
      return NEW;
    end if;
    if not exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin') then
      NEW.rol := OLD.rol;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_proteger_rol_perfil on public.profiles;
create trigger trg_proteger_rol_perfil
before update on public.profiles
for each row execute function public.proteger_rol_perfil();

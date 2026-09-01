-- Adds priority and recurrence to tasks, plus a trigger that generates
-- the next occurrence of a recurring task when it's marked completed.

alter table public.tareas
  add column if not exists prioridad text not null default 'media' check (prioridad in ('alta','media','baja')),
  add column if not exists recurrencia text check (recurrencia in ('diaria','semanal','mensual'));

create or replace function public.generar_siguiente_tarea_recurrente()
returns trigger
language plpgsql
as $$
declare
  nueva_fecha date;
begin
  if NEW.completada = true and OLD.completada = false and NEW.recurrencia is not null then
    nueva_fecha := (case NEW.recurrencia
      when 'diaria' then coalesce(NEW.fecha, current_date) + interval '1 day'
      when 'semanal' then coalesce(NEW.fecha, current_date) + interval '7 day'
      when 'mensual' then coalesce(NEW.fecha, current_date) + interval '1 month'
    end)::date;

    if nueva_fecha is not null then
      insert into public.tareas (usuario_id, titulo, fecha, completada, prioridad, recurrencia)
      values (NEW.usuario_id, NEW.titulo, nueva_fecha, false, NEW.prioridad, NEW.recurrencia);
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_generar_siguiente_tarea_recurrente on public.tareas;
create trigger trg_generar_siguiente_tarea_recurrente
after update on public.tareas
for each row execute function public.generar_siguiente_tarea_recurrente();

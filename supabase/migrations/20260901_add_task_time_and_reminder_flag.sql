-- Adds exact-time reminders: an optional 'hora' per task, and a flag to
-- avoid re-sending the same time-based push once it has gone out.

alter table public.tareas
  add column if not exists hora time,
  add column if not exists recordatorio_enviado boolean not null default false;

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
      insert into public.tareas (usuario_id, titulo, fecha, hora, completada, prioridad, recurrencia)
      values (NEW.usuario_id, NEW.titulo, nueva_fecha, NEW.hora, false, NEW.prioridad, NEW.recurrencia);
    end if;
  end if;
  return NEW;
end;
$$;

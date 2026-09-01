import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function ahoraEnTz(tz: string): { fecha: string; hora: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const partes = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

Deno.serve(async (req: Request) => {
  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT")!,
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );

    const { data: tareas, error: tareasError } = await supabase
      .from("tareas")
      .select("id, usuario_id, titulo, fecha, hora")
      .eq("completada", false)
      .eq("recordatorio_enviado", false)
      .not("hora", "is", null)
      .not("fecha", "is", null);
    if (tareasError) throw tareasError;

    if (!tareas || tareas.length === 0) {
      return new Response(JSON.stringify({ enviados: 0, motivo: "sin recordatorios de hora pendientes" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const usuarioIds = [...new Set(tareas.map((t) => t.usuario_id))];
    const { data: perfiles, error: perfilesError } = await supabase
      .from("profiles")
      .select("id, zona_horaria")
      .in("id", usuarioIds);
    if (perfilesError) throw perfilesError;

    const tzPorUsuario = new Map(
      (perfiles ?? []).map((p) => [p.id, p.zona_horaria || "America/La_Paz"]),
    );

    const tareasAVencer = tareas.filter((t) => {
      const tz = tzPorUsuario.get(t.usuario_id) ?? "America/La_Paz";
      const ahora = ahoraEnTz(tz);
      if (t.fecha !== ahora.fecha) return false;
      const horaTarea = String(t.hora).slice(0, 5);
      return horaTarea <= ahora.hora;
    });

    if (tareasAVencer.length === 0) {
      return new Response(JSON.stringify({ enviados: 0, motivo: "ninguna vence todavía" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const idsUsuariosAVencer = [...new Set(tareasAVencer.map((t) => t.usuario_id))];
    const { data: subs, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("id, usuario_id, endpoint, p256dh, auth")
      .in("usuario_id", idsUsuariosAVencer);
    if (subsError) throw subsError;

    let enviados = 0;
    let eliminados = 0;
    const errores: string[] = [];

    for (const t of tareasAVencer) {
      const subsUsuario = (subs ?? []).filter((s) => s.usuario_id === t.usuario_id);
      const payload = JSON.stringify({ title: "Lia — recordatorio", body: t.titulo, url: "./?view=tasks" });

      for (const sub of subsUsuario) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          enviados++;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
            eliminados++;
          } else {
            errores.push(String(err));
          }
        }
      }

      await supabase.from("tareas").update({ recordatorio_enviado: true }).eq("id", t.id);
    }

    return new Response(
      JSON.stringify({ revisados: tareasAVencer.length, enviados, eliminados, errores }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

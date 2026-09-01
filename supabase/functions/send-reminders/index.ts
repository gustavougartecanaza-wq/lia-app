import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function hoyEnTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
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
      .select("usuario_id, titulo, fecha")
      .eq("completada", false)
      .not("fecha", "is", null);
    if (tareasError) throw tareasError;

    if (!tareas || tareas.length === 0) {
      return new Response(JSON.stringify({ enviados: 0, motivo: "sin tareas pendientes" }), {
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

    const porUsuario = new Map<string, string[]>();
    for (const t of tareas) {
      const tz = tzPorUsuario.get(t.usuario_id) ?? "America/La_Paz";
      if (t.fecha === hoyEnTz(tz)) {
        if (!porUsuario.has(t.usuario_id)) porUsuario.set(t.usuario_id, []);
        porUsuario.get(t.usuario_id)!.push(t.titulo);
      }
    }

    if (porUsuario.size === 0) {
      return new Response(JSON.stringify({ enviados: 0, motivo: "nadie tiene tareas para hoy" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: subs, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("id, usuario_id, endpoint, p256dh, auth")
      .in("usuario_id", [...porUsuario.keys()]);
    if (subsError) throw subsError;

    let enviados = 0;
    let eliminados = 0;
    const errores: string[] = [];

    for (const sub of subs ?? []) {
      const titulos = porUsuario.get(sub.usuario_id) ?? [];
      if (titulos.length === 0) continue;

      const cuerpo = titulos.length === 1
        ? `Tienes pendiente: ${titulos[0]}`
        : `Tienes ${titulos.length} tareas pendientes hoy: ${titulos.slice(0, 3).join(", ")}${titulos.length > 3 ? "…" : ""}`;

      const payload = JSON.stringify({ title: "Lia — recordatorio", body: cuerpo, url: "./?view=tasks" });

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

    return new Response(JSON.stringify({ enviados, eliminados, errores }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

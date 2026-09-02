import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { accion, id, rol } = await req.json();

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseComoUsuario = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabaseComoUsuario.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "No se pudo verificar el usuario autenticado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: perfil, error: perfilError } = await supabaseComoUsuario
      .from("profiles")
      .select("rol")
      .eq("id", user.id)
      .maybeSingle();

    if (perfilError || !perfil || perfil.rol !== "admin") {
      return new Response(
        JSON.stringify({ error: "Solo un administrador puede gestionar usuarios." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (accion === "listar") {
      const { data: perfiles, error: perfilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, nombre, rol, creado_en")
        .order("creado_en", { ascending: true });
      if (perfilesError) throw perfilesError;

      const { data: listaAuth, error: authListError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (authListError) throw authListError;

      const emailPorId = new Map(listaAuth.users.map((u) => [u.id, u.email ?? null]));
      const usuarios = (perfiles ?? []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        rol: p.rol,
        email: emailPorId.get(p.id) ?? null,
        creado_en: p.creado_en,
      }));

      return new Response(JSON.stringify({ usuarios }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (accion === "cambiar_rol") {
      if (!id || (rol !== "admin" && rol !== "usuario")) {
        return new Response(JSON.stringify({ error: "Faltan datos válidos (id, rol)." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (rol === "usuario") {
        const { data: objetivo } = await supabaseAdmin.from("profiles").select("rol").eq("id", id).maybeSingle();
        if (objetivo?.rol === "admin") {
          const { count } = await supabaseAdmin
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("rol", "admin");
          if ((count ?? 0) <= 1) {
            return new Response(JSON.stringify({ error: "No puedes quitarle admin al último administrador." }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      const { error: updateError } = await supabaseAdmin.from("profiles").update({ rol }).eq("id", id);
      if (updateError) throw updateError;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (accion === "eliminar") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Falta id." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (id === user.id) {
        return new Response(JSON.stringify({ error: "No puedes eliminar tu propia cuenta desde aquí." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: objetivo } = await supabaseAdmin.from("profiles").select("rol").eq("id", id).maybeSingle();
      if (objetivo?.rol === "admin") {
        const { count } = await supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("rol", "admin");
        if ((count ?? 0) <= 1) {
          return new Response(JSON.stringify({ error: "No puedes eliminar al último administrador." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Acción desconocida." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Error interno", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

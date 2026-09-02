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
    const { nombre, email, password } = await req.json();

    if (!nombre || !email || !password) {
      return new Response(
        JSON.stringify({ error: "Faltan nombre, correo o contraseña." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (String(password).length < 8) {
      return new Response(
        JSON.stringify({ error: "La contraseña debe tener al menos 8 caracteres." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
        JSON.stringify({ error: "Solo un administrador puede crear usuarios." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: nuevoUsuario, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError || !nuevoUsuario.user) {
      return new Response(
        JSON.stringify({ error: createError?.message ?? "No se pudo crear el usuario." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: nuevoUsuario.user.id,
      nombre,
      rol: "usuario",
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(nuevoUsuario.user.id);
      return new Response(
        JSON.stringify({ error: "No se pudo crear el perfil: " + profileError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, usuario: { id: nuevoUsuario.user.id, email, nombre } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Error interno", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

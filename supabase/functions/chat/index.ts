import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const tools = [
  {
    name: "crear_tarea",
    description:
      "Crea una nueva tarea para el usuario. Úsala cuando pida agregar, anotar o recordar algo pendiente.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título breve de la tarea." },
        fecha: {
          type: "string",
          description:
            "Fecha en formato YYYY-MM-DD. Si el usuario no da fecha, usa la fecha de hoy indicada en el contexto.",
        },
      },
      required: ["titulo", "fecha"],
    },
  },
  {
    name: "listar_tareas",
    description:
      "Lista las tareas del usuario. Úsala para responder qué tiene pendiente, y antes de completar o eliminar una tarea para conocer su id exacto.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Filtra por fecha exacta YYYY-MM-DD (opcional)." },
        solo_pendientes: { type: "boolean", description: "Si es true, solo devuelve tareas no completadas." },
      },
    },
  },
  {
    name: "marcar_tarea",
    description: "Marca una tarea como completada o pendiente, dado su id (obtenido con listar_tareas).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID (uuid) de la tarea." },
        completada: { type: "boolean" },
      },
      required: ["id", "completada"],
    },
  },
  {
    name: "eliminar_tarea",
    description: "Elimina permanentemente una tarea, dado su id (obtenido con listar_tareas).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID (uuid) de la tarea." },
      },
      required: ["id"],
    },
  },
];

async function ejecutarHerramienta(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  name: string,
  input: Record<string, unknown>,
) {
  if (name === "crear_tarea") {
    const { data, error } = await supabase
      .from("tareas")
      .insert({
        usuario_id: userId,
        titulo: String(input.titulo ?? "").slice(0, 500),
        fecha: input.fecha ?? null,
        completada: false,
      })
      .select("id, titulo, fecha, completada")
      .single();
    if (error) return { error: error.message };
    return { tarea: data };
  }

  if (name === "listar_tareas") {
    let query = supabase
      .from("tareas")
      .select("id, titulo, fecha, completada")
      .eq("usuario_id", userId)
      .order("fecha", { ascending: true, nullsFirst: false });
    if (typeof input.fecha === "string") query = query.eq("fecha", input.fecha);
    if (input.solo_pendientes) query = query.eq("completada", false);
    const { data, error } = await query;
    if (error) return { error: error.message };
    return { tareas: data };
  }

  if (name === "marcar_tarea") {
    const { data, error } = await supabase
      .from("tareas")
      .update({ completada: Boolean(input.completada) })
      .eq("id", String(input.id))
      .eq("usuario_id", userId)
      .select("id, titulo, fecha, completada")
      .single();
    if (error) return { error: error.message };
    return { tarea: data };
  }

  if (name === "eliminar_tarea") {
    const { error } = await supabase
      .from("tareas")
      .delete()
      .eq("id", String(input.id))
      .eq("usuario_id", userId);
    if (error) return { error: error.message };
    return { eliminado: true };
  }

  return { error: "Herramienta desconocida: " + name };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages, nombre, fechaHoy, horaActual } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Falta el arreglo 'messages'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY no está configurada en los secretos del proyecto." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "No se pudo verificar el usuario autenticado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt =
      `Eres Lia, un asistente personal tipo secretario/a: formal, ingenioso/a, proactivo/a y eficiente. ` +
      `Anticipas necesidades, vas directo al punto sin relleno, y usas humor seco y sutil (nunca burlón). ` +
      `Usa siempre un trato formal y respetuoso (de usted). ` +
      (nombre ? `El nombre de la persona con la que hablas es ${nombre}. ` : "") +
      (fechaHoy ? `Hoy es ${fechaHoy}${horaActual ? `, son las ${horaActual}` : ""}. ` : "") +
      `Tienes herramientas para crear, listar, completar y eliminar tareas reales del usuario: úsalas siempre ` +
      `que te pida gestionar pendientes, en vez de solo responder en texto. Nunca inventes ni des por hecho el ` +
      `contenido de la agenda o las tareas: si no lo has consultado con una herramienta en esta conversación, no lo sabes.`;

    const conversationMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    let finalText = "";
    const maxIterations = 5;

    for (let i = 0; i < maxIterations; i++) {
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: systemPrompt,
          tools,
          messages: conversationMessages,
        }),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        return new Response(
          JSON.stringify({ error: "Error al llamar a la API de Claude", detail: errText }),
          { status: anthropicRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const data = await anthropicRes.json();
      const content = data.content ?? [];
      const toolUseBlocks = content.filter((b: { type: string }) => b.type === "tool_use");
      const textBlocks = content
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("\n");

      finalText = textBlocks;

      if (data.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        break;
      }

      conversationMessages.push({ role: "assistant", content });

      const toolResults = [];
      for (const tb of toolUseBlocks) {
        const result = await ejecutarHerramienta(supabase, user.id, tb.name, tb.input ?? {});
        toolResults.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: JSON.stringify(result),
        });
      }
      conversationMessages.push({ role: "user", content: toolResults });
    }

    return new Response(JSON.stringify({ reply: finalText || "No pude generar una respuesta." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Error interno", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

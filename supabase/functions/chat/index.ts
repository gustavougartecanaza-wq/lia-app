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
        hora: {
          type: "string",
          description:
            "Hora exacta en formato HH:MM (24h) SOLO si el usuario pidió que le recuerden algo a una hora específica " +
            "(ej. 'a las 3pm' → '15:00'). Si solo dio una fecha sin hora, omite este campo por completo.",
        },
        prioridad: {
          type: "string",
          enum: ["alta", "media", "baja"],
          description: "Prioridad de la tarea. Si no se especifica, usa 'media'.",
        },
        recurrencia: {
          type: "string",
          enum: ["diaria", "semanal", "mensual"],
          description:
            "Solo si la tarea se repite periódicamente (ej. 'todos los días', 'cada semana'). Omite si es una tarea única.",
        },
      },
      required: ["titulo", "fecha"],
    },
  },
  {
    name: "listar_tareas",
    description:
      "Lista las tareas del usuario, con su prioridad, hora y recurrencia. Úsala para responder qué tiene pendiente, y antes de modificar o eliminar una tarea para conocer su id exacto.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Filtra por fecha exacta YYYY-MM-DD (opcional)." },
        solo_pendientes: { type: "boolean", description: "Si es true, solo devuelve tareas no completadas." },
      },
    },
  },
  {
    name: "actualizar_tarea",
    description:
      "Modifica una tarea existente: título, fecha (reprogramar), hora, prioridad, recurrencia o si está completada. " +
      "Dado su id (obtenido con listar_tareas). Incluye solo los campos que cambian.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID (uuid) de la tarea." },
        titulo: { type: "string" },
        fecha: { type: "string", description: "Nueva fecha YYYY-MM-DD." },
        hora: { type: "string", description: "Nueva hora HH:MM (24h), o cadena vacía para quitar el recordatorio de hora exacta." },
        completada: { type: "boolean" },
        prioridad: { type: "string", enum: ["alta", "media", "baja"] },
        recurrencia: { type: "string", enum: ["diaria", "semanal", "mensual"] },
      },
      required: ["id"],
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
  {
    name: "crear_contacto",
    description: "Guarda un nuevo contacto del usuario (persona u organización con la que trata habitualmente).",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre del contacto." },
        cargo: { type: "string", description: "Cargo o puesto del contacto, si se conoce." },
        empresa: { type: "string", description: "Empresa u organización a la que pertenece, si se conoce." },
        telefono: { type: "string", description: "Número de teléfono, si se conoce." },
        correo: { type: "string", description: "Correo electrónico, si se conoce." },
        notas: { type: "string", description: "Cualquier otra información relevante sobre el contacto." },
      },
      required: ["nombre"],
    },
  },
  {
    name: "listar_contactos",
    description: "Lista los contactos guardados por el usuario. Úsala para buscar el teléfono o correo de alguien, o antes de modificar o eliminar un contacto para conocer su id exacto.",
    input_schema: {
      type: "object",
      properties: {
        busqueda: { type: "string", description: "Filtra por coincidencia parcial en el nombre o la empresa (opcional)." },
      },
    },
  },
  {
    name: "actualizar_contacto",
    description: "Modifica un contacto existente, dado su id (obtenido con listar_contactos). Incluye solo los campos que cambian.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID (uuid) del contacto." },
        nombre: { type: "string" },
        cargo: { type: "string" },
        empresa: { type: "string" },
        telefono: { type: "string" },
        correo: { type: "string" },
        notas: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "eliminar_contacto",
    description: "Elimina permanentemente un contacto, dado su id (obtenido con listar_contactos).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID (uuid) del contacto." },
      },
      required: ["id"],
    },
  },
  {
    name: "crear_nota",
    description: "Guarda una nota o acta de reunión del usuario. Úsala cuando pida tomar nota de algo, redactar un acta o dejar constancia de lo tratado en una reunión.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título breve de la nota o de la reunión." },
        contenido: { type: "string", description: "Contenido completo de la nota o acta, redactado en prosa clara." },
        fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD. Si no se indica, usa la fecha de hoy." },
        asistentes: { type: "string", description: "Personas que participaron en la reunión, si corresponde." },
      },
      required: ["titulo", "contenido"],
    },
  },
  {
    name: "listar_notas",
    description: "Lista las notas o actas guardadas por el usuario. Úsala para responder qué se trató en una reunión, y antes de modificar o eliminar una nota para conocer su id exacto.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Filtra por fecha exacta YYYY-MM-DD (opcional)." },
      },
    },
  },
  {
    name: "actualizar_nota",
    description: "Modifica una nota existente, dado su id (obtenido con listar_notas). Incluye solo los campos que cambian.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID (uuid) de la nota." },
        titulo: { type: "string" },
        contenido: { type: "string" },
        fecha: { type: "string" },
        asistentes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "eliminar_nota",
    description: "Elimina permanentemente una nota, dado su id (obtenido con listar_notas).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID (uuid) de la nota." },
      },
      required: ["id"],
    },
  },
  {
    name: "registrar_gasto",
    description: "Registra un gasto menor de caja chica. Úsala cuando el usuario indique que gastó o pagó algo.",
    input_schema: {
      type: "object",
      properties: {
        concepto: { type: "string", description: "Descripción breve del gasto." },
        monto: { type: "number", description: "Monto del gasto, en bolivianos." },
        categoria: {
          type: "string",
          enum: ["transporte", "materiales", "alimentacion", "servicios", "otros"],
          description: "Categoría del gasto. Si no se especifica o no encaja claramente, usa 'otros'.",
        },
        fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD. Si no se indica, usa la fecha de hoy." },
      },
      required: ["concepto", "monto"],
    },
  },
  {
    name: "listar_gastos",
    description: "Lista los gastos de caja chica registrados por el usuario, para responder cuánto se gastó o en qué, y para sumar totales. Antes de modificar o eliminar un gasto, úsala para conocer su id exacto.",
    input_schema: {
      type: "object",
      properties: {
        fecha_desde: { type: "string", description: "Filtra desde esta fecha YYYY-MM-DD (opcional)." },
        fecha_hasta: { type: "string", description: "Filtra hasta esta fecha YYYY-MM-DD (opcional)." },
      },
    },
  },
  {
    name: "actualizar_gasto",
    description: "Modifica un gasto existente, dado su id (obtenido con listar_gastos). Incluye solo los campos que cambian.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID (uuid) del gasto." },
        concepto: { type: "string" },
        monto: { type: "number" },
        categoria: { type: "string", enum: ["transporte", "materiales", "alimentacion", "servicios", "otros"] },
        fecha: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "eliminar_gasto",
    description: "Elimina permanentemente un gasto, dado su id (obtenido con listar_gastos).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID (uuid) del gasto." },
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
        hora: typeof input.hora === "string" && input.hora ? input.hora : null,
        completada: false,
        prioridad: typeof input.prioridad === "string" ? input.prioridad : "media",
        recurrencia: typeof input.recurrencia === "string" ? input.recurrencia : null,
      })
      .select("id, titulo, fecha, hora, completada, prioridad, recurrencia")
      .single();
    if (error) return { error: error.message };
    return { tarea: data };
  }

  if (name === "listar_tareas") {
    let query = supabase
      .from("tareas")
      .select("id, titulo, fecha, hora, completada, prioridad, recurrencia")
      .eq("usuario_id", userId)
      .order("fecha", { ascending: true, nullsFirst: false });
    if (typeof input.fecha === "string") query = query.eq("fecha", input.fecha);
    if (input.solo_pendientes) query = query.eq("completada", false);
    const { data, error } = await query;
    if (error) return { error: error.message };
    return { tareas: data };
  }

  if (name === "actualizar_tarea") {
    const cambios: Record<string, unknown> = {};
    if (typeof input.titulo === "string") cambios.titulo = input.titulo.slice(0, 500);
    if (typeof input.fecha === "string") cambios.fecha = input.fecha;
    if (typeof input.hora === "string") cambios.hora = input.hora === "" ? null : input.hora;
    if (typeof input.completada === "boolean") cambios.completada = input.completada;
    if (typeof input.prioridad === "string") cambios.prioridad = input.prioridad;
    if (typeof input.recurrencia === "string") cambios.recurrencia = input.recurrencia;
    if (Object.keys(cambios).length === 0) return { error: "No se especificó ningún cambio." };
    if ("fecha" in cambios || "hora" in cambios) cambios.recordatorio_enviado = false;

    const { data, error } = await supabase
      .from("tareas")
      .update(cambios)
      .eq("id", String(input.id))
      .eq("usuario_id", userId)
      .select("id, titulo, fecha, hora, completada, prioridad, recurrencia")
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

  if (name === "crear_contacto") {
    const { data, error } = await supabase
      .from("contactos")
      .insert({
        usuario_id: userId,
        nombre: String(input.nombre ?? "").slice(0, 200),
        cargo: typeof input.cargo === "string" ? input.cargo : null,
        empresa: typeof input.empresa === "string" ? input.empresa : null,
        telefono: typeof input.telefono === "string" ? input.telefono : null,
        correo: typeof input.correo === "string" ? input.correo : null,
        notas: typeof input.notas === "string" ? input.notas : null,
      })
      .select("id, nombre, cargo, empresa, telefono, correo, notas")
      .single();
    if (error) return { error: error.message };
    return { contacto: data };
  }

  if (name === "listar_contactos") {
    let query = supabase
      .from("contactos")
      .select("id, nombre, cargo, empresa, telefono, correo, notas")
      .eq("usuario_id", userId)
      .order("nombre", { ascending: true });
    if (typeof input.busqueda === "string" && input.busqueda) {
      query = query.or(`nombre.ilike.%${input.busqueda}%,empresa.ilike.%${input.busqueda}%`);
    }
    const { data, error } = await query;
    if (error) return { error: error.message };
    return { contactos: data };
  }

  if (name === "actualizar_contacto") {
    const cambios: Record<string, unknown> = {};
    if (typeof input.nombre === "string") cambios.nombre = input.nombre.slice(0, 200);
    if (typeof input.cargo === "string") cambios.cargo = input.cargo;
    if (typeof input.empresa === "string") cambios.empresa = input.empresa;
    if (typeof input.telefono === "string") cambios.telefono = input.telefono;
    if (typeof input.correo === "string") cambios.correo = input.correo;
    if (typeof input.notas === "string") cambios.notas = input.notas;
    if (Object.keys(cambios).length === 0) return { error: "No se especificó ningún cambio." };

    const { data, error } = await supabase
      .from("contactos")
      .update(cambios)
      .eq("id", String(input.id))
      .eq("usuario_id", userId)
      .select("id, nombre, cargo, empresa, telefono, correo, notas")
      .single();
    if (error) return { error: error.message };
    return { contacto: data };
  }

  if (name === "eliminar_contacto") {
    const { error } = await supabase
      .from("contactos")
      .delete()
      .eq("id", String(input.id))
      .eq("usuario_id", userId);
    if (error) return { error: error.message };
    return { eliminado: true };
  }

  if (name === "crear_nota") {
    const { data, error } = await supabase
      .from("notas")
      .insert({
        usuario_id: userId,
        titulo: String(input.titulo ?? "").slice(0, 300),
        contenido: String(input.contenido ?? ""),
        fecha: typeof input.fecha === "string" && input.fecha ? input.fecha : undefined,
        asistentes: typeof input.asistentes === "string" ? input.asistentes : null,
      })
      .select("id, titulo, contenido, fecha, asistentes")
      .single();
    if (error) return { error: error.message };
    return { nota: data };
  }

  if (name === "listar_notas") {
    let query = supabase
      .from("notas")
      .select("id, titulo, contenido, fecha, asistentes")
      .eq("usuario_id", userId)
      .order("fecha", { ascending: false });
    if (typeof input.fecha === "string") query = query.eq("fecha", input.fecha);
    const { data, error } = await query;
    if (error) return { error: error.message };
    return { notas: data };
  }

  if (name === "actualizar_nota") {
    const cambios: Record<string, unknown> = {};
    if (typeof input.titulo === "string") cambios.titulo = input.titulo.slice(0, 300);
    if (typeof input.contenido === "string") cambios.contenido = input.contenido;
    if (typeof input.fecha === "string") cambios.fecha = input.fecha;
    if (typeof input.asistentes === "string") cambios.asistentes = input.asistentes;
    if (Object.keys(cambios).length === 0) return { error: "No se especificó ningún cambio." };

    const { data, error } = await supabase
      .from("notas")
      .update(cambios)
      .eq("id", String(input.id))
      .eq("usuario_id", userId)
      .select("id, titulo, contenido, fecha, asistentes")
      .single();
    if (error) return { error: error.message };
    return { nota: data };
  }

  if (name === "eliminar_nota") {
    const { error } = await supabase
      .from("notas")
      .delete()
      .eq("id", String(input.id))
      .eq("usuario_id", userId);
    if (error) return { error: error.message };
    return { eliminado: true };
  }

  if (name === "registrar_gasto") {
    const { data, error } = await supabase
      .from("gastos")
      .insert({
        usuario_id: userId,
        concepto: String(input.concepto ?? "").slice(0, 300),
        monto: Number(input.monto ?? 0),
        categoria: typeof input.categoria === "string" ? input.categoria : "otros",
        fecha: typeof input.fecha === "string" && input.fecha ? input.fecha : undefined,
      })
      .select("id, concepto, monto, categoria, fecha")
      .single();
    if (error) return { error: error.message };
    return { gasto: data };
  }

  if (name === "listar_gastos") {
    let query = supabase
      .from("gastos")
      .select("id, concepto, monto, categoria, fecha")
      .eq("usuario_id", userId)
      .order("fecha", { ascending: false });
    if (typeof input.fecha_desde === "string") query = query.gte("fecha", input.fecha_desde);
    if (typeof input.fecha_hasta === "string") query = query.lte("fecha", input.fecha_hasta);
    const { data, error } = await query;
    if (error) return { error: error.message };
    return { gastos: data };
  }

  if (name === "actualizar_gasto") {
    const cambios: Record<string, unknown> = {};
    if (typeof input.concepto === "string") cambios.concepto = input.concepto.slice(0, 300);
    if (typeof input.monto === "number") cambios.monto = input.monto;
    if (typeof input.categoria === "string") cambios.categoria = input.categoria;
    if (typeof input.fecha === "string") cambios.fecha = input.fecha;
    if (Object.keys(cambios).length === 0) return { error: "No se especificó ningún cambio." };

    const { data, error } = await supabase
      .from("gastos")
      .update(cambios)
      .eq("id", String(input.id))
      .eq("usuario_id", userId)
      .select("id, concepto, monto, categoria, fecha")
      .single();
    if (error) return { error: error.message };
    return { gasto: data };
  }

  if (name === "eliminar_gasto") {
    const { error } = await supabase
      .from("gastos")
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
      `Tienes herramientas para crear, listar, modificar (incluyendo reprogramar fecha u hora exacta, cambiar ` +
      `prioridad o marcar como recurrente) y eliminar tareas reales del usuario. Si pide que le recuerdes algo a ` +
      `una hora específica, guarda esa hora en el campo 'hora' de la tarea (recibirá una notificación push en ese ` +
      `momento). ` +
      `También tienes herramientas para gestionar sus contactos (personas u organizaciones con las que trata), sus ` +
      `notas y actas de reunión, y sus gastos de caja chica. Úsalas siempre ` +
      `que te pida gestionar pendientes, contactos, notas o gastos, en vez de solo responder en texto. Nunca inventes ` +
      `ni des por hecho el contenido de la agenda, los contactos, las notas o los gastos: si no lo has consultado con ` +
      `una herramienta en esta conversación, no lo sabes. ` +
      `Además, cuando te pidan redactar una carta, un memorando o un correo formal, escribe el texto completo ` +
      `directamente en tu respuesta, listo para que el usuario lo copie y lo use; esto no requiere ninguna herramienta, ` +
      `es simplemente parte de tu respuesta en prosa. ` +
      `Tus respuestas se muestran como texto plano en una burbuja de chat, sin renderizar markdown: nunca uses ` +
      `asteriscos, guiones de lista, numerales de título ni ningún otro símbolo de formato. Escribe en prosa natural, ` +
      `como en una conversación hablada (incluidas las cartas o correos que redactes, usando saltos de línea simples ` +
      `para separar saludo, cuerpo y despedida).`;

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

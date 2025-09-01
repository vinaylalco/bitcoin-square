import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Body = {
  type: "lessons" | "home";
  locale: "en" | "es";
  content: unknown;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    const body = (await req.json()) as Body;
    if (!["lessons", "home"].includes(body.type) || !["en", "es"].includes(body.locale)) {
      return new Response("Invalid body", { status: 400 });
    }

    const bucket = body.type === "lessons" ? "lessons" : "homepage";
    const current = body.type === "lessons" ? `lessons.${body.locale}.json` : `home.${body.locale}.json`;
    const archive = `archive/${current.replace(".json", "")}.${timestamp()}.json`;

    // Move old file → archive (ignore if doesn’t exist)
    await supabase.storage.from(bucket).move(current, archive);

    // Upload new file
    const blob = new Blob([JSON.stringify(body.content, null, 2)], { type: "application/json" });
    const { error } = await supabase.storage.from(bucket).upload(current, blob, { upsert: true });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});

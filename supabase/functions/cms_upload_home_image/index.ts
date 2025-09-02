// Deno / Supabase Edge Function: admin-only image upload for 'homepage' bucket
// - Verifies caller's JWT and email is in ADMIN_EMAILS
// - Accepts multipart/form-data with a 'file' field
// - Stores at homepage/images/<timestamp>_<random>.<ext>
// - Returns { url } public URL

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const supaService = createClient(SUPABASE_URL, SERVICE_KEY);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function extFromType(t: string | null): string {
  if (!t) return "bin";
  const m = t.split("/");
  return m.length > 1 ? m[1] : "bin";
}

function ts() {
  const d = new Date();
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(
    d.getUTCHours()
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    // Verify caller and admin email
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders() });
    }
    const supaUserClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: auth } }, // validate JWT
    });
    const { data: userRes, error: userErr } = await supaUserClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders() });
    }
    const email = userRes.user.email?.toLowerCase();
    if (!email || !ADMIN_EMAILS.includes(email)) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders() });
    }

    // Parse multipart form
    const ct = req.headers.get("content-type") || "";
    if (!ct.startsWith("multipart/form-data")) {
      return new Response("Expected multipart/form-data", { status: 400, headers: corsHeaders() });
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response("Missing 'file'", { status: 400, headers: corsHeaders() });
    }

    // Basic validation
    if (!file.type.startsWith("image/")) {
      return new Response("Only image uploads allowed", { status: 415, headers: corsHeaders() });
    }
    const MAX = 8 * 1024 * 1024; // 8MB
    if (file.size > MAX) {
      return new Response("File too large", { status: 413, headers: corsHeaders() });
    }

    // Create key and upload
    const ext = extFromType(file.type);
    const key = `images/${ts()}_${crypto.randomUUID()}.${ext}`;
    const arrayBuf = await file.arrayBuffer();
    const blob = new Blob([arrayBuf], { type: file.type });

    const { error: upErr } = await supaService.storage
      .from("homepage")
      .upload(key, blob, { upsert: false, contentType: file.type });
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500,
        headers: { "content-type": "application/json", ...corsHeaders() },
      });
    }

    const { data: pub } = supaService.storage.from("homepage").getPublicUrl(key);
    return new Response(JSON.stringify({ url: pub.publicUrl, key }), {
      status: 200,
      headers: { "content-type": "application/json", ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "content-type": "application/json", ...corsHeaders() },
    });
  }
});

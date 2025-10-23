/**
 * Cloudflare Worker proxy for FreeImage uploads.
 *
 * Routes image uploads through the site's domain so the browser never sees the
 * upstream API key. The worker attaches the secret, forwards the file to
 * FreeImage, and returns the JSON response with tight CORS headers.
 */

const FREEIMAGE_UPLOAD_ENDPOINT = "https://freeimage.host/api/1/upload";
const ALLOWED_ORIGIN = "https://bitcoinsquare.io";

interface Env {
  FREEIMAGE_KEY: string;
}

const buildCorsHeaders = (origin: string | null) => {
  if (origin && origin !== ALLOWED_ORIGIN) {
    return null;
  }

  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  } as const;
};

const forbiddenResponse = () =>
  new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = buildCorsHeaders(request.headers.get("Origin"));

    if (request.method === "OPTIONS") {
      if (!corsHeaders) {
        return forbiddenResponse();
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          ...(corsHeaders ?? {}),
          "Allow": "POST, OPTIONS",
        },
      });
    }

    if (!corsHeaders) {
      return forbiddenResponse();
    }

    if (!env.FREEIMAGE_KEY) {
      return new Response(JSON.stringify({ error: "Missing upload configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid form data";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    formData.set("key", env.FREEIMAGE_KEY);
    formData.set("format", "json");
    if (!formData.has("action")) {
      formData.set("action", "upload");
    }

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(FREEIMAGE_UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upstream request failed";
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const responseBody = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get("Content-Type") ?? "application/json";

    return new Response(responseBody, {
      status: upstreamResponse.status,
      headers: { ...corsHeaders, "Content-Type": contentType },
    });
  },
};

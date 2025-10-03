import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400"

};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("INVITES_FROM_EMAIL") ?? "DreamXRP <no-reply@dreamxrp.app>";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });

  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const { email, organizationName, role, invitedByEmail, inviteLink } = await req.json();

    if (!email || !inviteLink) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY environment variable");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const orgName = organizationName ?? "vašeho týmu";
    const subject = `Pozvánka do ${orgName}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933;">
        <h2 style="color: #0f172a;">Byli jste pozváni do týmu ${orgName}</h2>
        <p>Dobrý den,</p>
        <p>${invitedByEmail ? `Uživatel ${invitedByEmail}` : "Váš tým"} vás pozval jako <strong>${role ?? "člena"}</strong> do platformy DreamXRP.</p>
        <p>Pro dokončení registrace klikněte na následující odkaz. Platnost pozvánky je omezená:</p>
        <p>
          <a href="${inviteLink}" style="display: inline-block; padding: 12px 20px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px;">
            Přijmout pozvánku
          </a>
        </p>
        <p>Pokud vám tlačítko nefunguje, zkopírujte si následující adresu do prohlížeče:</p>
        <p><a href="${inviteLink}">${inviteLink}</a></p>
        <p>Pokud tuto pozvánku neočekáváte, můžete ji ignorovat.</p>
        <p style="margin-top: 24px;">S pozdravem,<br />Tým DreamXRP</p>
      </div>
    `;

    const emailPayload = {
      from: FROM_EMAIL,
      to: [email],
      subject,
      html: htmlBody
    };

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(emailPayload)
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend API error", errorText);
      return new Response(JSON.stringify({ error: "Failed to send email", details: errorText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Unexpected error while sending invite email", error);
    return new Response(JSON.stringify({ error: "Invalid request", details: String(error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

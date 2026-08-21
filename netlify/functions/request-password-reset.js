// netlify/functions/request-password-reset.js
//
// Etape 1 du mot de passe oublie : genere un code a 6 chiffres CE SERVEUR,
// le stocke HACHE (jamais en clair) dans password_reset_codes, et l'envoie
// par e-mail via Resend. Le code n'est JAMAIS genere ni verifie cote
// client — sinon n'importe qui pourrait reinitialiser le mot de passe de
// n'importe quel compte en devinant simplement un email.
//
// v133 : meme durcissement que request-signup-code.js —
//   - limite anti-abus : 5 demandes maximum par email sur 15 minutes ;
//   - le code est desormais stocke HACHE (SHA-256), jamais en clair,
//     coherent avec signup_codes.
//
// Variables d'environnement necessaires :
//   RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   (les 3 deja utilisees par les autres fonctions)

const crypto = require('crypto');

const CODE_TTL_MINUTES = 15;
const MAX_CODES_PER_WINDOW = 5;
const WINDOW_MINUTES = 15;

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Defensif : un '/' en trop en fin de SUPABASE_URL (variable
  // d'environnement recopiee/rechangee) provoque sinon une double barre
  // oblique dans le chemin et une erreur PostgREST 'PGRST125 Invalid
  // path specified in request URL' — on la retire systematiquement.
  const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Variables d'environnement manquantes" })
    };
  }

  try {
    const { email } = JSON.parse(event.body || '{}');
    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'email requis' }) };
    }
    const emailNorm = email.trim().toLowerCase();

    // Anti-abus : trop de demandes recentes pour cette adresse ? Meme
    // principe que signup_codes — sans cette limite, cette fonction peut
    // etre marteler pour faire exploser la facture Resend ou pour tester
    // en boucle quels emails ont un compte (voir plus bas).
    const fenetre = new Date(Date.now() - WINDOW_MINUTES * 60000).toISOString();
    const countUrl =
      `${SUPABASE_URL}/rest/v1/password_reset_codes?select=id` +
      `&email=eq.${encodeURIComponent(emailNorm)}` +
      `&created_at=gte.${encodeURIComponent(fenetre)}&limit=${MAX_CODES_PER_WINDOW + 1}`;
    const countResp = await fetch(countUrl, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
    });
    const countRows = countResp.ok ? await countResp.json() : [];
    if (countRows.length >= MAX_CODES_PER_WINDOW) {
      return { statusCode: 429, body: JSON.stringify({ error: 'trop_de_demandes' }) };
    }

    // Le compte doit reellement exister cote Supabase Auth (Admin API) —
    // sinon on ne cree jamais de code pour un email qui n'a pas de compte.
    const usersResp = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (!usersResp.ok) {
      const detail = await usersResp.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'Lecture compte echouee', detail }) };
    }
    const usersData = await usersResp.json();
    const user = (usersData.users || []).find(u => (u.email || '').toLowerCase() === emailNorm);
    if (!user) {
      return { statusCode: 404, body: JSON.stringify({ error: 'compte introuvable' }) };
    }

    // Code a 6 chiffres, genere ICI (jamais par le navigateur), valable
    // 15 min, HACHE avant stockage — jamais en clair en base, meme pour
    // un admin ayant acces direct a la table.
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60000).toISOString();

    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/password_reset_codes`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ email: emailNorm, code_hash: hashCode(code), expires_at: expiresAt, used: false, attempts: 0 })
    });
    if (!insertResp.ok) {
      const detail = await insertResp.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'Ecriture du code echouee', detail }) };
    }

    const envoiResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'VipBetcote <contact@mail.vipbetcote.com>',
        to: emailNorm,
        subject: 'Code de réinitialisation de votre mot de passe VipBetcote',
        html: construireEmailCode(code)
      })
    });
    if (!envoiResp.ok) {
      const detail = await envoiResp.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'Envoi email echoue', detail }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function construireEmailCode(code) {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>Code de réinitialisation</title>
</head>
<body style="margin:0;padding:0;background:#030617;font-family:Arial,Helvetica,sans-serif;color:#F4F3ED;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;background:#030617;padding:22px 12px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:540px;background:#081020;border:1px solid rgba(244,243,237,.09);border-radius:16px;overflow:hidden;">

<tr><td align="center" style="padding:25px 20px 20px;background:#030617;">
<div style="font-size:18px;line-height:22px;font-weight:800;letter-spacing:1px;color:#F4F3ED;text-align:center;">VipBetcote</div>
<div style="margin-top:5px;font-size:11px;line-height:17px;font-weight:600;letter-spacing:1px;color:#C9A44C;text-align:center;">Genyen chak lèw jwe</div>
</td></tr>

<tr><td style="height:2px;padding:0;background:#2ED47F;font-size:0;line-height:0;">&nbsp;</td></tr>

<tr><td style="padding:28px 28px 26px;background:#081020;">
<h1 style="margin:0 0 12px;text-align:center;font-size:22px;line-height:29px;font-weight:800;color:#F4F3ED;">Réinitialisation de votre mot de passe</h1>
<p style="margin:0 auto 20px;max-width:430px;text-align:center;font-size:14px;line-height:21px;color:#93A89B;">Voici votre code de réinitialisation de mot de passe.</p>

<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;background:#0E1728;border:1px solid rgba(46,212,127,.38);border-radius:12px;">
<tr><td align="center" style="padding:18px 12px 20px;">
<div style="margin-bottom:7px;font-size:10px;line-height:15px;font-weight:700;letter-spacing:2px;color:#2ED47F;">VOTRE CODE</div>
<div style="font-family:'Courier New',Courier,monospace;font-size:30px;line-height:36px;font-weight:800;letter-spacing:7px;color:#E8CE8A;text-align:center;">${code}</div>
</td></tr>
</table>

<p style="margin:16px 0 0;text-align:center;font-size:12px;line-height:18px;color:#93A89B;">Ce code est valable pendant <strong style="color:#F4F3ED;">15 minutes.</strong></p>
<p style="margin:13px auto 0;max-width:430px;text-align:center;font-size:11px;line-height:17px;color:#66786F;">Si vous n'êtes pas à l'origine de cette demande, votre mot de passe ne sera pas modifié. Vous pouvez ignorer cet e-mail.</p>
</td></tr>

<tr><td align="center" style="padding:12px 15px 14px;background:#030617;border-top:1px solid rgba(244,243,237,.07);">
<div style="font-size:9px;line-height:14px;color:#566A60;">© 2026 VipBetcote — Tous droits réservés.</div>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
  `;
}

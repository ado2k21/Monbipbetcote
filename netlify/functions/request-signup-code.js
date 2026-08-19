/* ============================================================
   VIP BETCOTE — request-signup-code
   ------------------------------------------------------------
   Version SANS dépendance npm (aucun "require" externe) : parle
   directement à l'API REST de Supabase via fetch (déjà disponible
   nativement dans le runtime Node de Netlify). Corrige l'erreur
   "Cannot find module '@supabase/supabase-js'".

   Variables d'environnement nécessaires (déjà utilisées par
   request-password-reset.js, donc normalement déjà présentes) :
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY
     SITE_URL   (optionnel)
   ============================================================ */

const crypto = require('crypto');

const CODE_TTL_MINUTES = 10;
const MAX_CODES_PER_WINDOW = 5;
const WINDOW_MINUTES = 15;

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sbHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  let email;
  try {
    const body = JSON.parse(event.body || '{}');
    email = (body.email || '').trim().toLowerCase();
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'bad_request' }) };
  }

  if (!isValidEmail(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'email_invalide' }) };
  }

  const base = process.env.SUPABASE_URL + '/rest/v1';

  try {
    // Anti-abus : trop de demandes recentes pour cette adresse ?
    const fenetre = new Date(Date.now() - WINDOW_MINUTES * 60000).toISOString();
    const countResp = await fetch(
      base + '/signup_codes?select=id&email=eq.' + encodeURIComponent(email) +
      '&created_at=gte.' + encodeURIComponent(fenetre) + '&limit=' + (MAX_CODES_PER_WINDOW + 1),
      { headers: sbHeaders() }
    );
    const countRows = countResp.ok ? await countResp.json() : [];
    if (countRows.length >= MAX_CODES_PER_WINDOW) {
      return { statusCode: 429, body: JSON.stringify({ error: 'trop_de_demandes' }) };
    }

    // Génération du vrai code — jamais renvoyé au navigateur.
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60000).toISOString();

    const insResp = await fetch(base + '/signup_codes', {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ email, code_hash: hashCode(code), expires_at: expiresAt })
    });
    if (!insResp.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: 'stockage_echoue' }) };
    }

    // Envoi réel : on réutilise send-email, déjà connectée à Resend,
    // plutôt que de dupliquer cette intégration ici.
    const siteUrl = process.env.SITE_URL || ('https://' + (event.headers.host || 'vipbet2.netlify.app'));
    const sendResp = await fetch(siteUrl + '/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });

    if (!sendResp.ok) {
      let detail = 'HTTP ' + sendResp.status;
      try {
        const d = await sendResp.json();
        detail = (d && d.error) ? JSON.stringify(d.error).slice(0, 200) : detail;
      } catch (e2) {}
      return { statusCode: 502, body: JSON.stringify({ error: 'envoi_echoue', detail }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: (e && e.message) || 'erreur_inconnue' }) };
  }
};

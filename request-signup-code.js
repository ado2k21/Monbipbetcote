/* ============================================================
   VIP BETCOTE — request-signup-code
   ------------------------------------------------------------
   Version SANS dépendance npm + logs détaillés à chaque étape,
   pour diagnostiquer précisément où ça bloque (visible dans
   Netlify > Functions > request-signup-code > logs).

   Variables d'environnement nécessaires :
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY
     SITE_URL   (optionnel — sinon on déduit l'URL depuis la requête)
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

  console.log('[request-signup-code] env check — SUPABASE_URL present:', !!process.env.SUPABASE_URL,
    '| SERVICE_ROLE_KEY present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

  let email;
  try {
    const body = JSON.parse(event.body || '{}');
    email = (body.email || '').trim().toLowerCase();
  } catch (e) {
    console.error('[request-signup-code] body JSON invalide:', event.body);
    return { statusCode: 400, body: JSON.stringify({ error: 'bad_request' }) };
  }

  if (!isValidEmail(email)) {
    console.error('[request-signup-code] email invalide recu:', email);
    return { statusCode: 400, body: JSON.stringify({ error: 'email_invalide' }) };
  }

  const base = process.env.SUPABASE_URL + '/rest/v1';

  try {
    // Anti-abus : trop de demandes recentes pour cette adresse ?
    const fenetre = new Date(Date.now() - WINDOW_MINUTES * 60000).toISOString();
    const countUrl = base + '/signup_codes?select=id&email=eq.' + encodeURIComponent(email) +
      '&created_at=gte.' + encodeURIComponent(fenetre) + '&limit=' + (MAX_CODES_PER_WINDOW + 1);
    const countResp = await fetch(countUrl, { headers: sbHeaders() });
    if (!countResp.ok) {
      console.error('[request-signup-code] lecture signup_codes echouee, status:', countResp.status, await countResp.text());
    }
    const countRows = countResp.ok ? await countResp.json() : [];
    if (countRows.length >= MAX_CODES_PER_WINDOW) {
      console.error('[request-signup-code] rate limit atteint pour', email);
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
      const detail = await insResp.text();
      console.error('[request-signup-code] insertion signup_codes echouee, status:', insResp.status, 'detail:', detail);
      return { statusCode: 500, body: JSON.stringify({ error: 'stockage_echoue', detail }) };
    }
    console.log('[request-signup-code] code stocke en base pour', email);

    // Envoi réel : on réutilise send-email, déjà connectée à Resend,
    // plutôt que de dupliquer cette intégration ici.
    const siteUrl = process.env.SITE_URL || ('https://' + (event.headers.host || 'vipbet2.netlify.app'));
    const sendEmailUrl = siteUrl + '/.netlify/functions/send-email';
    console.log('[request-signup-code] appel de send-email sur:', sendEmailUrl);
    const sendResp = await fetch(sendEmailUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });

    if (!sendResp.ok) {
      let detail = 'HTTP ' + sendResp.status;
      try {
        const d = await sendResp.json();
        detail = (d && d.error) ? JSON.stringify(d.error).slice(0, 300) : detail;
      } catch (e2) {
        try { detail = (await sendResp.text()).slice(0, 300); } catch (e3) {}
      }
      console.error('[request-signup-code] send-email a echoue:', detail);
      return { statusCode: 502, body: JSON.stringify({ error: 'envoi_echoue', detail }) };
    }

    console.log('[request-signup-code] email envoye avec succes pour', email);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error('[request-signup-code] exception non geree:', e && e.message, e && e.stack);
    return { statusCode: 500, body: JSON.stringify({ error: (e && e.message) || 'erreur_inconnue' }) };
  }
};

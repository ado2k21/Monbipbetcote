/* ============================================================
   VIP BETCOTE — request-signup-code
   ------------------------------------------------------------
   Génère le code de vérification d'inscription ENTIÈREMENT côté
   serveur (jamais dans le navigateur), le stocke haché dans
   Supabase (table signup_codes), puis déclenche l'envoi réel de
   l'e-mail en réutilisant la fonction send-email déjà en place
   (celle qui parle à Resend).

   À placer dans le même dossier que vos fonctions existantes
   (request-password-reset.js, confirm-password-reset.js,
   send-email.js) et redéployer sur Netlify.

   Variables d'environnement nécessaires (Netlify > Site settings
   > Environment variables) — les deux premières sont sûrement
   déjà définies puisque request-password-reset.js les utilise :
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY   (jamais la clé "anon" ici)
     SITE_URL   (optionnel — sinon on déduit l'URL depuis la requête)
   ============================================================ */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const CODE_TTL_MINUTES = 10;
const MAX_CODES_PER_WINDOW = 5;   // anti-abus simple
const WINDOW_MINUTES = 15;

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Anti-abus : trop de demandes recentes pour cette adresse ?
    const fenetre = new Date(Date.now() - WINDOW_MINUTES * 60000).toISOString();
    const { count } = await supabase
      .from('signup_codes')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', fenetre);

    if ((count || 0) >= MAX_CODES_PER_WINDOW) {
      return { statusCode: 429, body: JSON.stringify({ error: 'trop_de_demandes' }) };
    }

    // Génération du vrai code — jamais renvoyé au navigateur.
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60000).toISOString();

    const { error: insErr } = await supabase.from('signup_codes').insert({
      email,
      code_hash: hashCode(code),
      expires_at: expiresAt
    });
    if (insErr) {
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

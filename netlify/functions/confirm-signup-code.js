/* ============================================================
   VIP BETCOTE — confirm-signup-code
   ------------------------------------------------------------
   Vérifie le code d'inscription ENTIÈREMENT côté serveur. Le
   navigateur envoie uniquement (email, code saisi) ; la comparaison
   se fait ici contre le hash stocké — jamais dans le JS client.

   Variables d'environnement : identiques à request-signup-code.js
   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
   ============================================================ */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  let email, code;
  try {
    const body = JSON.parse(event.body || '{}');
    email = (body.email || '').trim().toLowerCase();
    code = String(body.code || '').trim();
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'bad_request' }) };
  }

  if (!email || !/^\d{6}$/.test(code)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'code_invalide' }) };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { data: rows, error } = await supabase
      .from('signup_codes')
      .select('id,code_hash,expires_at,attempts,consumed')
      .eq('email', email)
      .eq('consumed', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !rows || !rows.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'code_invalide' }) };
    }

    const row = rows[0];

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'code_expire' }) };
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      return { statusCode: 429, body: JSON.stringify({ error: 'trop_de_tentatives' }) };
    }

    if (hashCode(code) !== row.code_hash) {
      // On compte la tentative ratee, sans jamais reveler la difference
      // entre "code inconnu" et "code expire" au-dela de ces deux cas.
      await supabase.from('signup_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
      return { statusCode: 400, body: JSON.stringify({ error: 'code_invalide' }) };
    }

    await supabase.from('signup_codes').update({ consumed: true }).eq('id', row.id);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: (e && e.message) || 'erreur_inconnue' }) };
  }
};

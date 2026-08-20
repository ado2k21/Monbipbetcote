/* ============================================================
   VIP BETCOTE — confirm-signup-code
   ------------------------------------------------------------
   Version SANS dépendance npm — parle directement à l'API REST
   de Supabase via fetch. Même correctif que request-signup-code.js.

   Variables d'environnement : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   ============================================================ */

const crypto = require('crypto');

const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
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

  // Defensif : un '/' en trop en fin de SUPABASE_URL (variable
  // d'environnement recopiee/rechangee) provoque sinon une double barre
  // oblique dans le chemin et une erreur PostgREST 'PGRST125 Invalid
  // path specified in request URL' — on la retire systematiquement.
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const base = supabaseUrl + '/rest/v1';

  try {
    const getResp = await fetch(
      base + '/signup_codes?select=id,code_hash,expires_at,attempts,consumed' +
      '&email=eq.' + encodeURIComponent(email) + '&consumed=eq.false' +
      '&order=created_at.desc&limit=1',
      { headers: sbHeaders() }
    );

    const rows = getResp.ok ? await getResp.json() : [];
    if (!rows.length) {
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
      await fetch(base + '/signup_codes?id=eq.' + row.id, {
        method: 'PATCH',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ attempts: row.attempts + 1 })
      });
      return { statusCode: 400, body: JSON.stringify({ error: 'code_invalide' }) };
    }

    await fetch(base + '/signup_codes?id=eq.' + row.id, {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ consumed: true })
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: (e && e.message) || 'erreur_inconnue' }) };
  }
};

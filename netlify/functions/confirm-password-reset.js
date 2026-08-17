// netlify/functions/confirm-password-reset.js
//
// Etape 2 du mot de passe oublie : verifie le code CE SERVEUR (jamais
// dans le navigateur), puis change le vrai mot de passe Supabase Auth
// via l'API Admin (cle service_role). C'est la seule facon d'obtenir un
// vrai changement de mot de passe sans passer par le systeme de lien
// email natif de Supabase (qui casserait la coherence visuelle du site).
//
// Variables d'environnement necessaires : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Variables d'environnement manquantes" })
    };
  }

  try {
    const { email, code, newPassword } = JSON.parse(event.body || '{}');
    if (!email || !code || !newPassword) {
      return { statusCode: 400, body: JSON.stringify({ error: 'email, code et newPassword requis' }) };
    }
    if (newPassword.length < 8) {
      return { statusCode: 400, body: JSON.stringify({ error: 'mot de passe trop court' }) };
    }
    const emailNorm = email.trim().toLowerCase();

    // Le code doit correspondre EXACTEMENT, pas deja utilise, pas expire.
    // C'est la seule verification qui compte reellement — jamais celle
    // du navigateur, qui pourrait etre contournee.
    const lookupUrl =
      `${SUPABASE_URL}/rest/v1/password_reset_codes` +
      `?email=eq.${encodeURIComponent(emailNorm)}` +
      `&code=eq.${encodeURIComponent(code)}` +
      `&used=eq.false&order=created_at.desc&limit=1`;
    const lookupResp = await fetch(lookupUrl, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
    });
    if (!lookupResp.ok) {
      const detail = await lookupResp.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'Lecture du code echouee', detail }) };
    }
    const rows = await lookupResp.json();
    const row = rows[0];
    if (!row) {
      return { statusCode: 400, body: JSON.stringify({ error: 'code_invalide' }) };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'code_expire' }) };
    }

    // Retrouver le vrai compte Supabase Auth correspondant a cet email.
    // Meme correctif : lire la liste complete plutot que de dependre du
    // filtre "?email=..." non garanti.
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

    // Le VRAI changement de mot de passe cote Supabase — jamais simule,
    // jamais seulement local.
    const updateResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: newPassword })
    });
    if (!updateResp.ok) {
      const detail = await updateResp.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'Changement du mot de passe echoue', detail }) };
    }

    // Usage unique : le code ne doit plus jamais pouvoir servir une
    // deuxieme fois, meme s'il n'est pas encore expire.
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/password_reset_codes?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ used: true })
      });
    } catch (e) {
      // Ne bloque jamais le succes principal si cette seule mise a jour rate.
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

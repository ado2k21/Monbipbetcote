// netlify/functions/confirm-password-reset.js
//
// Etape 2 du mot de passe oublie : verifie le code CE SERVEUR (jamais
// dans le navigateur), puis change le vrai mot de passe Supabase Auth
// via l'API Admin (cle service_role). C'est la seule facon d'obtenir un
// vrai changement de mot de passe sans passer par le systeme de lien
// email natif de Supabase (qui casserait la coherence visuelle du site).
//
// v133 :
//   - le code est desormais compare par HASH (jamais en clair), coherent
//     avec confirm-signup-code.js ;
//   - verrou a 5 tentatives maximum par code, meme principe que
//     confirm-signup-code.js — au-dela, le code est refuse meme s'il
//     finit par etre devine ;
//   - conserve la verification de suspension ajoutee precedemment : le
//     mot de passe est change normalement, mais la reponse indique au
//     client si le compte est suspendu et avec quel motif, pour que le
//     mot de passe oublie ne puisse jamais contourner une suspension.
//
// Variables d'environnement necessaires : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const crypto = require('crypto');

const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
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

    // Le code doit correspondre EXACTEMENT (par hash), pas deja utilise,
    // pas expire. C'est la seule verification qui compte reellement —
    // jamais celle du navigateur, qui pourrait etre contournee.
    const lookupUrl =
      `${SUPABASE_URL}/rest/v1/password_reset_codes` +
      `?email=eq.${encodeURIComponent(emailNorm)}` +
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
    if ((row.attempts || 0) >= MAX_ATTEMPTS) {
      return { statusCode: 429, body: JSON.stringify({ error: 'trop_de_tentatives' }) };
    }
    if (hashCode(code) !== row.code_hash) {
      // On compte la tentative ratee, sans jamais reveler la difference
      // entre "code inconnu" et "code expire" au-dela de ces deux cas.
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/password_reset_codes?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({ attempts: (row.attempts || 0) + 1 })
        });
      } catch (e) {}
      return { statusCode: 400, body: JSON.stringify({ error: 'code_invalide' }) };
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

    // ---- Verification de suspension, APRES le changement reussi ----
    // Le mot de passe oublie ne doit jamais pouvoir contourner une
    // suspension : on lit ici, cote serveur, le vrai statut du profil
    // et on le renvoie au client. C'est au client de decider de ne PAS
    // ouvrir le dashboard si suspended === true — mais la verite vient
    // toujours d'ici, jamais d'un cache local.
    let suspended = false;
    let suspendedReason = null;
    try {
      const profResp = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=suspended_at,suspended_reason`,
        { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      if (profResp.ok) {
        const profRows = await profResp.json();
        const prof = profRows[0];
        if (prof && prof.suspended_at) {
          suspended = true;
          suspendedReason = prof.suspended_reason || null;
        }
      }
    } catch (e) {}

    return { statusCode: 200, body: JSON.stringify({ ok: true, suspended, suspendedReason }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

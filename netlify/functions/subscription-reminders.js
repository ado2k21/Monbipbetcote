// netlify/functions/subscription-reminders.js
//
// Rappel automatique d'abonnement : envoie un e-mail 3 jours avant
// l'expiration d'un abonnement actif. Declenchee automatiquement chaque
// jour via la planification configuree dans netlify.toml — jamais
// lancee manuellement depuis le site, jamais accessible au navigateur.
//
// Variables d'environnement necessaires (Netlify -> Site settings ->
// Environment variables) :
//   RESEND_API_KEY             (deja utilisee par send-email.js)
//   SUPABASE_URL                ex. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   cle "service_role" (JAMAIS la cle anon,
//                                celle du navigateur) —
//                                Supabase -> Project Settings -> API
//
// Cette fonction ne modifie AUCUNE donnee : elle lit les abonnements qui
// expirent bientot et envoie un e-mail. Rien d'autre.

const JOURS_AVANT_EXPIRATION = 3;

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Variables d'environnement manquantes (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY)"
      })
    };
  }

  try {
    /*
     * =========================================================
     * FENETRE : abonnements qui expirent EXACTEMENT dans
     * JOURS_AVANT_EXPIRATION jours (une seule journee), pour que
     * chaque personne ne reçoive ce rappel qu'une seule fois.
     * =========================================================
     */
    const maintenant = new Date();
    const debut = new Date(maintenant);
    debut.setUTCDate(debut.getUTCDate() + JOURS_AVANT_EXPIRATION);
    debut.setUTCHours(0, 0, 0, 0);
    const fin = new Date(debut);
    fin.setUTCDate(fin.getUTCDate() + 1);

    /*
     * =========================================================
     * LECTURE SUPABASE (REST/PostgREST direct, cle service_role)
     * On suppose une relation de cle etrangere subscriptions.user_id
     * -> profiles.id deja en place (necessaire pour que la jointure
     * "profiles(email,username)" fonctionne). Si ce n'est pas le cas,
     * cette requete renverra une erreur explicite ci-dessous plutot
     * que d'echouer en silence.
     * =========================================================
     */
    const url =
      `${SUPABASE_URL}/rest/v1/subscriptions` +
      `?select=id,plan_id,expires_at,user_id,profiles(email,username)` +
      `&status=eq.active` +
      `&expires_at=gte.${debut.toISOString()}` +
      `&expires_at=lt.${fin.toISOString()}`;

    const lectureResp = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });

    if (!lectureResp.ok) {
      const detail = await lectureResp.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Lecture Supabase echouee', detail })
      };
    }

    const abonnements = await lectureResp.json();
    let envoyes = 0;
    let echecs = 0;
    const erreurs = [];

    for (const sub of abonnements) {
      const email = sub.profiles && sub.profiles.email;
      if (!email) continue;

      const nom = (sub.profiles && sub.profiles.username) || '';
      const dateExpiration = new Date(sub.expires_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });

      const html = construireEmailRappel(nom, sub.plan_id, dateExpiration);

      try {
        const envoiResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'VipBetcote <onboarding@resend.dev>',
            to: email,
            subject: 'Votre abonnement VipBetcote expire bientôt',
            html
          })
        });

        if (envoiResp.ok) {
          envoyes++;
        } else {
          echecs++;
          erreurs.push({ email, detail: await envoiResp.text() });
        }
      } catch (e) {
        echecs++;
        erreurs.push({ email, detail: e.message });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        trouves: abonnements.length,
        envoyes,
        echecs,
        erreurs: erreurs.slice(0, 10) // ne jamais renvoyer une reponse enorme
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

/*
 * =========================================================
 * TEMPLATE EMAIL — meme identite visuelle que send-email.js
 * (fond sombre, en-tete VipBetcote, ligne de couleur, encadre
 * dore), adaptee au contenu d'un rappel plutot qu'un code.
 * =========================================================
 */
function construireEmailRappel(nom, planId, dateExpiration) {
  const salutation = nom ? `Bonjour ${nom},` : 'Bonjour,';
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>Votre abonnement expire bientôt</title>
</head>
<body style="margin:0;padding:0;background:#030617;font-family:Arial,Helvetica,sans-serif;color:#F4F3ED;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;background:#030617;padding:22px 12px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:540px;background:#081020;border:1px solid rgba(244,243,237,.09);border-radius:16px;overflow:hidden;">

<tr><td align="center" style="padding:25px 20px 20px;background:#030617;">
<div style="font-size:18px;line-height:22px;font-weight:800;letter-spacing:1px;color:#F4F3ED;text-align:center;">VipBetcote</div>
<div style="margin-top:5px;font-size:11px;line-height:17px;font-weight:600;letter-spacing:1px;color:#C9A44C;text-align:center;">Genyen chak lèw jwe</div>
</td></tr>

<tr><td style="height:2px;padding:0;background:#C9A44C;font-size:0;line-height:0;">&nbsp;</td></tr>

<tr><td style="padding:28px 28px 26px;background:#081020;">
<h1 style="margin:0 0 12px;text-align:center;font-size:22px;line-height:29px;font-weight:800;color:#F4F3ED;">Votre abonnement expire bientôt</h1>
<p style="margin:0 auto 20px;max-width:430px;text-align:center;font-size:14px;line-height:21px;color:#93A89B;">${salutation}<br><br>
Votre abonnement <strong style="color:#F4F3ED">${(planId || '').toUpperCase()}</strong> expire le <strong style="color:#F4F3ED">${dateExpiration}</strong>. Renouvelez dès maintenant pour ne pas perdre l'accès à vos fiches.</p>

<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;background:#0E1728;border:1px solid rgba(201,164,76,.38);border-radius:12px;">
<tr><td align="center" style="padding:16px 12px;">
<div style="font-size:13px;line-height:19px;color:#E8CE8A;">Connectez-vous à votre tableau de bord pour renouveler votre plan.</div>
</td></tr>
</table>

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

// netlify/functions/database-backup.js
//
// Sauvegarde quotidienne : exporte les 9 tables de la base en un seul
// fichier JSON et l'envoie par e-mail en piece jointe a l'adresse admin.
// Declenchee automatiquement chaque jour via netlify.toml.
//
// IMPORTANT — CE N'EST PAS UNE VRAIE SOLUTION DE SAUVEGARDE
// PROFESSIONNELLE : le plan gratuit Supabase n'inclut aucune sauvegarde
// automatique ni restauration a un instant precis (PITR). Cette fonction
// est un filet de secours en attendant un plan payant Supabase (Pro ou
// plus), qui gere ca correctement et automatiquement. Utile en cas de
// perte de donnees, mais restaurer depuis ce fichier JSON est manuel.
//
// Variables d'environnement necessaires (Netlify -> Site settings ->
// Environment variables) :
//   RESEND_API_KEY             (deja utilisee par send-email.js)
//   SUPABASE_URL                 (deja ajoutee pour subscription-reminders.js)
//   SUPABASE_SERVICE_ROLE_KEY    (deja ajoutee pour subscription-reminders.js)
//   BACKUP_EMAIL                 l'adresse qui doit recevoir la sauvegarde
//                                 (votre adresse admin habituelle)
//
// Limite a connaitre : les pieces jointes email ont une taille maximale
// (environ 40 Mo cote Resend). Tant que la base reste de taille modeste,
// ce n'est pas un probleme. Si un jour la base grossit beaucoup, il
// faudra remplacer l'envoi par email par un stockage externe (Netlify
// Blobs, S3, etc.) — a signaler si cette limite est atteinte.

const TABLES = [
  'profiles',
  'plans',
  'subscriptions',
  'payments',
  'tickets',
  'ticket_legs',
  'faq',
  'testimonials',
  'audit_log'
];

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const BACKUP_EMAIL = process.env.BACKUP_EMAIL;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !BACKUP_EMAIL) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          "Variables d'environnement manquantes (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY / BACKUP_EMAIL)"
      })
    };
  }

  try {
    /*
     * =========================================================
     * EXPORT : chaque table est lue separement. Si UNE table
     * echoue, on continue quand meme avec les autres — mieux vaut
     * une sauvegarde partielle avec une erreur signalee qu'aucune
     * sauvegarde du tout.
     * =========================================================
     */
    const resultat = {};
    const erreursTables = [];

    for (const table of TABLES) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        if (!resp.ok) {
          erreursTables.push({ table, detail: await resp.text() });
          resultat[table] = null;
          continue;
        }
        resultat[table] = await resp.json();
      } catch (e) {
        erreursTables.push({ table, detail: e.message });
        resultat[table] = null;
      }
    }

    const dateISO = new Date().toISOString().slice(0, 10);
    const contenuJSON = JSON.stringify(
      { date_export: new Date().toISOString(), erreurs: erreursTables, donnees: resultat },
      null,
      2
    );
    const base64 = Buffer.from(contenuJSON, 'utf-8').toString('base64');

    const nbLignes = Object.values(resultat).reduce(
      (acc, rows) => acc + (Array.isArray(rows) ? rows.length : 0),
      0
    );

    /*
     * =========================================================
     * ENVOI AVEC RESEND — piece jointe JSON
     * =========================================================
     */
    const envoiResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'VipBetcote <onboarding@resend.dev>',
        to: BACKUP_EMAIL,
        subject: `Sauvegarde VipBetcote — ${dateISO}`,
        html: construireEmailRecap(dateISO, nbLignes, erreursTables),
        attachments: [
          {
            filename: `vipbetcote-backup-${dateISO}.json`,
            content: base64
          }
        ]
      })
    });

    if (!envoiResp.ok) {
      const detail = await envoiResp.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'Envoi email echoue', detail }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        lignes_exportees: nbLignes,
        tables_en_erreur: erreursTables.map((e) => e.table)
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function construireEmailRecap(dateISO, nbLignes, erreursTables) {
  const ligneErreurs =
    erreursTables.length > 0
      ? `<p style="margin:12px auto 0;max-width:430px;text-align:center;font-size:12px;line-height:18px;color:#E2634F;">
           ⚠ ${erreursTables.length} table(s) n'ont pas pu etre exportees : ${erreursTables
          .map((e) => e.table)
          .join(', ')}
         </p>`
      : '';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>Sauvegarde VipBetcote</title>
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
<h1 style="margin:0 0 12px;text-align:center;font-size:22px;line-height:29px;font-weight:800;color:#F4F3ED;">Sauvegarde du ${dateISO}</h1>
<p style="margin:0 auto 0;max-width:430px;text-align:center;font-size:14px;line-height:21px;color:#93A89B;">
La sauvegarde complete de la base est jointe a cet e-mail au format JSON (${nbLignes} ligne(s) au total).
</p>
${ligneErreurs}
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: 'Method not allowed'
      })
    };
  }

  try {
    const {
      email,
      code,
      type = 'verification'
    } = JSON.parse(event.body || '{}');

    if (!email || !code) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'email et code requis'
        })
      };
    }

    let subject;
    let title;
    let message;
    let securityMessage;

    /*
     * =========================================================
     * VÉRIFICATION DE L'EMAIL
     * =========================================================
     */

    if (type === 'verification') {
      subject = 'Votre code de vérification VipBetcote';

      title = 'Vérification de votre adresse e-mail';

      message =
        'Voici votre code de vérification pour continuer sur VipBetcote.';

      securityMessage =
        "Si vous n'êtes pas à l'origine de cette demande, vous pouvez simplement ignorer cet e-mail.";
    }

    /*
     * =========================================================
     * RÉINITIALISATION DU MOT DE PASSE
     * =========================================================
     */

    else if (type === 'password_reset') {
      subject =
        'Code de réinitialisation de votre mot de passe VipBetcote';

      title =
        'Réinitialisation de votre mot de passe';

      message =
        'Voici votre code de réinitialisation de mot de passe.';

      securityMessage =
        "Si vous n'êtes pas à l'origine de cette demande, votre mot de passe ne sera pas modifié. Vous pouvez ignorer cet e-mail.";
    }

    /*
     * =========================================================
     * TYPE D'EMAIL INCONNU
     * =========================================================
     */

    else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Type d’email non reconnu'
        })
      };
    }

    /*
     * =========================================================
     * TEMPLATE EMAIL
     * =========================================================
     */

    const html = `
<!DOCTYPE html>

<html lang="fr">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <meta
    name="color-scheme"
    content="dark"
  >

  <title>${subject}</title>

</head>


<body
  style="
    margin:0;
    padding:0;
    background:#030617;
    font-family:Arial,Helvetica,sans-serif;
    color:#F4F3ED;
  "
>


<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  border="0"
  role="presentation"
  style="
    width:100%;
    background:#030617;
    padding:22px 12px;
  "
>

<tr>

<td align="center">


<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  border="0"
  role="presentation"
  style="
    max-width:540px;
    background:#081020;
    border:1px solid rgba(244,243,237,.09);
    border-radius:16px;
    overflow:hidden;
  "
>


<!-- =====================================================
     HEADER
===================================================== -->

<tr>

<td
  align="center"
  style="
    padding:25px 20px 20px;
    background:#030617;
  "
>

  <div
    style="
      font-size:18px;
      line-height:22px;
      font-weight:800;
      letter-spacing:1px;
      color:#F4F3ED;
      text-align:center;
    "
  >
    VipBetcote
  </div>


  <div
    style="
      margin-top:5px;
      font-size:11px;
      line-height:17px;
      font-weight:600;
      letter-spacing:1px;
      color:#C9A44C;
      text-align:center;
    "
  >
    Genyen chak lèw jwe
  </div>

</td>

</tr>


<!-- =====================================================
     LIGNE VERTE
===================================================== -->

<tr>

<td
  style="
    height:2px;
    padding:0;
    background:#2ED47F;
    font-size:0;
    line-height:0;
  "
>
&nbsp;
</td>

</tr>


<!-- =====================================================
     CONTENU
===================================================== -->

<tr>

<td
  style="
    padding:28px 28px 26px;
    background:#081020;
  "
>


<h1
  style="
    margin:0 0 12px;
    text-align:center;
    font-size:22px;
    line-height:29px;
    font-weight:800;
    color:#F4F3ED;
  "
>
  ${title}
</h1>


<p
  style="
    margin:0 auto 20px;
    max-width:430px;
    text-align:center;
    font-size:14px;
    line-height:21px;
    color:#93A89B;
  "
>
  ${message}
</p>


<!-- =====================================================
     CODE
===================================================== -->

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  border="0"
  role="presentation"
  style="
    width:100%;
    background:#0E1728;
    border:1px solid rgba(46,212,127,.38);
    border-radius:12px;
  "
>

<tr>

<td
  align="center"
  style="
    padding:18px 12px 20px;
  "
>


<div
  style="
    margin-bottom:7px;
    font-size:10px;
    line-height:15px;
    font-weight:700;
    letter-spacing:2px;
    color:#2ED47F;
  "
>
  VOTRE CODE
</div>


<div
  style="
    font-family:'Courier New',Courier,monospace;
    font-size:30px;
    line-height:36px;
    font-weight:800;
    letter-spacing:7px;
    color:#E8CE8A;
    text-align:center;
  "
>
  ${code}
</div>


</td>

</tr>

</table>


<!-- =====================================================
     EXPIRATION
===================================================== -->

<p
  style="
    margin:16px 0 0;
    text-align:center;
    font-size:12px;
    line-height:18px;
    color:#93A89B;
  "
>

  Ce code est valable pendant

  <strong
    style="
      color:#F4F3ED;
    "
  >
    15 minutes.
  </strong>

</p>


<!-- =====================================================
     SÉCURITÉ
===================================================== -->

<p
  style="
    margin:13px auto 0;
    max-width:430px;
    text-align:center;
    font-size:11px;
    line-height:17px;
    color:#66786F;
  "
>
  ${securityMessage}
</p>


</td>

</tr>


<!-- =====================================================
     FOOTER
===================================================== -->

<tr>

<td
  align="center"
  style="
    padding:12px 15px 14px;
    background:#030617;
    border-top:1px solid rgba(244,243,237,.07);
  "
>

<div
  style="
    font-size:9px;
    line-height:14px;
    color:#566A60;
  "
>
  © 2026 VipBetcote — Tous droits réservés.
</div>

</td>

</tr>


</table>


</td>

</tr>

</table>


</body>

</html>
    `;


    /*
     * =========================================================
     * ENVOI AVEC RESEND
     * =========================================================
     */

    const resp = await fetch(
      'https://api.resend.com/emails',
      {
        method: 'POST',

        headers: {
          'Authorization':
            `Bearer ${process.env.RESEND_API_KEY}`,

          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({

          from:
            'VipBetcote <noreply@vipbetcote.com>',

          to:
            email,

          subject:
            subject,

          html:
            html

        })
      }
    );


    /*
     * =========================================================
     * RÉPONSE RESEND
     * =========================================================
     */

    const data = await resp.json();


    if (!resp.ok) {

      return {
        statusCode: 500,

        body: JSON.stringify({
          error: data
        })
      };

    }


    /*
     * =========================================================
     * SUCCÈS
     * =========================================================
     */

    return {

      statusCode: 200,

      body: JSON.stringify({
        ok: true,
        type: type
      })

    };


  } catch (err) {

    return {

      statusCode: 500,

      body: JSON.stringify({
        error: err.message
      })

    };

  }
};

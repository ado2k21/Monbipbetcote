exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Method not allowed'
      })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    const email = body.email;
    const code = body.code;

    // Français par défaut
    const type = body.type || 'verification';

    if (!email || !code) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'email et code requis'
        })
      };
    }

    /*
     * =========================================================
     * CONTENU DES DIFFÉRENTS EMAILS
     * =========================================================
     */

    let subject;
    let title;
    let message;
    let securityMessage;

    /*
     * ---------------------------------------------------------
     * 1. VÉRIFICATION DE L'EMAIL
     * ---------------------------------------------------------
     */

    if (type === 'verification') {
      subject = 'Votre code de vérification VIPBETCOTE';

      title = 'Vérification de votre adresse e-mail';

      message = `
        Voici le code de vérification dont vous avez besoin
        pour continuer sur VIPBETCOTE.
      `;

      securityMessage = `
        Si vous n'êtes pas à l'origine de cette demande,
        vous pouvez simplement ignorer cet e-mail.
      `;
    }

    /*
     * ---------------------------------------------------------
     * 2. RÉINITIALISATION DU MOT DE PASSE
     * ---------------------------------------------------------
     */

    else if (type === 'password_reset') {
      subject = 'Réinitialisation de votre mot de passe VIPBETCOTE';

      title = 'Réinitialisation de votre mot de passe';

      message = `
        Vous avez demandé à réinitialiser le mot de passe
        de votre compte VIPBETCOTE.
      `;

      securityMessage = `
        Si vous n'êtes pas à l'origine de cette demande,
        votre mot de passe ne sera pas modifié.
        Vous pouvez ignorer cet e-mail.
      `;
    }

    /*
     * ---------------------------------------------------------
     * TYPE INCONNU
     * ---------------------------------------------------------
     */

    else {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Type d’email non reconnu'
        })
      };
    }


    /*
     * =========================================================
     * TEMPLATE EMAIL VIPBETCOTE
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

  <meta
    name="supported-color-schemes"
    content="dark"
  >

  <title>${subject}</title>

</head>


<body
  style="
    margin:0;
    padding:0;
    width:100%;
    background-color:#030617;
    font-family:Arial,Helvetica,sans-serif;
    color:#F4F3ED;
  "
>


  <!--
  ============================================================
  WRAPPER PRINCIPAL
  ============================================================
  -->

  <table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    role="presentation"
    style="
      width:100%;
      margin:0;
      padding:35px 15px;
      background-color:#030617;
    "
  >

    <tr>

      <td align="center">


        <!--
        ======================================================
        CARTE EMAIL
        ======================================================
        -->

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
          style="
            width:100%;
            max-width:560px;
            background-color:#081020;
            border:1px solid rgba(244,243,237,.09);
            border-radius:18px;
            overflow:hidden;
          "
        >


          <!--
          ====================================================
          HEADER
          ====================================================
          -->

          <tr>

            <td
              align="center"
              style="
                padding:38px 25px 30px;
                background-color:#030617;
              "
            >


              <!-- LOGO -->

              <img
                src="https://vipbet.netlify.app/logo-email.png"
                alt="VIPBETCOTE"
                width="190"
                style="
                  display:block;
                  width:190px;
                  max-width:80%;
                  height:auto;
                  margin:0 auto;
                  border:0;
                  outline:none;
                  text-decoration:none;
                "
              >


              <!-- NOM -->

              <div
                style="
                  margin-top:16px;
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:17px;
                  line-height:22px;
                  font-weight:800;
                  letter-spacing:1px;
                  color:#F4F3ED;
                  text-align:center;
                "
              >
                VIPBETCOTE
              </div>


              <!-- SLOGAN -->

              <div
                style="
                  margin-top:7px;
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:12px;
                  line-height:18px;
                  font-weight:600;
                  letter-spacing:1.5px;
                  color:#C9A44C;
                  text-align:center;
                "
              >
                Genyen Chak Lè Jwe
              </div>


            </td>

          </tr>


          <!--
          ====================================================
          ACCENT VERT
          ====================================================
          -->

          <tr>

            <td
              style="
                height:3px;
                padding:0;
                background-color:#2ED47F;
                font-size:0;
                line-height:0;
              "
            >
              &nbsp;
            </td>

          </tr>


          <!--
          ====================================================
          CONTENU
          ====================================================
          -->

          <tr>

            <td
              style="
                padding:38px 32px 38px;
                background-color:#081020;
              "
            >


              <!-- PETIT LABEL -->

              <div
                style="
                  margin-bottom:15px;
                  text-align:center;
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:11px;
                  line-height:18px;
                  font-weight:700;
                  letter-spacing:2px;
                  text-transform:uppercase;
                  color:#2ED47F;
                "
              >
                VIPBETCOTE
              </div>


              <!-- TITRE -->

              <h1
                style="
                  margin:0 0 17px;
                  padding:0;
                  text-align:center;
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:25px;
                  line-height:33px;
                  font-weight:800;
                  color:#F4F3ED;
                "
              >
                ${title}
              </h1>


              <!-- MESSAGE -->

              <p
                style="
                  margin:0 auto 30px;
                  max-width:440px;
                  text-align:center;
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:15px;
                  line-height:25px;
                  color:#93A89B;
                "
              >
                ${message}
              </p>


              <!--
              =================================================
              CODE BOX
              =================================================
              -->

              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                role="presentation"
                style="
                  width:100%;
                  background-color:#0E1728;
                  border:1px solid rgba(46,212,127,.40);
                  border-radius:14px;
                "
              >

                <tr>

                  <td
                    align="center"
                    style="
                      padding:26px 15px 28px;
                    "
                  >


                    <!-- LABEL CODE -->

                    <div
                      style="
                        margin-bottom:12px;
                        font-family:Arial,Helvetica,sans-serif;
                        font-size:11px;
                        line-height:18px;
                        font-weight:700;
                        letter-spacing:2px;
                        color:#2ED47F;
                      "
                    >
                      VOTRE CODE
                    </div>


                    <!-- CODE -->

                    <div
                      style="
                        font-family:'Courier New',Courier,monospace;
                        font-size:34px;
                        line-height:42px;
                        font-weight:800;
                        letter-spacing:8px;
                        color:#E8CE8A;
                        text-align:center;
                      "
                    >
                      ${code}
                    </div>


                  </td>

                </tr>

              </table>


              <!--
              =================================================
              EXPIRATION
              =================================================
              -->

              <p
                style="
                  margin:24px 0 0;
                  text-align:center;
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:13px;
                  line-height:21px;
                  color:#93A89B;
                "
              >

                Ce code est valable pendant

                <strong
                  style="
                    color:#F4F3ED;
                    font-weight:700;
                  "
                >
                  15 minutes
                </strong>.

              </p>


              <!--
              =================================================
              MESSAGE DE SÉCURITÉ
              =================================================
              -->

              <p
                style="
                  margin:20px auto 0;
                  max-width:430px;
                  text-align:center;
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:12px;
                  line-height:20px;
                  color:#6F8278;
                "
              >
                ${securityMessage}
              </p>


            </td>

          </tr>


          <!--
          ====================================================
          FOOTER
          ====================================================
          -->

          <tr>

            <td
              align="center"
              style="
                padding:25px 20px 28px;
                background-color:#030617;
                border-top:1px solid rgba(244,243,237,.09);
              "
            >


              <!-- NOM -->

              <div
                style="
                  margin-bottom:6px;
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:13px;
                  line-height:20px;
                  font-weight:800;
                  letter-spacing:1px;
                  color:#F4F3ED;
                "
              >
                VIPBETCOTE
              </div>


              <!-- SLOGAN -->

              <div
                style="
                  margin-bottom:13px;
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:11px;
                  line-height:18px;
                  font-weight:600;
                  letter-spacing:1px;
                  color:#C9A44C;
                "
              >
                Genyen Chak Lè Jwe
              </div>


              <!-- COPYRIGHT -->

              <div
                style="
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:10px;
                  line-height:17px;
                  color:#566A60;
                "
              >
                © 2026 VIPBETCOTE — Tous droits réservés.
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
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({

          from: 'VIPBETCOTE <onboarding@resend.dev>',

          to: email,

          subject: subject,

          html: html

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
        headers: {
          'Content-Type': 'application/json'
        },
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

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        ok: true,
        type: type
      })

    };


  } catch (err) {

    return {

      statusCode: 500,

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        error: err.message
      })

    };

  }
};

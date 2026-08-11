exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: "Méthode non autorisée"
      })
    };
  }

  try {
    const { to, subject, html } = JSON.parse(event.body || "{}");

    if (!to || !subject || !html) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "to, subject et html sont obligatoires"
        })
      };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "VIPBETCOTE <onboarding@resend.dev>",
        to: [to],
        subject,
        html
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: data
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data
      })
    };

  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Erreur lors de l'envoi de l'email"
      })
    };
  }
};

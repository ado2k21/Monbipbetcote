exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { email, code } = JSON.parse(event.body);

    if (!email || !code) {
      return { statusCode: 400, body: JSON.stringify({ error: 'email et code requis' }) };
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'VIPBETCOTE <onboarding@resend.dev>',
        to: email,
        subject: 'Kòd verifikasyon VIPBETCOTE ou a',
        html: `
          <div style="font-family:sans-serif;background:#08152A;color:#F4F3ED;padding:32px;border-radius:12px">
            <h2 style="color:#2ED47F">VIPBETCOTE</h2>
            <p>Men kòd verifikasyon ou a :</p>
            <p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#C9A44C">${code}</p>
            <p style="color:#93A89B;font-size:13px">Kòd sa a valab pou 15 minit.</p>
          </div>`
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: data }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      event = 'dsagent page visit',
      details = 'A visitor accessed the dsagent site.',
      scenario = 'Page Visit Alert',
      result = 'Success',
    } = body;

    const headers = req.headers;

    // Network IP
    const rawIp = headers.get("x-forwarded-for")?.split(",")[0].trim();
    const ip = rawIp && rawIp !== "::1" && rawIp !== "127.0.0.1" ? rawIp : "Unknown";

    // IP Geolocation via ipapi.co (with timeout & fallback)
    let geo: Record<string, any> = {};
    if (ip !== "Unknown") {
      try {
        const res = await fetch(`https://ipapi.co/${ip}/json/`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = await res.json();
          if (!data.error) {
            geo = data;
          }
        }
      } catch (err) {
        console.error('[Notify API] Geo lookup error:', err);
      }
    }

    const visitor = {
      timestamp: new Date().toISOString(),
      event,
      ip,
      geo: {
        country: geo.country_name ?? "Unknown",
        region: geo.region ?? "Unknown",
        city: geo.city ?? "Unknown",
        postal: geo.postal ?? "Unknown",
        latitude: geo.latitude ?? "Unknown",
        longitude: geo.longitude ?? "Unknown",
        timezone: geo.timezone ?? "Unknown",
        isp: geo.org ?? "Unknown",
        asn: geo.asn ?? "Unknown",
      },
      userAgent: headers.get("user-agent") ?? "Unknown",
      language: headers.get("accept-language") ?? "Unknown",
      referer: headers.get("referer") ?? "None",
      secFetchSite: headers.get("sec-fetch-site") ?? "Unknown",
      secFetchMode: headers.get("sec-fetch-mode") ?? "Unknown",
      secFetchDest: headers.get("sec-fetch-dest") ?? "Unknown",
      secChUa: headers.get("sec-ch-ua") ?? "Unknown",
      secChUaPlatform: headers.get("sec-ch-ua-platform") ?? "Unknown",
      secChUaMobile: headers.get("sec-ch-ua-mobile") ?? "Unknown",
      forwarded: headers.get("forwarded") ?? "Unknown",
      host: headers.get("host") ?? "Unknown",
      origin: headers.get("origin") ?? "Unknown",
      accept: headers.get("accept") ?? "Unknown",
      acceptEncoding: headers.get("accept-encoding") ?? "Unknown",
      cacheControl: headers.get("cache-control") ?? "Unknown",
    };

    console.log('[Notify API] Visitor info:', visitor);

    const textBody = `
New Visitor

Time:
${new Date().toLocaleString()}

IP:
${ip}

Country:
${geo.country_name ?? "Unknown"}

State:
${geo.region ?? "Unknown"}

City:
${geo.city ?? "Unknown"}

Postal:
${geo.postal ?? "Unknown"}

Latitude:
${geo.latitude ?? "Unknown"}

Longitude:
${geo.longitude ?? "Unknown"}

Timezone:
${geo.timezone ?? "Unknown"}

ISP:
${geo.org ?? "Unknown"}

ASN:
${geo.asn ?? "Unknown"}

User-Agent:
${headers.get("user-agent") ?? "Unknown"}

Language:
${headers.get("accept-language") ?? "Unknown"}

Referer:
${headers.get("referer") ?? "None"}

Platform:
${headers.get("sec-ch-ua-platform") ?? "Unknown"}

Browser:
${headers.get("sec-ch-ua") ?? "Unknown"}

Mobile:
${headers.get("sec-ch-ua-mobile") ?? "Unknown"}

Event:
${event}

Details:
${details}
`;

    const senderEmail = process.env.SMTP_USER || process.env.SMTP_EMAIL;
    const rawPassword = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
    const senderPassword = rawPassword ? rawPassword.replace(/^"|"$/g, '') : '';
    const receiverEmail = process.env.NOTIFICATION_EMAIL || senderEmail;
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = Number(process.env.SMTP_PORT) || 465;

    if (!senderEmail || !senderPassword || !receiverEmail) {
      console.warn('[Notify API] Missing SMTP credentials in .env. Skipping email notification.');
      return NextResponse.json(
        { status: 'skipped', reason: 'No SMTP credentials found in .env', visitor },
        { status: 200 }
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: senderEmail,
        pass: senderPassword,
      },
    });

    const locationInfo = [geo.city, geo.country_name].filter(Boolean).join(', ') || ip;
    const subject = `dsagent Visitor Alert: ${event} (${locationInfo})`;

    const info = await transporter.sendMail({
      from: `"dsagent alerts" <${senderEmail}>`,
      to: receiverEmail,
      subject: subject,
      text: textBody,
    });

    console.log('[Notify API] Message sent: %s', info.messageId);

    return NextResponse.json({ status: 'success', messageId: info.messageId, visitor });
  } catch (error) {
    console.error('[Notify API] Failed to send email:', error);
    return NextResponse.json({ status: 'error', error: String(error) }, { status: 500 });
  }
}

// lib/email.ts
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true, // true for 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendReportEmail({
  to,
  reportTitle,
  reportPath,
  pipelineSummary,
}: {
  to: string;
  reportTitle: string;
  reportPath: string;
  pipelineSummary?: string;
}) {
  const filename = path.basename(reportPath);

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fafafa; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1A1A2E 0%, #0A0A0A 100%); padding: 32px 24px; text-align: center;">
        <h1 style="color: #00D4FF; margin: 0 0 4px; font-size: 24px; font-weight: 700;">DSAgent</h1>
        <p style="color: #8C8C8C; margin: 0; font-size: 13px;">Autonomous Pipeline Report</p>
      </div>
      <div style="padding: 28px 24px;">
        <h2 style="color: #1A1A2E; font-size: 18px; margin: 0 0 12px;">${reportTitle}</h2>
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Your autonomous data science pipeline has completed. The attached PDF report contains
          a detailed analysis of your dataset including EDA insights, visualizations, model training
          results, and recommendations.
        </p>
        ${pipelineSummary ? `
        <div style="background: #f0f0f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="color: #333; font-size: 13px; margin: 0; white-space: pre-line;">${pipelineSummary}</p>
        </div>
        ` : ""}
        <p style="color: #888; font-size: 12px; margin: 16px 0 0;">
          Generated on ${new Date().toLocaleString()}
        </p>
      </div>
      <div style="background: #f0f0f0; padding: 16px 24px; text-align: center;">
        <p style="color: #999; font-size: 11px; margin: 0;">DSAgent — AI-powered Data Science Platform</p>
      </div>
    </div>
  `;

  const mailOptions: nodemailer.SendMailOptions = {
    from: `"DSAgent" <${process.env.SMTP_USER}>`,
    to,
    subject: `📊 ${reportTitle} — DSAgent Pipeline Report`,
    html,
    attachments: [],
  };

  // Attach PDF if file exists
  if (reportPath && fs.existsSync(reportPath)) {
    mailOptions.attachments = [
      {
        filename,
        path: reportPath,
        contentType: "application/pdf",
      },
    ];
  }

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId, accepted: info.accepted };
}

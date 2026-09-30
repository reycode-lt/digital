import nodemailer from "nodemailer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

export async function sendWelcomeEmail({
    to,
    name,
    dashboardUrl
}) {
    const templatePath = path.join(
        __dirname,
        "../../templates/email/welcome.html"
    );

    let html = await fs.readFile(templatePath, "utf8");

    html = html
        .replaceAll("{{username}}", name)
        .replaceAll("{{dashboard_url}}", dashboardUrl);

    return await transporter.sendMail({
        from: `"${process.env.MAIL_FROM_NAME || "ReyCode"}" <${process.env.GMAIL_USER}>`,
        to,
        subject: "Welcome to ReyCode Digital",
        html
    });
}
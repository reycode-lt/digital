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

function getFrom() {
    return `"${process.env.MAIL_FROM_NAME || "ReyCode Digital"}" <${process.env.GMAIL_USER}>`;
}

export async function sendWelcomeEmail({
    to,
    name,
    dashboardUrl
}) {
    const templatePath = path.join(
        __dirname,
        "../../templates/email/welcome.html"
    );

    let html = await fs.readFile(
        templatePath,
        "utf8"
    );

    html = html
        .replaceAll("{{username}}", name)
        .replaceAll("{{dashboard_url}}", dashboardUrl);

    return await transporter.sendMail({
        from: getFrom(),
        to,
        subject: "Welcome to ReyCode Digital",
        html
    });
}

export async function sendVerificationEmail({
    to,
    name,
    verificationUrl
}) {
    const templatePath = path.join(
        __dirname,
        "../../templates/email/verification.html"
    );

    let html;

    try {
        html = await fs.readFile(
            templatePath,
            "utf8"
        );
    } catch {
        html = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verifikasi Email</title>
</head>

<body style="
    margin:0;
    padding:0;
    background:#05070d;
    font-family:Arial,Helvetica,sans-serif;
    color:#f5f7ff;
">

    <div style="
        max-width:560px;
        margin:40px auto;
        padding:30px 20px;
    ">

        <div style="
            background:#0d111b;
            border:1px solid #1c2535;
            border-radius:20px;
            padding:32px;
            text-align:center;
        ">

            <h1 style="
                margin:0 0 10px;
                font-size:28px;
                color:#ffffff;
            ">
                ReyCode Digital
            </h1>

            <p style="
                margin:0 0 25px;
                color:#718096;
                font-size:12px;
                letter-spacing:2px;
                font-weight:bold;
            ">
                EMAIL VERIFICATION
            </p>

            <h2 style="
                margin:0 0 15px;
                color:#ffffff;
            ">
                Halo, ${name}
            </h2>

            <p style="
                color:#929bad;
                font-size:14px;
                line-height:1.7;
            ">
                Terima kasih telah mendaftar di ReyCode Digital.
                Silakan verifikasi alamat email kamu untuk
                mengaktifkan akun.
            </p>

            <a
                href="${verificationUrl}"
                style="
                    display:inline-block;
                    margin-top:18px;
                    padding:14px 24px;
                    border-radius:12px;
                    background:#2875ff;
                    color:#ffffff;
                    text-decoration:none;
                    font-weight:bold;
                    font-size:14px;
                "
            >
                Verifikasi Email
            </a>

            <p style="
                margin-top:25px;
                color:#687286;
                font-size:11px;
                line-height:1.6;
            ">
                Jika kamu tidak membuat akun ReyCode Digital,
                abaikan email ini.
            </p>

            <p style="
                margin-top:25px;
                color:#4f596b;
                font-size:10px;
            ">
                © ReyCode Digital
            </p>

        </div>

    </div>

</body>
</html>
`;
    }

    html = html
        .replaceAll("{{username}}", name)
        .replaceAll("{{name}}", name)
        .replaceAll(
            "{{verification_url}}",
            verificationUrl
        )
        .replaceAll(
            "{{verify_url}}",
            verificationUrl
        );

    return await transporter.sendMail({
        from: getFrom(),
        to,
        subject: "Verifikasi Email — ReyCode Digital",
        html
    });
}
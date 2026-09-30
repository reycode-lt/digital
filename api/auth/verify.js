
import { connectDB } from "../_lib/mongodb.js";
import User from "../../models/User.js";
import { sendWelcomeEmail } from "../_lib/mail.js";

export default async function handler(req, res) {
    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
    );

    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            message: "Method tidak diizinkan"
        });
    }

    try {
        const token = String(
            req.query?.token || ""
        ).trim();

        if (!token) {
            return res.status(400).json({
                success: false,
                message: "Token verifikasi tidak ditemukan"
            });
        }

        await connectDB();

        const user = await User.findOne({
            verificationToken: token
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Token verifikasi tidak valid atau sudah digunakan"
            });
        }

        if (user.emailVerified === true) {
            return res.status(200).json({
                success: true,
                alreadyVerified: true,
                message: "Email sudah diverifikasi sebelumnya",
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    emailVerified: true,
                    welcomeEmailSent:
                        user.welcomeEmailSent === true
                }
            });
        }

        user.emailVerified = true;
        user.verificationToken = null;

        await user.save();

        let welcomeSent = false;

        if (user.welcomeEmailSent !== true) {
            try {
                const baseUrl =
                    process.env.APP_URL ||
                    `https://${req.headers.host}`;

                const dashboardUrl =
                    `${baseUrl}/dashboard`;

                await sendWelcomeEmail({
                    to: user.email,
                    name: user.name,
                    dashboardUrl
                });

                user.welcomeEmailSent = true;

                await user.save();

                welcomeSent = true;

            } catch (mailError) {
                console.error(
                    "WELCOME EMAIL ERROR:",
                    mailError
                );
            }
        }

        const updatedUser = await User.findById(
            user._id
        ).select(
            "_id name email whatsapp emailVerified welcomeEmailSent createdAt updatedAt"
        );

        return res.status(200).json({
            success: true,
            message: welcomeSent
                ? "Email berhasil diverifikasi dan Welcome Email telah dikirim"
                : "Email berhasil diverifikasi",
            welcomeEmailSent: updatedUser.welcomeEmailSent === true,
            user: updatedUser
        });

    } catch (error) {
        console.error(
            "VERIFY ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Gagal Verifkasi"
        });
    }
}

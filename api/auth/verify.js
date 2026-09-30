
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

        const userBefore = await User.findOne({
            verificationToken: token
        });

        if (!userBefore) {
            return res.status(400).json({
                success: false,
                message: "Token verifikasi tidak valid atau sudah digunakan"
            });
        }

        if (userBefore.emailVerified === true) {
            return res.status(200).json({
                success: true,
                alreadyVerified: true,
                message: "Email sudah diverifikasi sebelumnya",
                user: {
                    id: userBefore._id,
                    name: userBefore.name,
                    email: userBefore.email,
                    emailVerified: true,
                    welcomeEmailSent:
                        userBefore.welcomeEmailSent === true
                }
            });
        }

        const updateResult = await User.updateOne(
            {
                _id: userBefore._id,
                verificationToken: token,
                emailVerified: false
            },
            {
                $set: {
                    emailVerified: true
                },
                $unset: {
                    verificationToken: ""
                }
            }
        );

        if (updateResult.matchedCount !== 1) {
            return res.status(500).json({
                success: false,
                message: "User ditemukan tetapi gagal melakukan update verifikasi",
                debug: {
                    matchedCount: updateResult.matchedCount,
                    modifiedCount: updateResult.modifiedCount
                }
            });
        }

        const verifiedUser = await User.findById(
            userBefore._id
        ).select(
            "_id name email whatsapp emailVerified welcomeEmailSent createdAt updatedAt"
        );

        if (!verifiedUser) {
            return res.status(500).json({
                success: false,
                message: "User tidak ditemukan setelah update"
            });
        }

        let welcomeSent =
            verifiedUser.welcomeEmailSent === true;

        if (!welcomeSent) {
            try {
                const baseUrl =
                    process.env.APP_URL ||
                    `https://${req.headers.host}`;

                const dashboardUrl =
                    `${baseUrl}/dashboard`;

                await sendWelcomeEmail({
                    to: verifiedUser.email,
                    name: verifiedUser.name,
                    dashboardUrl
                });

                await User.updateOne(
                    {
                        _id: verifiedUser._id
                    },
                    {
                        $set: {
                            welcomeEmailSent: true
                        }
                    }
                );

                welcomeSent = true;

            } catch (mailError) {
                console.error(
                    "WELCOME EMAIL ERROR:",
                    mailError
                );
            }
        }

        const finalUser = await User.findById(
            verifiedUser._id
        ).select(
            "_id name email whatsapp emailVerified welcomeEmailSent createdAt updatedAt"
        );

        return res.status(200).json({
            success: true,
            message: welcomeSent
                ? "Email berhasil diverifikasi dan Welcome Email telah dikirim"
                : "Email berhasil diverifikasi",
            welcomeEmailSent: welcomeSent,
            user: finalUser,
            debug: {
                matchedCount: updateResult.matchedCount,
                modifiedCount: updateResult.modifiedCount
            }
        });

    } catch (error) {
        console.error(
            "VERIFY ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined
        });
    }
}

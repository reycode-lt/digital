import bcrypt from "bcryptjs";
import crypto from "crypto";
import { connectDB } from "../_lib/mongodb.js";
import User from "../../models/User.js";
import { sendVerificationEmail } from "../_lib/mail.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            message: "Cuki Cuki Enak Tau 😹"
        });
    }

    try {
        await connectDB();

        const {
            name,
            email,
            password,
            whatsapp = ""
        } = req.body || {};

        const cleanName = String(name || "").trim();
        const cleanEmail = String(email || "")
            .trim()
            .toLowerCase();
        const cleanPassword = String(password || "");
        const cleanWhatsapp = String(whatsapp || "").trim();

        if (!cleanName || !cleanEmail || !cleanPassword) {
            return res.status(400).json({
                success: false,
                message: "Nama, email, dan password wajib diisi"
            });
        }

        if (cleanName.length > 30) {
            return res.status(400).json({
                success: false,
                message: "Nama maksimal 30 karakter"
            });
        }

        if (cleanPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password minimal 8 karakter"
            });
        }

        const existingUser = await User.findOne({
            email: cleanEmail
        });

        if (existingUser) {
            if (existingUser.emailVerified) {
                return res.status(409).json({
                    success: false,
                    message: "Email sudah terdaftar"
                });
            }

            const newToken =
                crypto.randomBytes(32).toString("hex");

            existingUser.name = cleanName;
            existingUser.password =
                await bcrypt.hash(cleanPassword, 12);
            existingUser.whatsapp = cleanWhatsapp;
            existingUser.verificationToken = newToken;

            await existingUser.save();

            const baseUrl =
                process.env.APP_URL ||
                `https://${req.headers.host}`;

            const verificationUrl =
                `${baseUrl}/verify-email?token=${encodeURIComponent(
                    newToken
                )}`;

            try {
                await sendVerificationEmail({
                    to: existingUser.email,
                    name: existingUser.name,
                    verificationUrl
                });
            } catch (error) {
                console.error(
                    "RESEND VERIFICATION ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Email verifikasi gagal dikirim"
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Akun belum diverifikasi. Link verifikasi baru telah dikirim.",
                user: {
                    id: existingUser._id,
                    name: existingUser.name,
                    email: existingUser.email,
                    emailVerified: false
                }
            });
        }

        const hashedPassword =
            await bcrypt.hash(cleanPassword, 12);

        const verificationToken =
            crypto.randomBytes(32).toString("hex");

        const user = await User.create({
            name: cleanName,
            email: cleanEmail,
            password: hashedPassword,
            whatsapp: cleanWhatsapp,
            emailVerified: false,
            welcomeEmailSent: false,
            verificationToken,
            resetToken: null,
            resetTokenExpires: null
        });

        const baseUrl =
            process.env.APP_URL ||
            `https://${req.headers.host}`;

        const verificationUrl =
            `${baseUrl}/verify-email?token=${encodeURIComponent(
                verificationToken
            )}`;

        try {
            await sendVerificationEmail({
                to: user.email,
                name: user.name,
                verificationUrl
            });
        } catch (error) {
            console.error(
                "VERIFICATION EMAIL ERROR:",
                error
            );

            return res.status(201).json({
                success: true,
                emailSent: false,
                message:
                    "Akun berhasil dibuat, tetapi email verifikasi gagal dikirim.",
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    emailVerified: false
                }
            });
        }

        return res.status(201).json({
            success: true,
            emailSent: true,
            message:
                "Registrasi berhasil. Silakan cek email untuk verifikasi.",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                emailVerified: false
            }
        });

    } catch (error) {
        console.error(
            "REGISTER ERROR:",
            error
        );

        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Duplicate key",
                keyPattern: error.keyPattern || null,
                keyValue: error.keyValue || null
            });
        }

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
}

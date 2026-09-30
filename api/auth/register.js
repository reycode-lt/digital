import bcrypt from "bcryptjs";
import crypto from "crypto";
import { connectDB } from "../_lib/mongodb.js";
import User from "../../models/User.js";
import { sendVerificationEmail } from "../_lib/mail.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            message: "Method tidak diizinkan"
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

        const normalizedName = String(name || "").trim();
        const normalizedEmail = String(email || "")
            .trim()
            .toLowerCase();

        const normalizedPassword = String(password || "");
        const normalizedWhatsapp = String(whatsapp || "").trim();

        if (
            !normalizedName ||
            !normalizedEmail ||
            !normalizedPassword
        ) {
            return res.status(400).json({
                success: false,
                message: "Nama, email, dan password wajib diisi"
            });
        }

        if (normalizedName.length > 30) {
            return res.status(400).json({
                success: false,
                message: "Nama maksimal 30 karakter"
            });
        }

        if (normalizedPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password minimal 8 karakter"
            });
        }

        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            if (existingUser.emailVerified === true) {
                return res.status(409).json({
                    success: false,
                    message: "Email sudah terdaftar"
                });
            }

            const verificationToken =
                crypto.randomBytes(32).toString("hex");

            existingUser.name = normalizedName;
            existingUser.password =
                await bcrypt.hash(normalizedPassword, 12);
            existingUser.whatsapp = normalizedWhatsapp;
            existingUser.verificationToken =
                verificationToken;
            existingUser.emailVerified = false;

            await existingUser.save();

            const baseUrl =
                process.env.APP_URL ||
                `https://${req.headers.host}`;

            const verificationUrl =
                `${baseUrl}/verify-email?token=${encodeURIComponent(
                    verificationToken
                )}`;

            try {
                await sendVerificationEmail({
                    to: existingUser.email,
                    name: existingUser.name,
                    verificationUrl
                });
            } catch (mailError) {
                console.error(
                    "RESEND VERIFICATION ERROR:",
                    mailError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Akun belum terverifikasi dan email verifikasi gagal dikirim"
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Akun sudah ada tetapi belum diverifikasi. Link verifikasi baru telah dikirim.",
                user: {
                    id: existingUser._id,
                    name: existingUser.name,
                    email: existingUser.email,
                    emailVerified: false
                }
            });
        }

        const hashedPassword =
            await bcrypt.hash(normalizedPassword, 12);

        const verificationToken =
            crypto.randomBytes(32).toString("hex");

        const user = await User.create({
            name: normalizedName,
            email: normalizedEmail,
            password: hashedPassword,
            whatsapp: normalizedWhatsapp,
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
        } catch (mailError) {
            console.error(
                "VERIFICATION EMAIL ERROR:",
                mailError
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
        console.error("REGISTER ERROR:", error);

        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Email sudah terdaftar"
            });
        }

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
}

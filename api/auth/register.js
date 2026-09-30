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

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Nama, email, dan password wajib diisi"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password minimal 8 karakter"
            });
        }

        const normalizedEmail = String(email)
            .trim()
            .toLowerCase();

        const normalizedName = String(name)
            .trim();

        const normalizedWhatsapp = String(whatsapp || "")
            .trim();

        if (!normalizedName) {
            return res.status(400).json({
                success: false,
                message: "Nama tidak boleh kosong"
            });
        }

        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email sudah terdaftar"
            });
        }

        const hashedPassword = await bcrypt.hash(
            password,
            12
        );

        const verificationToken =
            crypto.randomBytes(32).toString("hex");

        const user = await User.create({
            name: normalizedName,
            email: normalizedEmail,
            password: hashedPassword,
            whatsapp: normalizedWhatsapp,
            emailVerified: false,
            verificationToken
        });

        const baseUrl =
            process.env.APP_URL ||
            `https://${req.headers.host}`;

        const verificationUrl =
            `${baseUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;

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

            await User.findByIdAndDelete(user._id);

            return res.status(500).json({
                success: false,
                message: "Akun gagal dibuat karena email verifikasi tidak dapat dikirim"
            });
        }

        return res.status(201).json({
            success: true,
            message: "Registrasi berhasil. Silakan cek email untuk verifikasi.",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified
            }
        });

    } catch (error) {
        console.error(
            "REGISTER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
}
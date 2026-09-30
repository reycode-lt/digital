import crypto from "crypto";
import { connectDB } from "../_lib/mongodb.js";
import User from "../../models/User.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            message: "Method tidak diizinkan"
        });
    }

    try {
        await connectDB();

        const { email } = req.body || {};

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email wajib diisi"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await User.findOne({
            email: normalizedEmail
        });

        if (!user) {
            return res.status(200).json({
                success: true,
                message: "Jika email terdaftar, link reset akan dikirim"
            });
        }

        const resetToken = crypto.randomBytes(32).toString("hex");

        user.resetToken = resetToken;
        user.resetTokenExpires = new Date(
            Date.now() + 30 * 60 * 1000
        );

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Link reset password siap dikirim"
        });
    } catch (error) {
        console.error("FORGOT ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
}
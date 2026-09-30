import bcrypt from "bcryptjs";
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

        const {
            token,
            password
        } = req.body || {};

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: "Token dan password wajib diisi"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password minimal 8 karakter"
            });
        }

        const user = await User.findOne({
            resetToken: token,
            resetTokenExpires: {
                $gt: new Date()
            }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Token reset tidak valid atau sudah kedaluwarsa"
            });
        }

        user.password = await bcrypt.hash(password, 12);
        user.resetToken = null;
        user.resetTokenExpires = null;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password berhasil diubah"
        });
    } catch (error) {
        console.error("RESET ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
}
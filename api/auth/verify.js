import { connectDB } from "../_lib/mongodb.js";
import User from "../../models/User.js";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            message: "Method tidak diizinkan"
        });
    }

    try {
        const { token } = req.query;

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
                message: "Token verifikasi tidak valid"
            });
        }

        user.emailVerified = true;
        user.verificationToken = null;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Email berhasil diverifikasi"
        });
    } catch (error) {
        console.error("VERIFY ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
}
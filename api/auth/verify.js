import { connectDB } from "../_lib/mongodb.js";
import User from "../../models/User.js";

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

        user.emailVerified = true;
        user.verificationToken = null;

        await user.save();

        const updatedUser = await User.findById(
            user._id
        ).select(
            "_id name email whatsapp emailVerified createdAt updatedAt"
        );

        return res.status(200).json({
            success: true,
            message: "Email berhasil diverifikasi",
            user: updatedUser
        });

    } catch (error) {
        console.error(
            "VERIFY ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
}

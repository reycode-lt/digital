import { connectDB } from "../_lib/mongodb.js";
import User from "../../models/User.js";
import {
    getAuthToken,
    verifyToken
} from "../_lib/auth.js";

export default async function handler(req, res) {
    if (req.method !== "PATCH") {
        return res.status(405).json({
            success: false,
            message: "Method tidak diizinkan"
        });
    }

    try {
        const token = getAuthToken(req);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Belum login"
            });
        }

        const payload = await verifyToken(token);

        if (!payload?.userId) {
            return res.status(401).json({
                success: false,
                message: "Session tidak valid"
            });
        }

        const { name, whatsapp } = req.body || {};

        if (!name?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Nama wajib diisi"
            });
        }

        await connectDB();

        const user = await User.findById(payload.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User tidak ditemukan"
            });
        }

        user.name = name.trim();
        user.whatsapp = typeof whatsapp === "string"
            ? whatsapp.trim()
            : user.whatsapp;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Profile berhasil diperbarui",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                whatsapp: user.whatsapp,
                emailVerified: user.emailVerified
            }
        });
    } catch (error) {
        console.error("UPDATE PROFILE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
}
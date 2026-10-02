import { connectDB } from "./_lib/mongodb.js";
import User from "../models/User.js";
import ChatMessage from "../models/ChatMessage.js";
import {
    getAuthToken,
    verifyToken
} from "./_lib/auth.js";

export default async function handler(req, res) {
    if (!["GET", "POST"].includes(req.method)) {
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

        await connectDB();

        const user = await User.findById(payload.userId).select(
            "_id name avatarUrl"
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User tidak ditemukan"
            });
        }

        if (req.method === "GET") {
            const messages = await ChatMessage.find({
                group: "monikalabs-comunity"
            })
                .sort({ createdAt: -1 })
                .limit(100)
                .populate("senderId", "name avatarUrl")
                .lean();

            const totalUsers = await User.countDocuments();

            return res.status(200).json({
                success: true,
                group: {
                    name: "MonikaLabs Comunity",
                    totalUsers
                },
                messages: messages.reverse()
            });
        }

        const {
            action,
            message
        } = req.body || {};

        if (action !== "send") {
            return res.status(400).json({
                success: false,
                message: "Action tidak valid"
            });
        }

        const content = String(message || "").trim();

        if (!content) {
            return res.status(400).json({
                success: false,
                message: "Pesan tidak boleh kosong"
            });
        }

        if (content.length > 5000) {
            return res.status(400).json({
                success: false,
                message: "Pesan terlalu panjang"
            });
        }

        const newMessage = await ChatMessage.create({
            group: "monikalabs-comunity",
            senderId: user._id,
            content
        });

        const result = await ChatMessage.findById(
            newMessage._id
        )
            .populate("senderId", "name avatarUrl")
            .lean();

        return res.status(201).json({
            success: true,
            message: result
        });
    } catch (error) {
        console.error("CHAT ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
}

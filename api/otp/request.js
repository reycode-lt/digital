import { connectDB } from "../_lib/mongodb.js";
import { getAuthToken, verifyToken } from "../_lib/auth.js";
import { requestOtp } from "../_lib/otp.js";
import User from "../../models/User.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            message: "Method tidak diizinkan."
        });
    }

    try {
        await connectDB();

        const token = getAuthToken(req);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Anda belum login."
            });
        }

        const payload = await verifyToken(token);

        if (!payload?.userId) {
            return res.status(401).json({
                success: false,
                message: "Sesi login tidak valid."
            });
        }

        const user = await User.findById(payload.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User tidak ditemukan."
            });
        }

        let body = req.body;

        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch {
                body = {};
            }
        }

        const phone = String(
            body?.phone ||
            body?.whatsapp ||
            user.whatsapp ||
            ""
        ).trim();

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Nomor WhatsApp wajib diisi."
            });
        }

        if (user.phoneVerified && user.whatsapp === phone) {
            return res.status(400).json({
                success: false,
                message: "Nomor WhatsApp sudah terverifikasi."
            });
        }

        const result = await requestOtp({
            userId: user._id,
            phone
        });

        return res.status(200).json({
            success: true,
            message: "OTP berhasil dibuat.",
            requestId: result.requestId,
            phone: result.phone,
            expiresAt: result.expiresAt,
            event: result.event
        });
    } catch (error) {
        console.error(
            "OTP REQUEST ERROR:",
            error
        );

        return res.status(400).json({
            success: false,
            message:
                error?.message ||
                "Gagal membuat OTP."
        });
    }
}

import { connectDB } from "../_lib/mongodb.js";
import { getAuthToken, verifyToken } from "../_lib/auth.js";
import { verifyOtp, normalizePhone } from "../_lib/otp.js";
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

        const user = await User.findById(
            payload.userId
        );

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

        const phone = normalizePhone(
            body?.phone ||
            body?.whatsapp ||
            ""
        );

        const otp = String(
            body?.otp || ""
        ).trim();

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Nomor WhatsApp wajib diisi."
            });
        }

        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({
                success: false,
                message: "OTP harus terdiri dari 6 angka."
            });
        }

        const result = await verifyOtp({
            userId: user._id,
            phone,
            otp
        });

        user.whatsapp = phone;
        user.phoneVerified = true;
        user.phoneVerifiedAt =
            result.verifiedAt;

        await user.save();

        return res.status(200).json({
            success: true,
            message:
                "Nomor WhatsApp berhasil diverifikasi.",
            phone: user.whatsapp,
            phoneVerified:
                user.phoneVerified,
            phoneVerifiedAt:
                user.phoneVerifiedAt
        });
    } catch (error) {
        console.error(
            "OTP VERIFY ERROR:",
            error
        );

        return res.status(400).json({
            success: false,
            message:
                error?.message ||
                "Gagal memverifikasi OTP."
        });
    }
}

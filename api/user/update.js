import { connectDB } from "../_lib/mongodb.js";
import User from "../../models/User.js";
import {
    getAuthToken,
    verifyToken
} from "../_lib/auth.js";
import {
    requestOtp,
    verifyOtp
} from "../../lib/otp.js";

export default async function handler(req, res) {
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

        const user = await User.findById(payload.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User tidak ditemukan"
            });
        }

        /*
         * REQUEST / VERIFY OTP
         */
        if (req.method === "POST") {
            const {
                action,
                phone,
                otp
            } = req.body || {};

            if (action === "request_otp") {
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
                    cooldownSeconds:
                        result.cooldownSeconds,
                    event: result.event,

                    /*
                     * Sementara dikembalikan
                     * untuk proses integrasi
                     * WhatsApp notification.
                     */
                    otp: result.otp
                });
            }

            if (action === "verify_otp") {
                const result = await verifyOtp({
                    userId: user._id,
                    phone,
                    otp
                });

                user.whatsapp = result.phone;
                user.phoneVerified = true;
                user.phoneVerifiedAt =
                    result.verifiedAt;

                await user.save();

                return res.status(200).json({
                    success: true,
                    message:
                        "Nomor WhatsApp berhasil diverifikasi.",
                    user: {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        whatsapp: user.whatsapp,
                        emailVerified:
                            user.emailVerified,
                        phoneVerified:
                            user.phoneVerified,
                        phoneVerifiedAt:
                            user.phoneVerifiedAt
                    }
                });
            }

            return res.status(400).json({
                success: false,
                message: "Action tidak valid"
            });
        }

        /*
         * UPDATE PROFILE
         */
        if (req.method === "PATCH") {
            const {
                name,
                whatsapp
            } = req.body || {};

            if (!name?.trim()) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Nama wajib diisi"
                });
            }

            user.name = name.trim();

            if (
                typeof whatsapp ===
                "string"
            ) {
                user.whatsapp =
                    whatsapp.trim();
            }

            await user.save();

            return res.status(200).json({
                success: true,
                message:
                    "Profile berhasil diperbarui.",
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    whatsapp:
                        user.whatsapp,
                    emailVerified:
                        user.emailVerified,
                    phoneVerified:
                        user.phoneVerified
                }
            });
        }

        return res.status(405).json({
            success: false,
            message:
                "Method tidak diizinkan"
        });
    } catch (error) {
        console.error(
            "UPDATE / OTP ERROR:",
            error
        );

        return res.status(400).json({
            success: false,
            message:
                error?.message ||
                "Terjadi kesalahan pada server"
        });
    }
}

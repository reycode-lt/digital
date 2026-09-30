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
        const token = String(req.query?.token || "").trim();

        if (!token) {
            return res.status(400).json({
                success: false,
                message: "Token verifikasi tidak ditemukan"
            });
        }

        await connectDB();

        const user = await User.findOneAndUpdate(
            {
                verificationToken: token,
                emailVerified: false
            },
            {
                $set: {
                    emailVerified: true
                },
                $unset: {
                    verificationToken: ""
                }
            },
            {
                new: true
            }
        ).select(
            "_id name email emailVerified"
        );

        if (!user) {
            const existingUser = await User.findOne({
                verificationToken: token
            }).select(
                "_id name email emailVerified"
            );

            if (existingUser?.emailVerified === true) {
                return res.status(200).json({
                    success: true,
                    alreadyVerified: true,
                    message: "Email sudah diverifikasi sebelumnya",
                    user: {
                        id: existingUser._id,
                        name: existingUser.name,
                        email: existingUser.email,
                        emailVerified: true
                    }
                });
            }

            return res.status(400).json({
                success: false,
                message: "Token verifikasi tidak valid atau sudah digunakan"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Email berhasil diverifikasi",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified
            }
        });

    } catch (error) {
        console.error("VERIFY ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
}

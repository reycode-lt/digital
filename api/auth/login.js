import bcrypt from "bcryptjs";
import { connectDB } from "../_lib/mongodb.js";
import User from "../../models/User.js";
import {
    createToken,
    setAuthCookie
} from "../_lib/auth.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            message: "Method tidak diizinkan"
        });
    }

    try {
        await connectDB();

        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email dan password wajib diisi"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await User.findOne({
            email: normalizedEmail
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Email atau password salah"
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.password
        );

        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: "Email atau password salah"
            });
        }

        const token = await createToken({
            userId: user._id.toString(),
            email: user.email
        });

        setAuthCookie(res, token);

        return res.status(200).json({
            success: true,
            message: "Login berhasil",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified
            }
        });
    } catch (error) {
        console.error("LOGIN ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
}
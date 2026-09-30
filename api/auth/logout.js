import { clearAuthCookie } from "../_lib/auth.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            message: "Method tidak diizinkan"
        });
    }

    clearAuthCookie(res);

    return res.status(200).json({
        success: true,
        message: "Logout berhasil"
    });
}
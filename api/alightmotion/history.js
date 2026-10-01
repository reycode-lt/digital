import { connectDB } from "../_lib/mongodb.js";
import { getAuthToken, verifyToken } from "../_lib/auth.js";
import AlightMotionHistory from "../../models/AlightMotionHistory.js";

export default async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({
                success: false,
                message: "Method not allowed"
            });
        }

        await connectDB();

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

        const history = await AlightMotionHistory
            .find({
                userId: payload.userId
            })
            .sort({
                createdAt: -1
            })
            .limit(50)
            .lean();

        return res.status(200).json({
            success: true,
            history
        });
    } catch (error) {
        console.error("ALIGHT MOTION HISTORY ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Gagal mengambil history"
        });
    }
}

import fs from "fs/promises";
import formidable from "formidable";
import { connectDB } from "../_lib/mongodb.js";
import User from "../../models/User.js";
import {
    getAuthToken,
    verifyToken
} from "../_lib/auth.js";
import {
    uploadImage,
    deleteImage
} from "../../lib/upload.js";

export const config = {
    api: {
        bodyParser: false
    }
};

function getField(fields, name) {
    const value = fields?.[name];

    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
}

function getFile(files, name) {
    const value = files?.[name];

    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
}

async function parseForm(req) {
    const form = formidable({
        multiples: false,
        maxFiles: 1,
        maxFileSize: 8 * 1024 * 1024
    });

    const [fields, files] =
        await form.parse(req);

    return {
        fields,
        files
    };
}

async function parseJsonBody(req) {
    const chunks = [];

    for await (const chunk of req) {
        chunks.push(
            Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk)
        );
    }

    const body = Buffer
        .concat(chunks)
        .toString("utf8");

    if (!body) {
        return {};
    }

    try {
        return JSON.parse(body);
    } catch {
        return {};
    }
}

function getUserResponse(user) {
    return {
        _id: user._id,
        id: user._id,
        name: user.name || "",
        email: user.email || "",
        whatsapp: user.whatsapp || "",
        profilePhoto:
            user.profilePhoto || "",
        profileBackground:
            user.profileBackground || "",
        emailVerified:
            user.emailVerified === true,
        phoneVerified:
            user.phoneVerified === true,
        phoneVerifiedAt:
            user.phoneVerifiedAt || null,
        createdAt:
            user.createdAt || null,
        updatedAt:
            user.updatedAt || null
    };
}

export default async function handler(req, res) {
    try {
        const token = getAuthToken(req);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Belum login"
            });
        }

        const payload =
            await verifyToken(token);

        if (!payload?.userId) {
            return res.status(401).json({
                success: false,
                message:
                    "Session tidak valid"
            });
        }

        await connectDB();

        const user =
            await User.findById(
                payload.userId
            );

        if (!user) {
            return res.status(404).json({
                success: false,
                message:
                    "User tidak ditemukan"
            });
        }

        if (req.method === "POST") {
            const {
                fields,
                files
            } = await parseForm(req);

            const type =
                getField(
                    fields,
                    "type"
                );

            if (
                type !== "profilePhoto" &&
                type !== "profileBackground"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Tipe upload tidak valid"
                });
            }

            const file =
                getFile(
                    files,
                    "file"
                );

            if (!file) {
                return res.status(400).json({
                    success: false,
                    message:
                        "File gambar wajib dipilih"
                });
            }

            if (
                !file.mimetype ||
                !file.mimetype.startsWith(
                    "image/"
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "File harus berupa gambar"
                });
            }

            const buffer =
                await fs.readFile(
                    file.filepath
                );

            const oldUrl =
                user[type] || "";

            const result =
                await uploadImage({
                    buffer,
                    contentType:
                        file.mimetype,
                    userId:
                        user._id.toString(),
                    type
                });

            user[type] =
                result.url;

            await user.save();

            if (
                oldUrl &&
                oldUrl !== result.url
            ) {
                try {
                    await deleteImage(
                        oldUrl
                    );
                } catch (deleteError) {
                    console.error(
                        "OLD IMAGE DELETE ERROR:",
                        deleteError
                    );
                }
            }

            return res.status(200).json({
                success: true,
                message:
                    type === "profilePhoto"
                        ? "Foto profil berhasil diperbarui."
                        : "Background profil berhasil diperbarui.",
                type,
                url: result.url,
                user:
                    getUserResponse(user)
            });
        }

        if (req.method === "PATCH") {
            const body =
                await parseJsonBody(req);

            const {
                name,
                whatsapp
            } = body || {};

            if (
                typeof name === "string" &&
                name.trim()
            ) {
                user.name =
                    name.trim();
            }

            if (
                typeof whatsapp === "string"
            ) {
                user.whatsapp =
                    whatsapp.trim();

                if (
                    whatsapp.trim()
                ) {
                    user.phoneVerified =
                        true;

                    user.phoneVerifiedAt =
                        new Date();
                }
            }

            await user.save();

            return res.status(200).json({
                success: true,
                message:
                    "Profile berhasil diperbarui.",
                user:
                    getUserResponse(user)
            });
        }

        return res.status(405).json({
            success: false,
            message:
                "Method tidak diizinkan"
        });
    } catch (error) {
        console.error(
            "UPDATE PROFILE ERROR:",
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

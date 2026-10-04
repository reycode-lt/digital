import fs from "fs/promises";
import { put } from "@vercel/blob";
import Story from "../../models/Story.js";

const IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
]);

const VIDEO_TYPES = new Set([
    "video/mp4",
    "video/webm",
    "video/quicktime"
]);

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

function getExtension(contentType) {
    const map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov"
    };

    return map[contentType] || "";
}

export async function createStory({
    file,
    userId,
    caption = ""
}) {
    if (!file?.filepath) {
        throw new Error("File story wajib dipilih");
    }

    if (!userId) {
        throw new Error("User tidak valid");
    }

    const contentType =
        file.mimetype || "";

    if (
        !IMAGE_TYPES.has(contentType) &&
        !VIDEO_TYPES.has(contentType)
    ) {
        throw new Error(
            "Story hanya mendukung JPG, PNG, WEBP, GIF, MP4, WEBM, atau MOV"
        );
    }

    const isVideo =
        VIDEO_TYPES.has(contentType);

    const maxSize =
        isVideo
            ? MAX_VIDEO_SIZE
            : MAX_IMAGE_SIZE;

    if (file.size > maxSize) {
        throw new Error(
            isVideo
                ? "Ukuran video maksimal 50 MB"
                : "Ukuran gambar maksimal 8 MB"
        );
    }

    const cleanCaption =
        typeof caption === "string"
            ? caption.trim().slice(0, 1000)
            : "";

    const buffer =
        await fs.readFile(
            file.filepath
        );

    const extension =
        getExtension(contentType);

    const pathname =
        `users/${userId}/stories/${Date.now()}-${crypto.randomUUID()}${extension}`;

    const blob = await put(
        pathname,
        buffer,
        {
            access: "public",
            addRandomSuffix: false,
            contentType
        }
    );

    const createdAt =
        new Date();

    const expiresAt =
        new Date(
            createdAt.getTime() +
            24 * 60 * 60 * 1000
        );

    return Story.create({
        ownerId: userId,
        mediaUrl: blob.url,
        mediaPathname: blob.pathname,
        mediaType:
            isVideo
                ? "video"
                : "image",
        contentType,
        caption: cleanCaption,
        createdAt,
        expiresAt
    });
}

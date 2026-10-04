import { put, del } from "@vercel/blob";

const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
]);

const MAX_FILE_SIZE = 8 * 1024 * 1024;

const EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif"
};

const ALLOWED_UPLOAD_TYPES = new Set([
    "profilePhoto",
    "profileBackground",
    "productImage"
]);

export async function uploadImage({
    buffer,
    contentType,
    userId,
    type,
    productId = ""
}) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error("File gambar tidak valid");
    }

    if (!ALLOWED_TYPES.has(contentType)) {
        throw new Error(
            "Format gambar harus JPG, PNG, WEBP, atau GIF"
        );
    }

    if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(
            "Ukuran gambar maksimal 8 MB"
        );
    }

    if (!ALLOWED_UPLOAD_TYPES.has(type)) {
        throw new Error(
            "Tipe upload tidak valid"
        );
    }

    const extension =
        EXTENSIONS[contentType];

    const pathname =
        type === "productImage"
            ? `users/${userId}/products/${productId}-${Date.now()}${extension}`
            : `users/${userId}/${type}-${Date.now()}${extension}`;

    const blob = await put(
        pathname,
        buffer,
        {
            access: "public",
            addRandomSuffix: true,
            contentType
        }
    );

    return {
        url: blob.url,
        pathname: blob.pathname,
        contentType: blob.contentType
    };
}

export async function deleteImage(url) {
    if (
        !url ||
        typeof url !== "string"
    ) {
        return;
    }

    if (
        !url.includes(
            ".blob.vercel-storage.com/"
        )
    ) {
        return;
    }

    await del(url);
}

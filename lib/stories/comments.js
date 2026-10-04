import mongoose from "mongoose";
import Story from "../../models/Story.js";
import StoryComment from "../../models/StoryComment.js";

export async function getComments({
    storyId
}) {
    if (
        !mongoose.Types.ObjectId.isValid(storyId)
    ) {
        throw new Error("Story tidak valid");
    }

    const comments =
        await StoryComment.find({
            storyId
        })
            .populate(
                "userId",
                "name avatarUrl emailVerified"
            )
            .sort({
                createdAt: 1
            })
            .lean();

    return comments;
}

export async function addComment({
    storyId,
    userId,
    text,
    parentId = null
}) {
    if (
        !mongoose.Types.ObjectId.isValid(storyId)
    ) {
        throw new Error("Story tidak valid");
    }

    if (
        !mongoose.Types.ObjectId.isValid(userId)
    ) {
        throw new Error("User tidak valid");
    }

    const cleanText =
        typeof text === "string"
            ? text.trim()
            : "";

    if (!cleanText) {
        throw new Error(
            "Komentar tidak boleh kosong"
        );
    }

    if (cleanText.length > 1000) {
        throw new Error(
            "Komentar maksimal 1000 karakter"
        );
    }

    const story = await Story.findOne({
        _id: storyId,
        expiresAt: {
            $gt: new Date()
        }
    });

    if (!story) {
        throw new Error(
            "Story tidak ditemukan atau sudah expired"
        );
    }

    if (
        parentId &&
        !mongoose.Types.ObjectId.isValid(
            parentId
        )
    ) {
        throw new Error(
            "Komentar induk tidak valid"
        );
    }

    if (parentId) {
        const parent =
            await StoryComment.findOne({
                _id: parentId,
                storyId
            });

        if (!parent) {
            throw new Error(
                "Komentar induk tidak ditemukan"
            );
        }
    }

    const comment =
        await StoryComment.create({
            storyId,
            userId,
            parentId,
            text: cleanText
        });

    await comment.populate(
        "userId",
        "name avatarUrl emailVerified"
    );

    return comment;
}

export async function deleteComment({
    commentId,
    userId
}) {
    if (
        !mongoose.Types.ObjectId.isValid(
            commentId
        )
    ) {
        throw new Error(
            "Komentar tidak valid"
        );
    }

    const comment =
        await StoryComment.findById(
            commentId
        );

    if (!comment) {
        throw new Error(
            "Komentar tidak ditemukan"
        );
    }

    const story =
        await Story.findById(
            comment.storyId
        );

    if (!story) {
        throw new Error(
            "Story tidak ditemukan"
        );
    }

    const isOwner =
        comment.userId.toString() ===
        userId.toString();

    const isStoryOwner =
        story.ownerId.toString() ===
        userId.toString();

    if (!isOwner && !isStoryOwner) {
        throw new Error(
            "Tidak memiliki akses"
        );
    }

    await StoryComment.deleteMany({
        $or: [
            {
                _id: comment._id
            },
            {
                parentId: comment._id
            }
        ]
    });

    return {
        success: true,
        commentId: comment._id
    };
}

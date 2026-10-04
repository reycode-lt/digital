import mongoose from "mongoose";

const ProductCommentSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        parentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ProductComment",
            default: null,
            index: true
        },
        text: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000
        }
    },
    {
        timestamps: true
    }
);

ProductCommentSchema.index({
    productId: 1,
    createdAt: -1
});

export default mongoose.models.ProductComment ||
    mongoose.model("ProductComment", ProductCommentSchema);

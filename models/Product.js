import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
    {
        sellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        description: {
            type: String,
            default: "",
            trim: true,
            maxlength: 2000
        },
        price: {
            type: Number,
            required: true,
            min: 0
        },
        stock: {
            type: Number,
            required: true,
            min: 0,
            default: 0
        },
        category: {
            type: String,
            required: true,
            trim: true,
            maxlength: 40,
            index: true
        },
        images: {
            type: [String],
            default: []
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
            index: true
        }
    },
    {
        timestamps: true
    }
);

ProductSchema.index({
    name: "text",
    description: "text",
    category: "text"
});

export default mongoose.models.Product ||
    mongoose.model("Product", ProductSchema);

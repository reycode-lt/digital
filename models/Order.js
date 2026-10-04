import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema(
    {
        buyerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        items: [
            {
                productId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true
                },
                sellerId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                    required: true
                },
                name: {
                    type: String,
                    required: true
                },
                image: {
                    type: String,
                    default: ""
                },
                price: {
                    type: Number,
                    required: true,
                    min: 0
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1
                },
                subtotal: {
                    type: Number,
                    required: true,
                    min: 0
                }
            }
        ],
        total: {
            type: Number,
            required: true,
            min: 0
        },
        status: {
            type: String,
            enum: [
                "pending",
                "confirmed",
                "completed",
                "cancelled"
            ],
            default: "pending",
            index: true
        }
    },
    {
        timestamps: true
    }
);

OrderSchema.index({
    "items.sellerId": 1,
    createdAt: -1
});

export default mongoose.models.Order ||
    mongoose.model("Order", OrderSchema);

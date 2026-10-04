import mongoose from "mongoose";
import formidable from "formidable";
import fs from "fs/promises";

import Product from "../models/Product.js";
import Cart from "../models/Cart.js";
import Order from "../models/Order.js";
import ProductComment from "../models/ProductComment.js";
import User from "../models/User.js";

import { connectDB } from "./_lib/mongodb.js";
import { getAuthToken, verifyToken } from "./_lib/auth.js";
import { uploadImage, deleteImage } from "../lib/upload.js";

export const config = {
    api: {
        bodyParser: false
    }
};

const MAX_PRODUCT_IMAGES = 6;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

function response(res, status, data) {
    return res.status(status).json(data);
}

function getField(value, fallback = "") {
    if (Array.isArray(value)) {
        return value[0] ?? fallback;
    }

    return value ?? fallback;
}

function getFiles(files) {
    const result = [];

    for (const value of Object.values(files || {})) {
        if (Array.isArray(value)) {
            result.push(...value);
        } else if (value) {
            result.push(value);
        }
    }

    return result;
}

function validId(value) {
    return typeof value === "string" &&
        mongoose.Types.ObjectId.isValid(value);
}

function normalizeUser(user) {
    if (!user) {
        return null;
    }

    return {
        _id: user._id,
        name: user.name || "User",
        email: user.email || "",
        whatsapp: user.whatsapp || "",
        avatarUrl: user.avatarUrl || "",
        coverUrl: user.coverUrl || "",
        emailVerified: Boolean(user.emailVerified),
        phoneVerified: Boolean(user.phoneVerified),
        verified: Boolean(user.emailVerified || user.phoneVerified)
    };
}

function normalizeProduct(product) {
    if (!product) {
        return null;
    }

    const item = {
        ...product
    };

    if (item.sellerId && typeof item.sellerId === "object") {
        item.seller = normalizeUser(item.sellerId);
        item.sellerId = item.seller?._id || item.sellerId;
    }

    delete item.__v;

    return item;
}

async function parseJsonBody(req) {
    if (req.body && typeof req.body === "object") {
        return req.body;
    }

    const chunks = [];

    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (!chunks.length) {
        return {};
    }

    const raw = Buffer.concat(chunks).toString("utf8").trim();

    if (!raw) {
        return {};
    }

    try {
        return JSON.parse(raw);
    } catch {
        throw new Error("JSON tidak valid");
    }
}

async function parseMultipart(req) {
    const form = formidable({
        multiples: true,
        maxFiles: MAX_PRODUCT_IMAGES,
        maxFileSize: MAX_IMAGE_SIZE,
        keepExtensions: true,
        allowEmptyFiles: false
    });

    return await new Promise((resolve, reject) => {
        form.parse(req, (error, fields, files) => {
            if (error) {
                reject(error);
                return;
            }

            resolve({
                fields,
                files
            });
        });
    });
}

async function authenticate(req) {
    const token = getAuthToken(req);

    if (!token) {
        throw new Error("Belum login");
    }

    const payload = await verifyToken(token);

    if (!payload?.userId) {
        throw new Error("Session tidak valid");
    }

    return payload;
}

async function uploadProductImages(files, userId, productId = "") {
    const uploaded = [];

    if (!files.length) {
        return uploaded;
    }

    if (files.length > MAX_PRODUCT_IMAGES) {
        throw new Error(`Maksimal ${MAX_PRODUCT_IMAGES} gambar`);
    }

    try {
        for (const file of files) {
            if (!file?.filepath) {
                continue;
            }

            if (file.size > MAX_IMAGE_SIZE) {
                throw new Error("Ukuran setiap gambar maksimal 8 MB");
            }

            const buffer = await fs.readFile(file.filepath);

            const result = await uploadImage({
                buffer,
                contentType: file.mimetype,
                userId,
                type: "productImage",
                productId: productId || new mongoose.Types.ObjectId().toString()
            });

            uploaded.push(result.url);
        }

        return uploaded;
    } catch (error) {
        await Promise.allSettled(
            uploaded.map(url => deleteImage(url))
        );

        throw error;
    }
}

async function getProducts(req, res, userId = null) {
    const {
        search = "",
        category = "",
        sellerId = "",
        page = "1",
        limit = "20"
    } = req.query;

    const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const currentLimit = Math.min(
        50,
        Math.max(1, Number.parseInt(limit, 10) || 20)
    );

    const filter = {
        status: "active"
    };

    if (category && category !== "all") {
        filter.category = category;
    }

    if (sellerId) {
        if (!validId(sellerId)) {
            return response(res, 400, {
                success: false,
                message: "Seller tidak valid"
            });
        }

        filter.sellerId = sellerId;
    }

    if (search.trim()) {
        const keyword = search.trim().slice(0, 100);

        filter.$or = [
            {
                name: {
                    $regex: keyword,
                    $options: "i"
                }
            },
            {
                description: {
                    $regex: keyword,
                    $options: "i"
                }
            },
            {
                category: {
                    $regex: keyword,
                    $options: "i"
                }
            }
        ];
    }

    const skip = (currentPage - 1) * currentLimit;

    const [products, total] = await Promise.all([
        Product.find(filter)
            .populate({
                path: "sellerId",
                model: User,
                select: "name email whatsapp avatarUrl coverUrl emailVerified phoneVerified"
            })
            .sort({
                createdAt: -1
            })
            .skip(skip)
            .limit(currentLimit)
            .lean(),

        Product.countDocuments(filter)
    ]);

    const productIds = products.map(product => product._id);

    const comments = productIds.length
        ? await ProductComment.aggregate([
            {
                $match: {
                    productId: {
                        $in: productIds
                    }
                }
            },
            {
                $group: {
                    _id: "$productId",
                    count: {
                        $sum: 1
                    }
                }
            }
        ])
        : [];

    const commentMap = new Map(
        comments.map(item => [
            item._id.toString(),
            item.count
        ])
    );

    const result = products.map(product => {
        const normalized = normalizeProduct(product);

        normalized.commentCount =
            commentMap.get(product._id.toString()) || 0;

        normalized.isOwner =
            Boolean(userId) &&
            String(product.sellerId?._id || product.sellerId) === String(userId);

        return normalized;
    });

    return response(res, 200, {
        success: true,
        products: result,
        pagination: {
            page: currentPage,
            limit: currentLimit,
            total,
            pages: Math.ceil(total / currentLimit),
            hasMore: skip + result.length < total
        }
    });
}

async function getProduct(req, res, userId) {
    const productId = getField(req.query.id);

    if (!validId(productId)) {
        return response(res, 400, {
            success: false,
            message: "ID produk tidak valid"
        });
    }

    const product = await Product.findById(productId)
        .populate({
            path: "sellerId",
            model: User,
            select: "name email whatsapp avatarUrl coverUrl emailVerified phoneVerified"
        })
        .lean();

    if (!product) {
        return response(res, 404, {
            success: false,
            message: "Produk tidak ditemukan"
        });
    }

    const commentCount = await ProductComment.countDocuments({
        productId
    });

    const result = normalizeProduct(product);

    result.commentCount = commentCount;
    result.isOwner =
        String(product.sellerId?._id || product.sellerId) === String(userId);

    return response(res, 200, {
        success: true,
        product: result
    });
}

async function getMyProducts(req, res, userId) {
    const products = await Product.find({
        sellerId: userId
    })
        .sort({
            createdAt: -1
        })
        .lean();

    return response(res, 200, {
        success: true,
        products: products.map(product => ({
            ...normalizeProduct(product),
            isOwner: true
        }))
    });
}

async function createProduct(req, res, userId) {
    const { fields, files } = await parseMultipart(req);

    const name = getField(fields.name).trim();
    const description = getField(fields.description).trim();
    const category = getField(fields.category).trim();
    const price = Number(getField(fields.price));
    const stock = Number(getField(fields.stock));

    if (!name) {
        return response(res, 400, {
            success: false,
            message: "Nama produk wajib diisi"
        });
    }

    if (name.length > 100) {
        return response(res, 400, {
            success: false,
            message: "Nama produk maksimal 100 karakter"
        });
    }

    if (!category) {
        return response(res, 400, {
            success: false,
            message: "Kategori wajib dipilih"
        });
    }

    if (!Number.isFinite(price) || price < 0) {
        return response(res, 400, {
            success: false,
            message: "Harga tidak valid"
        });
    }

    if (!Number.isInteger(stock) || stock < 0) {
        return response(res, 400, {
            success: false,
            message: "Stock tidak valid"
        });
    }

    if (description.length > 2000) {
        return response(res, 400, {
            success: false,
            message: "Deskripsi maksimal 2000 karakter"
        });
    }

    const imageFiles = getFiles(files);

    if (imageFiles.length > MAX_PRODUCT_IMAGES) {
        return response(res, 400, {
            success: false,
            message: `Maksimal ${MAX_PRODUCT_IMAGES} gambar`
        });
    }

    const productId = new mongoose.Types.ObjectId();

    let images = [];

    try {
        images = await uploadProductImages(
            imageFiles,
            userId,
            productId.toString()
        );

        const product = await Product.create({
            _id: productId,
            sellerId: userId,
            name,
            description,
            price,
            stock,
            category,
            images,
            status: "active"
        });

        const populated = await Product.findById(product._id)
            .populate({
                path: "sellerId",
                model: User,
                select: "name email whatsapp avatarUrl coverUrl emailVerified phoneVerified"
            })
            .lean();

        return response(res, 201, {
            success: true,
            message: "Produk berhasil diterbitkan",
            product: normalizeProduct(populated)
        });
    } catch (error) {
        await Promise.allSettled(
            images.map(url => deleteImage(url))
        );

        throw error;
    }
}

async function updateProduct(req, res, userId) {
    const { fields, files } = await parseMultipart(req);

    const productId = getField(fields.productId);

    if (!validId(productId)) {
        return response(res, 400, {
            success: false,
            message: "ID produk tidak valid"
        });
    }

    const product = await Product.findById(productId);

    if (!product) {
        return response(res, 404, {
            success: false,
            message: "Produk tidak ditemukan"
        });
    }

    if (String(product.sellerId) !== String(userId)) {
        return response(res, 403, {
            success: false,
            message: "Kamu bukan pemilik produk ini"
        });
    }

    const update = {};

    const name = getField(fields.name, null);
    const description = getField(fields.description, null);
    const category = getField(fields.category, null);
    const priceRaw = getField(fields.price, null);
    const stockRaw = getField(fields.stock, null);
    const status = getField(fields.status, null);

    if (name !== null) {
        if (!name.trim() || name.trim().length > 100) {
            return response(res, 400, {
                success: false,
                message: "Nama produk tidak valid"
            });
        }

        update.name = name.trim();
    }

    if (description !== null) {
        if (description.length > 2000) {
            return response(res, 400, {
                success: false,
                message: "Deskripsi maksimal 2000 karakter"
            });
        }

        update.description = description.trim();
    }

    if (category !== null) {
        if (!category.trim() || category.trim().length > 40) {
            return response(res, 400, {
                success: false,
                message: "Kategori tidak valid"
            });
        }

        update.category = category.trim();
    }

    if (priceRaw !== null) {
        const price = Number(priceRaw);

        if (!Number.isFinite(price) || price < 0) {
            return response(res, 400, {
                success: false,
                message: "Harga tidak valid"
            });
        }

        update.price = price;
    }

    if (stockRaw !== null) {
        const stock = Number(stockRaw);

        if (!Number.isInteger(stock) || stock < 0) {
            return response(res, 400, {
                success: false,
                message: "Stock tidak valid"
            });
        }

        update.stock = stock;
    }

    if (status !== null) {
        if (!["active", "inactive"].includes(status)) {
            return response(res, 400, {
                success: false,
                message: "Status produk tidak valid"
            });
        }

        update.status = status;
    }

    const imageFiles = getFiles(files);
    let newImages = [];

    if (imageFiles.length) {
        newImages = await uploadProductImages(
            imageFiles,
            userId,
            productId
        );

        update.images = newImages;
    }

    const oldImages = product.images || [];

    try {
        await Product.findByIdAndUpdate(
            productId,
            {
                $set: update
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (newImages.length && oldImages.length) {
            await Promise.allSettled(
                oldImages.map(url => deleteImage(url))
            );
        }

        const updated = await Product.findById(productId)
            .populate({
                path: "sellerId",
                model: User,
                select: "name email whatsapp avatarUrl coverUrl emailVerified phoneVerified"
            })
            .lean();

        return response(res, 200, {
            success: true,
            message: "Produk berhasil diperbarui",
            product: normalizeProduct(updated)
        });
    } catch (error) {
        await Promise.allSettled(
            newImages.map(url => deleteImage(url))
        );

        throw error;
    }
}

async function deleteProduct(req, res, userId) {
    const productId =
        getField(req.query.id) ||
        getField(req.body?.productId);

    if (!validId(productId)) {
        return response(res, 400, {
            success: false,
            message: "ID produk tidak valid"
        });
    }

    const product = await Product.findById(productId);

    if (!product) {
        return response(res, 404, {
            success: false,
            message: "Produk tidak ditemukan"
        });
    }

    if (String(product.sellerId) !== String(userId)) {
        return response(res, 403, {
            success: false,
            message: "Kamu bukan pemilik produk ini"
        });
    }

    await Product.findByIdAndDelete(productId);

    await Cart.updateMany(
        {
            "items.productId": productId
        },
        {
            $pull: {
                items: {
                    productId
                }
            }
        }
    );

    await Promise.allSettled(
        (product.images || []).map(url => deleteImage(url))
    );

    return response(res, 200, {
        success: true,
        message: "Produk berhasil dihapus"
    });
}

async function getCart(req, res, userId) {
    let cart = await Cart.findOne({
        userId
    })
        .populate({
            path: "items.productId",
            populate: {
                path: "sellerId",
                model: User,
                select: "name email whatsapp avatarUrl coverUrl emailVerified phoneVerified"
            }
        })
        .lean();

    if (!cart) {
        return response(res, 200, {
            success: true,
            cart: {
                _id: null,
                userId,
                items: [],
                total: 0,
                count: 0
            }
        });
    }

    const items = (cart.items || [])
        .filter(item => item.productId)
        .map(item => {
            const product = normalizeProduct(item.productId);

            return {
                productId: product._id,
                quantity: item.quantity,
                product
            };
        });

    const total = items.reduce(
        (sum, item) =>
            sum + Number(item.product.price || 0) * item.quantity,
        0
    );

    const count = items.reduce(
        (sum, item) => sum + item.quantity,
        0
    );

    return response(res, 200, {
        success: true,
        cart: {
            _id: cart._id,
            userId: cart.userId,
            items,
            total,
            count
        }
    });
}

async function addCart(req, res, userId) {
    const body = await parseJsonBody(req);

    const productId = body.productId;
    const quantity = Number(body.quantity ?? 1);

    if (!validId(productId)) {
        return response(res, 400, {
            success: false,
            message: "Produk tidak valid"
        });
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
        return response(res, 400, {
            success: false,
            message: "Quantity tidak valid"
        });
    }

    const product = await Product.findOne({
        _id: productId,
        status: "active"
    });

    if (!product) {
        return response(res, 404, {
            success: false,
            message: "Produk tidak ditemukan"
        });
    }

    if (String(product.sellerId) === String(userId)) {
        return response(res, 400, {
            success: false,
            message: "Kamu tidak bisa membeli produk sendiri"
        });
    }

    if (product.stock < quantity) {
        return response(res, 400, {
            success: false,
            message: "Stock tidak mencukupi"
        });
    }

    let cart = await Cart.findOne({
        userId
    });

    if (!cart) {
        cart = new Cart({
            userId,
            items: []
        });
    }

    const existing = cart.items.find(
        item => String(item.productId) === String(productId)
    );

    const nextQuantity =
        existing
            ? existing.quantity + quantity
            : quantity;

    if (nextQuantity > product.stock) {
        return response(res, 400, {
            success: false,
            message: "Jumlah melebihi stock"
        });
    }

    if (existing) {
        existing.quantity = nextQuantity;
    } else {
        cart.items.push({
            productId,
            quantity
        });
    }

    await cart.save();

    return response(res, 200, {
        success: true,
        message: "Produk masuk keranjang"
    });
}

async function updateCart(req, res, userId) {
    const body = await parseJsonBody(req);

    const productId = body.productId;
    const quantity = Number(body.quantity);

    if (!validId(productId)) {
        return response(res, 400, {
            success: false,
            message: "Produk tidak valid"
        });
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
        return response(res, 400, {
            success: false,
            message: "Quantity minimal 1"
        });
    }

    const product = await Product.findOne({
        _id: productId,
        status: "active"
    });

    if (!product) {
        return response(res, 404, {
            success: false,
            message: "Produk tidak ditemukan"
        });
    }

    if (quantity > product.stock) {
        return response(res, 400, {
            success: false,
            message: "Quantity melebihi stock"
        });
    }

    const cart = await Cart.findOne({
        userId
    });

    if (!cart) {
        return response(res, 404, {
            success: false,
            message: "Keranjang tidak ditemukan"
        });
    }

    const item = cart.items.find(
        value => String(value.productId) === String(productId)
    );

    if (!item) {
        return response(res, 404, {
            success: false,
            message: "Produk tidak ada di keranjang"
        });
    }

    item.quantity = quantity;

    await cart.save();

    return response(res, 200, {
        success: true,
        message: "Keranjang diperbarui"
    });
}

async function removeCart(req, res, userId) {
    const body = req.method === "POST"
        ? await parseJsonBody(req)
        : {};

    const productId =
        body.productId ||
        getField(req.query.productId);

    if (!validId(productId)) {
        return response(res, 400, {
            success: false,
            message: "Produk tidak valid"
        });
    }

    const cart = await Cart.findOne({
        userId
    });

    if (!cart) {
        return response(res, 404, {
            success: false,
            message: "Keranjang tidak ditemukan"
        });
    }

    cart.items = cart.items.filter(
        item => String(item.productId) !== String(productId)
    );

    await cart.save();

    return response(res, 200, {
        success: true,
        message: "Produk dihapus dari keranjang"
    });
}

async function checkout(req, res, userId) {
    const cart = await Cart.findOne({
        userId
    }).lean();

    if (!cart || !cart.items?.length) {
        return response(res, 400, {
            success: false,
            message: "Keranjang masih kosong"
        });
    }

    const productIds = cart.items.map(item => item.productId);

    const products = await Product.find({
        _id: {
            $in: productIds
        },
        status: "active"
    }).lean();

    const productMap = new Map(
        products.map(product => [
            product._id.toString(),
            product
        ])
    );

    const orderItems = [];

    for (const cartItem of cart.items) {
        const product = productMap.get(
            cartItem.productId.toString()
        );

        if (!product) {
            return response(res, 400, {
                success: false,
                message: "Ada produk di keranjang yang sudah tidak tersedia"
            });
        }

        if (String(product.sellerId) === String(userId)) {
            return response(res, 400, {
                success: false,
                message: "Kamu tidak bisa membeli produk sendiri"
            });
        }

        if (product.stock < cartItem.quantity) {
            return response(res, 400, {
                success: false,
                message: `Stock produk "${product.name}" tidak mencukupi`
            });
        }

        orderItems.push({
            productId: product._id,
            sellerId: product.sellerId,
            name: product.name,
            image: product.images?.[0] || "",
            price: product.price,
            quantity: cartItem.quantity,
            subtotal: product.price * cartItem.quantity
        });
    }

    const decremented = [];

    try {
        for (const item of orderItems) {
            const updated = await Product.findOneAndUpdate(
                {
                    _id: item.productId,
                    status: "active",
                    stock: {
                        $gte: item.quantity
                    }
                },
                {
                    $inc: {
                        stock: -item.quantity
                    }
                },
                {
                    new: true
                }
            );

            if (!updated) {
                throw new Error(
                    `Stock produk "${item.name}" berubah`
                );
            }

            decremented.push({
                productId: item.productId,
                quantity: item.quantity
            });
        }

        const total = orderItems.reduce(
            (sum, item) => sum + item.subtotal,
            0
        );

        const order = await Order.create({
            buyerId: userId,
            items: orderItems,
            total,
            status: "pending"
        });

        await Cart.updateOne(
            {
                userId
            },
            {
                $set: {
                    items: []
                }
            }
        );

        return response(res, 201, {
            success: true,
            message: "Checkout berhasil",
            order
        });
    } catch (error) {
        await Promise.allSettled(
            decremented.map(item =>
                Product.updateOne(
                    {
                        _id: item.productId
                    },
                    {
                        $inc: {
                            stock: item.quantity
                        }
                    }
                )
            )
        );

        throw error;
    }
}

async function getOrders(req, res, userId) {
    const orders = await Order.find({
        buyerId: userId
    })
        .sort({
            createdAt: -1
        })
        .lean();

    return response(res, 200, {
        success: true,
        orders
    });
}

async function getSellerOrders(req, res, userId) {
    const orders = await Order.find({
        "items.sellerId": userId
    })
        .sort({
            createdAt: -1
        })
        .lean();

    const result = orders.map(order => ({
        ...order,
        items: order.items.filter(
            item => String(item.sellerId) === String(userId)
        )
    })).map(order => ({
        ...order,
        total: order.items.reduce(
            (sum, item) => sum + item.subtotal,
            0
        )
    }));

    return response(res, 200, {
        success: true,
        orders: result
    });
}

async function getComments(req, res) {
    const productId = getField(req.query.productId);

    if (!validId(productId)) {
        return response(res, 400, {
            success: false,
            message: "ID produk tidak valid"
        });
    }

    const comments = await ProductComment.find({
        productId
    })
        .populate({
            path: "userId",
            model: User,
            select: "name avatarUrl emailVerified phoneVerified"
        })
        .sort({
            createdAt: 1
        })
        .lean();

    const result = comments.map(comment => ({
        ...comment,
        user: normalizeUser(comment.userId),
        userId: comment.userId?._id || comment.userId
    }));

    return response(res, 200, {
        success: true,
        comments: result
    });
}

async function addComment(req, res, userId) {
    const body = await parseJsonBody(req);

    const productId = body.productId;
    const text = String(body.text || "").trim();
    const parentId = body.parentId || null;

    if (!validId(productId)) {
        return response(res, 400, {
            success: false,
            message: "ID produk tidak valid"
        });
    }

    if (!text) {
        return response(res, 400, {
            success: false,
            message: "Komentar tidak boleh kosong"
        });
    }

    if (text.length > 1000) {
        return response(res, 400, {
            success: false,
            message: "Komentar maksimal 1000 karakter"
        });
    }

    const product = await Product.findById(productId).select("_id");

    if (!product) {
        return response(res, 404, {
            success: false,
            message: "Produk tidak ditemukan"
        });
    }

    if (parentId) {
        if (!validId(parentId)) {
            return response(res, 400, {
                success: false,
                message: "Parent komentar tidak valid"
            });
        }

        const parent = await ProductComment.findOne({
            _id: parentId,
            productId
        });

        if (!parent) {
            return response(res, 404, {
                success: false,
                message: "Komentar induk tidak ditemukan"
            });
        }
    }

    const comment = await ProductComment.create({
        productId,
        userId,
        parentId,
        text
    });

    const populated = await ProductComment.findById(comment._id)
        .populate({
            path: "userId",
            model: User,
            select: "name avatarUrl emailVerified phoneVerified"
        })
        .lean();

    return response(res, 201, {
        success: true,
        message: "Komentar berhasil ditambahkan",
        comment: {
            ...populated,
            user: normalizeUser(populated.userId),
            userId: populated.userId?._id || populated.userId
        }
    });
}

async function deleteComment(req, res, userId) {
    const commentId =
        getField(req.query.id) ||
        getField(req.query.commentId);

    if (!validId(commentId)) {
        return response(res, 400, {
            success: false,
            message: "ID komentar tidak valid"
        });
    }

    const comment = await ProductComment.findById(commentId);

    if (!comment) {
        return response(res, 404, {
            success: false,
            message: "Komentar tidak ditemukan"
        });
    }

    const product = await Product.findById(comment.productId)
        .select("sellerId")
        .lean();

    const isCommentOwner =
        String(comment.userId) === String(userId);

    const isProductOwner =
        product &&
        String(product.sellerId) === String(userId);

    if (!isCommentOwner && !isProductOwner) {
        return response(res, 403, {
            success: false,
            message: "Kamu tidak memiliki akses menghapus komentar ini"
        });
    }

    await ProductComment.deleteMany({
        $or: [
            {
                _id: commentId
            },
            {
                parentId: commentId
            }
        ]
    });

    return response(res, 200, {
        success: true,
        message: "Komentar berhasil dihapus"
    });
}

async function route(req, res) {
    await connectDB();

    const method = req.method.toUpperCase();

    if (method === "OPTIONS") {
        return response(res, 200, {
            success: true
        });
    }

    if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
        return response(res, 405, {
            success: false,
            message: "Method tidak diizinkan"
        });
    }

    const actionRaw =
        getField(req.query.action) ||
        "";

    const action = actionRaw.toLowerCase();

    const user = await authenticate(req);
    const userId = user.userId;

    if (method === "GET") {
        switch (action) {
            case "products":
                return getProducts(req, res, userId);

            case "product":
                return getProduct(req, res, userId);

            case "myproducts":
            case "my-products":
                return getMyProducts(req, res, userId);

            case "cart":
                return getCart(req, res, userId);

            case "orders":
                return getOrders(req, res, userId);

            case "sellerorders":
            case "seller-orders":
                return getSellerOrders(req, res, userId);

            case "comments":
                return getComments(req, res);

            default:
                return response(res, 400, {
                    success: false,
                    message: "Action tidak dikenal"
                });
        }
    }

    const contentType =
        String(req.headers["content-type"] || "").toLowerCase();

    if (
        contentType.includes("multipart/form-data")
    ) {
        let actionMultipart = "";

        const parsed = await parseMultipart(req);

        actionMultipart = getField(
            parsed.fields.action
        ).toLowerCase();

        req.body = {
            ...parsed.fields
        };

        if (actionMultipart === "createproduct") {
            const originalParse = parseMultipart;

            void originalParse;

            const name = getField(parsed.fields.name).trim();
            const description = getField(parsed.fields.description).trim();
            const category = getField(parsed.fields.category).trim();
            const price = Number(getField(parsed.fields.price));
            const stock = Number(getField(parsed.fields.stock));
            const imageFiles = getFiles(parsed.files);

            if (!name) {
                return response(res, 400, {
                    success: false,
                    message: "Nama produk wajib diisi"
                });
            }

            if (!category) {
                return response(res, 400, {
                    success: false,
                    message: "Kategori wajib diisi"
                });
            }

            if (!Number.isFinite(price) || price < 0) {
                return response(res, 400, {
                    success: false,
                    message: "Harga tidak valid"
                });
            }

            if (!Number.isInteger(stock) || stock < 0) {
                return response(res, 400, {
                    success: false,
                    message: "Stock tidak valid"
                });
            }

            if (description.length > 2000) {
                return response(res, 400, {
                    success: false,
                    message: "Deskripsi terlalu panjang"
                });
            }

            if (imageFiles.length > MAX_PRODUCT_IMAGES) {
                return response(res, 400, {
                    success: false,
                    message: `Maksimal ${MAX_PRODUCT_IMAGES} gambar`
                });
            }

            const productId = new mongoose.Types.ObjectId();
            let images = [];

            try {
                images = await uploadProductImages(
                    imageFiles,
                    userId,
                    productId.toString()
                );

                const product = await Product.create({
                    _id: productId,
                    sellerId: userId,
                    name,
                    description,
                    price,
                    stock,
                    category,
                    images,
                    status: "active"
                });

                const populated = await Product.findById(product._id)
                    .populate({
                        path: "sellerId",
                        model: User,
                        select: "name email whatsapp avatarUrl coverUrl emailVerified phoneVerified"
                    })
                    .lean();

                return response(res, 201, {
                    success: true,
                    message: "Produk berhasil diterbitkan",
                    product: normalizeProduct(populated)
                });
            } catch (error) {
                await Promise.allSettled(
                    images.map(url => deleteImage(url))
                );

                throw error;
            }
        }

        if (actionMultipart === "updateproduct") {
            const productId = getField(
                parsed.fields.productId
            );

            if (!validId(productId)) {
                return response(res, 400, {
                    success: false,
                    message: "ID produk tidak valid"
                });
            }

            const product = await Product.findById(productId);

            if (!product) {
                return response(res, 404, {
                    success: false,
                    message: "Produk tidak ditemukan"
                });
            }

            if (String(product.sellerId) !== String(userId)) {
                return response(res, 403, {
                    success: false,
                    message: "Kamu bukan pemilik produk ini"
                });
            }

            const update = {};

            const name = getField(parsed.fields.name, null);
            const description = getField(parsed.fields.description, null);
            const category = getField(parsed.fields.category, null);
            const priceRaw = getField(parsed.fields.price, null);
            const stockRaw = getField(parsed.fields.stock, null);
            const status = getField(parsed.fields.status, null);

            if (name !== null) {
                update.name = name.trim();
            }

            if (description !== null) {
                update.description = description.trim();
            }

            if (category !== null) {
                update.category = category.trim();
            }

            if (priceRaw !== null) {
                const price = Number(priceRaw);

                if (!Number.isFinite(price) || price < 0) {
                    return response(res, 400, {
                        success: false,
                        message: "Harga tidak valid"
                    });
                }

                update.price = price;
            }

            if (stockRaw !== null) {
                const stock = Number(stockRaw);

                if (!Number.isInteger(stock) || stock < 0) {
                    return response(res, 400, {
                        success: false,
                        message: "Stock tidak valid"
                    });
                }

                update.stock = stock;
            }

            if (status !== null) {
                if (!["active", "inactive"].includes(status)) {
                    return response(res, 400, {
                        success: false,
                        message: "Status tidak valid"
                    });
                }

                update.status = status;
            }

            const imageFiles = getFiles(parsed.files);
            let newImages = [];

            if (imageFiles.length) {
                newImages = await uploadProductImages(
                    imageFiles,
                    userId,
                    productId
                );

                update.images = newImages;
            }

            const oldImages = product.images || [];

            try {
                await Product.findByIdAndUpdate(
                    productId,
                    {
                        $set: update
                    },
                    {
                        new: true,
                        runValidators: true
                    }
                );

                if (newImages.length) {
                    await Promise.allSettled(
                        oldImages.map(url => deleteImage(url))
                    );
                }

                const updated = await Product.findById(productId)
                    .populate({
                        path: "sellerId",
                        model: User,
                        select: "name email whatsapp avatarUrl coverUrl emailVerified phoneVerified"
                    })
                    .lean();

                return response(res, 200, {
                    success: true,
                    message: "Produk berhasil diperbarui",
                    product: normalizeProduct(updated)
                });
            } catch (error) {
                await Promise.allSettled(
                    newImages.map(url => deleteImage(url))
                );

                throw error;
            }
        }

        return response(res, 400, {
            success: false,
            message: "Action multipart tidak dikenal"
        });
    }

    let body = {};

    try {
        body = await parseJsonBody(req);
    } catch (error) {
        return response(res, 400, {
            success: false,
            message: error.message
        });
    }

    req.body = body;

    const bodyAction = String(
        body.action ||
        action ||
        ""
    ).toLowerCase();

    switch (bodyAction) {
        case "createproduct":
            return response(res, 400, {
                success: false,
                message: "createProduct harus menggunakan multipart/form-data"
            });

        case "updateproduct":
            return response(res, 400, {
                success: false,
                message: "updateProduct harus menggunakan multipart/form-data"
            });

        case "deleteproduct":
            return deleteProduct(req, res, userId);

        case "addcart":
            return addCart(req, res, userId);

        case "updatecart":
            return updateCart(req, res, userId);

        case "removecart":
            return removeCart(req, res, userId);

        case "checkout":
            return checkout(req, res, userId);

        case "addcomment":
            return addComment(req, res, userId);

        case "deletecomment":
            return deleteComment(req, res, userId);

        default:
            return response(res, 400, {
                success: false,
                message: "Action tidak dikenal"
            });
    }
}

export default async function handler(req, res) {
    try {
        await route(req, res);
    } catch (error) {
        console.error("Marketplace API error:", error);

        const message =
            error?.message ||
            "Terjadi kesalahan pada server";

        let status = 500;

        if (
            message === "Belum login" ||
            message === "Session tidak valid"
        ) {
            status = 401;
        }

        if (
            message.includes("File") ||
            message.includes("gambar") ||
            message.includes("JSON")
        ) {
            status = 400;
        }

        return response(res, status, {
            success: false,
            message
        });
    }
        }

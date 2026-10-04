import formidable from "formidable";
import fs from "fs/promises";

import { connectDB } from "./_lib/mongodb.js";
import {
    getAuthToken,
    verifyToken
} from "./_lib/auth.js";

import Product from "../models/Product.js";
import Cart from "../models/Cart.js";
import Order from "../models/Order.js";
import { uploadImage, deleteImage } from "../lib/upload.js";

export const config = {
    api: {
        bodyParser: false
    }
};

function parseNumber(value, fallback = 0) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return number;
}

function parsePositiveInt(value) {
    const number = Number(value);

    if (
        !Number.isInteger(number) ||
        number < 1
    ) {
        return null;
    }

    return number;
}

function normalizeProduct(product) {
    if (!product) {
        return null;
    }

    return {
        id: product._id.toString(),
        sellerId: product.sellerId?._id
            ? product.sellerId._id.toString()
            : product.sellerId?.toString(),
        seller: product.sellerId?.name
            ? {
                id: product.sellerId._id.toString(),
                name: product.sellerId.name,
                avatarUrl:
                    product.sellerId.avatarUrl || "",
                emailVerified:
                    Boolean(
                        product.sellerId.emailVerified
                    )
            }
            : null,
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock,
        category: product.category,
        images: product.images || [],
        status: product.status,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
    };
}

async function parseMultipart(req) {
    const form = formidable({
        multiples: true,
        maxFiles: 6,
        maxFileSize: 8 * 1024 * 1024,
        keepExtensions: true,
        allowEmptyFiles: false
    });

    const [fields, files] =
        await form.parse(req);

    const normalizedFields = {};

    for (const [key, value] of Object.entries(fields)) {
        normalizedFields[key] =
            Array.isArray(value)
                ? value[0]
                : value;
    }

    let uploadedFiles = [];

    for (const value of Object.values(files)) {
        const list = Array.isArray(value)
            ? value
            : [value];

        for (const file of list) {
            if (!file) {
                continue;
            }

            uploadedFiles.push(file);
        }
    }

    return {
        fields: normalizedFields,
        files: uploadedFiles
    };
}

async function getProductById(id) {
    if (!id) {
        return null;
    }

    return Product.findById(id)
        .populate(
            "sellerId",
            "_id name avatarUrl emailVerified"
        );
}

async function getProducts(req) {
    const search =
        String(
            req.query?.search || ""
        ).trim();

    const category =
        String(
            req.query?.category || ""
        ).trim();

    const sellerId =
        String(
            req.query?.sellerId || ""
        ).trim();

    const page =
        Math.max(
            1,
            parseNumber(
                req.query?.page,
                1
            )
        );

    const limit =
        Math.min(
            50,
            Math.max(
                1,
                parseNumber(
                    req.query?.limit,
                    20
                )
            )
        );

    const filter = {
        status: "active"
    };

    if (category) {
        filter.category = category;
    }

    if (sellerId) {
        filter.sellerId = sellerId;
    }

    if (search) {
        filter.$or = [
            {
                name: {
                    $regex: search,
                    $options: "i"
                }
            },
            {
                description: {
                    $regex: search,
                    $options: "i"
                }
            },
            {
                category: {
                    $regex: search,
                    $options: "i"
                }
            }
        ];
    }

    const skip =
        (page - 1) * limit;

    const [products, total] =
        await Promise.all([
            Product.find(filter)
                .populate(
                    "sellerId",
                    "_id name avatarUrl emailVerified"
                )
                .sort({
                    createdAt: -1
                })
                .skip(skip)
                .limit(limit)
                .lean(),

            Product.countDocuments(filter)
        ]);

    return {
        products:
            products.map(
                normalizeProduct
            ),
        pagination: {
            page,
            limit,
            total,
            pages:
                Math.ceil(
                    total / limit
                )
        }
    };
}

async function createProduct(
    userId,
    fields,
    files
) {
    const name =
        String(
            fields.name || ""
        ).trim();

    const description =
        String(
            fields.description || ""
        ).trim();

    const category =
        String(
            fields.category || ""
        ).trim();

    const price =
        parseNumber(
            fields.price,
            -1
        );

    const stock =
        parseNumber(
            fields.stock,
            -1
        );

    if (!name) {
        throw new Error(
            "Nama produk wajib diisi"
        );
    }

    if (
        name.length > 100
    ) {
        throw new Error(
            "Nama produk maksimal 100 karakter"
        );
    }

    if (
        description.length > 2000
    ) {
        throw new Error(
            "Deskripsi maksimal 2000 karakter"
        );
    }

    if (!category) {
        throw new Error(
            "Kategori wajib diisi"
        );
    }

    if (
        category.length > 40
    ) {
        throw new Error(
            "Kategori maksimal 40 karakter"
        );
    }

    if (
        price < 0
    ) {
        throw new Error(
            "Harga tidak valid"
        );
    }

    if (
        stock < 0 ||
        !Number.isInteger(stock)
    ) {
        throw new Error(
            "Stok tidak valid"
        );
    }

    if (
        files.length > 6
    ) {
        throw new Error(
            "Maksimal 6 gambar produk"
        );
    }

    const product =
        await Product.create({
            sellerId: userId,
            name,
            description,
            price,
            stock,
            category,
            images: []
        });

    const uploaded = [];

    try {
        for (const file of files) {
            const buffer =
                await fs.readFile(
                    file.filepath
                );

            const result =
                await uploadImage({
                    buffer,
                    contentType:
                        file.mimetype,
                    userId,
                    type:
                        "productImage",
                    productId:
                        product._id.toString()
                });

            uploaded.push(
                result.url
            );
        }

        product.images =
            uploaded;

        await product.save();
    } catch (error) {
        for (const url of uploaded) {
            await deleteImage(
                url
            ).catch(
                () => {}
            );
        }

        await Product.findByIdAndDelete(
            product._id
        );

        throw error;
    }

    const populated =
        await getProductById(
            product._id
        );

    return normalizeProduct(
        populated
    );
}

async function updateProduct(
    userId,
    fields,
    files
) {
    const productId =
        String(
            fields.productId || ""
        ).trim();

    if (!productId) {
        throw new Error(
            "Product ID wajib diisi"
        );
    }

    const product =
        await Product.findOne({
            _id: productId,
            sellerId: userId
        });

    if (!product) {
        throw new Error(
            "Produk tidak ditemukan"
        );
    }

    if (
        fields.name !== undefined
    ) {
        const name =
            String(
                fields.name
            ).trim();

        if (!name) {
            throw new Error(
                "Nama produk wajib diisi"
            );
        }

        product.name =
            name.slice(
                0,
                100
            );
    }

    if (
        fields.description !==
        undefined
    ) {
        product.description =
            String(
                fields.description
            )
                .trim()
                .slice(
                    0,
                    2000
                );
    }

    if (
        fields.category !==
        undefined
    ) {
        const category =
            String(
                fields.category
            ).trim();

        if (!category) {
            throw new Error(
                "Kategori wajib diisi"
            );
        }

        product.category =
            category.slice(
                0,
                40
            );
    }

    if (
        fields.price !==
        undefined
    ) {
        const price =
            parseNumber(
                fields.price,
                -1
            );

        if (price < 0) {
            throw new Error(
                "Harga tidak valid"
            );
        }

        product.price =
            price;
    }

    if (
        fields.stock !==
        undefined
    ) {
        const stock =
            parseNumber(
                fields.stock,
                -1
            );

        if (
            stock < 0 ||
            !Number.isInteger(stock)
        ) {
            throw new Error(
                "Stok tidak valid"
            );
        }

        product.stock =
            stock;
    }

    if (
        fields.status !==
        undefined
    ) {
        const status =
            String(
                fields.status
            ).trim();

        if (
            ![
                "active",
                "inactive"
            ].includes(status)
        ) {
            throw new Error(
                "Status produk tidak valid"
            );
        }

        product.status =
            status;
    }

    const replaceImages =
        String(
            fields.replaceImages ||
            ""
        ).toLowerCase() ===
        "true";

    const oldImages =
        replaceImages
            ? [...product.images]
            : [];

    if (
        replaceImages
    ) {
        product.images =
            [];
    }

    if (
        files.length
    ) {
        if (
            files.length >
            6
        ) {
            throw new Error(
                "Maksimal 6 gambar produk"
            );
        }

        const currentImages =
            product.images.length;

        if (
            currentImages +
            files.length >
            6
        ) {
            throw new Error(
                "Total gambar produk maksimal 6"
            );
        }

        for (const file of files) {
            const buffer =
                await fs.readFile(
                    file.filepath
                );

            const result =
                await uploadImage({
                    buffer,
                    contentType:
                        file.mimetype,
                    userId,
                    type:
                        "productImage",
                    productId
                        : product._id.toString()
                });

            product.images.push(
                result.url
            );
        }
    }

    await product.save();

    if (
        replaceImages
    ) {
        for (const url of oldImages) {
            await deleteImage(
                url
            ).catch(
                () => {}
            );
        }
    }

    const populated =
        await getProductById(
            product._id
        );

    return normalizeProduct(
        populated
    );
}

async function deleteProduct(
    userId,
    productId
) {
    const product =
        await Product.findOne({
            _id: productId,
            sellerId: userId
        });

    if (!product) {
        throw new Error(
            "Produk tidak ditemukan"
        );
    }

    await Product.findByIdAndDelete(
        product._id
    );

    for (const url of product.images) {
        await deleteImage(
            url
        ).catch(
            () => {}
        );
    }

    await Cart.updateMany(
        {},
        {
            $pull: {
                items: {
                    productId:
                        product._id
                }
            }
        }
    );

    return true;
}

async function getCart(
    userId
) {
    const cart =
        await Cart.findOne({
            userId
        })
            .populate({
                path: "items.productId",
                populate: {
                    path: "sellerId",
                    select:
                        "_id name avatarUrl emailVerified"
                }
            })
            .lean();

    if (!cart) {
        return {
            id: null,
            items: [],
            total: 0
        };
    }

    const items =
        cart.items
            .filter(
                item =>
                    item.productId
            )
            .map(
                item => {
                    const product =
                        item.productId;

                    const subtotal =
                        product.price *
                        item.quantity;

                    return {
                        productId:
                            product._id.toString(),
                        quantity:
                            item.quantity,
                        name:
                            product.name,
                        price:
                            product.price,
                        stock:
                            product.stock,
                        image:
                            product.images?.[0] ||
                            "",
                        category:
                            product.category,
                        seller:
                            product.sellerId
                                ? {
                                    id:
                                        product.sellerId._id.toString(),
                                    name:
                                        product.sellerId.name,
                                    avatarUrl:
                                        product.sellerId.avatarUrl ||
                                        ""
                                }
                                : null,
                        subtotal
                    };
                }
            );

    return {
        id:
            cart._id.toString(),
        items,
        total:
            items.reduce(
                (sum, item) =>
                    sum +
                    item.subtotal,
                0
            )
    };
}

async function addCartItem(
    userId,
    productId,
    quantity
) {
    const product =
        await Product.findOne({
            _id: productId,
            status: "active"
        });

    if (!product) {
        throw new Error(
            "Produk tidak ditemukan"
        );
    }

    if (
        product.sellerId.toString() ===
        userId.toString()
    ) {
        throw new Error(
            "Kamu tidak bisa membeli produk sendiri"
        );
    }

    if (
        product.stock < quantity
    ) {
        throw new Error(
            "Stok produk tidak mencukupi"
        );
    }

    let cart =
        await Cart.findOne({
            userId
        });

    if (!cart) {
        cart =
            await Cart.create({
                userId,
                items: [
                    {
                        productId,
                        quantity
                    }
                ]
            });
    } else {
        const item =
            cart.items.find(
                item =>
                    item.productId.toString() ===
                    productId.toString()
            );

        if (item) {
            const next =
                item.quantity +
                quantity;

            if (
                next >
                product.stock
            ) {
                throw new Error(
                    "Jumlah melebihi stok"
                );
            }

            item.quantity =
                next;
        } else {
            cart.items.push({
                productId,
                quantity
            });
        }

        await cart.save();
    }

    return getCart(
        userId
    );
}

async function removeCartItem(
    userId,
    productId,
    quantity
) {
    const cart =
        await Cart.findOne({
            userId
        });

    if (!cart) {
        return getCart(
            userId
        );
    }

    const index =
        cart.items.findIndex(
            item =>
                item.productId.toString() ===
                productId.toString()
        );

    if (
        index === -1
    ) {
        return getCart(
            userId
        );
    }

    if (
        quantity === null
    ) {
        cart.items.splice(
            index,
            1
        );
    } else {
        cart.items[index].quantity -=
            quantity;

        if (
            cart.items[index]
                .quantity <= 0
        ) {
            cart.items.splice(
                index,
                1
            );
        }
    }

    await cart.save();

    return getCart(
        userId
    );
}

async function checkout(
    userId
) {
    const cart =
        await Cart.findOne({
            userId
        }).populate(
            "items.productId"
        );

    if (
        !cart ||
        !cart.items.length
    ) {
        throw new Error(
            "Keranjang masih kosong"
        );
    }

    const orderItems = [];
    let total = 0;

    for (
        const cartItem of cart.items
    ) {
        const product =
            cartItem.productId;

        if (!product) {
            throw new Error(
                "Ada produk di keranjang yang sudah tidak tersedia"
            );
        }

        if (
            product.status !==
            "active"
        ) {
            throw new Error(
                `Produk ${product.name} tidak tersedia`
            );
        }

        if (
            product.stock <
            cartItem.quantity
        ) {
            throw new Error(
                `Stok ${product.name} tidak mencukupi`
            );
        }

        const subtotal =
            product.price *
            cartItem.quantity;

        orderItems.push({
            productId:
                product._id,
            sellerId:
                product.sellerId,
            name:
                product.name,
            image:
                product.images?.[0] ||
                "",
            price:
                product.price,
            quantity:
                cartItem.quantity,
            subtotal
        });

        total +=
            subtotal;
    }

    for (
        const item of orderItems
    ) {
        const updated =
            await Product.findOneAndUpdate(
                {
                    _id:
                        item.productId,
                    stock: {
                        $gte:
                            item.quantity
                    },
                    status:
                        "active"
                },
                {
                    $inc: {
                        stock:
                            -item.quantity
                    }
                },
                {
                    new: true
                }
            );

        if (!updated) {
            throw new Error(
                `Stok ${item.name} berubah, silakan coba lagi`
            );
        }
    }

    const order =
        await Order.create({
            buyerId:
                userId,
            items:
                orderItems,
            total,
            status:
                "pending"
        });

    await Cart.findOneAndUpdate(
        {
            userId
        },
        {
            $set: {
                items: []
            }
        }
    );

    return order;
}

async function getOrders(
    userId
) {
    const orders =
        await Order.find({
            buyerId: userId
        })
            .populate(
                "items.sellerId",
                "_id name avatarUrl"
            )
            .sort({
                createdAt: -1
            })
            .lean();

    return orders.map(
        order => ({
            id:
                order._id.toString(),
            total:
                order.total,
            status:
                order.status,
            items:
                order.items.map(
                    item => ({
                        productId:
                            item.productId.toString(),
                        sellerId:
                            item.sellerId?._id
                                ? item.sellerId._id.toString()
                                : item.sellerId.toString(),
                        seller:
                            item.sellerId?.name ||
                            "",
                        name:
                            item.name,
                        image:
                            item.image,
                        price:
                            item.price,
                        quantity:
                            item.quantity,
                        subtotal:
                            item.subtotal
                    })
                ),
            createdAt:
                order.createdAt
        })
    );
}

async function getSellerOrders(
    userId
) {
    const orders =
        await Order.find({
            "items.sellerId":
                userId
        })
            .populate(
                "buyerId",
                "_id name avatarUrl"
            )
            .sort({
                createdAt: -1
            })
            .lean();

    return orders.map(
        order => ({
            id:
                order._id.toString(),
            buyer:
                order.buyerId
                    ? {
                        id:
                            order.buyerId._id.toString(),
                        name:
                            order.buyerId.name,
                        avatarUrl:
                            order.buyerId.avatarUrl ||
                            ""
                    }
                    : null,
            status:
                order.status,
            items:
                order.items
                    .filter(
                        item =>
                            item.sellerId.toString() ===
                            userId.toString()
                    )
                    .map(
                        item => ({
                            productId:
                                item.productId.toString(),
                            name:
                                item.name,
                            image:
                                item.image,
                            price:
                                item.price,
                            quantity:
                                item.quantity,
                            subtotal:
                                item.subtotal
                        })
                    ),
            total:
                order.items
                    .filter(
                        item =>
                            item.sellerId.toString() ===
                            userId.toString()
                    )
                    .reduce(
                        (
                            sum,
                            item
                        ) =>
                            sum +
                            item.subtotal,
                        0
                    ),
            createdAt:
                order.createdAt
        })
    );
}

export default async function handler(
    req,
    res
) {
    if (
        req.method !== "GET" &&
        req.method !== "POST"
    ) {
        return res.status(405).json({
            success: false,
            message:
                "Method tidak diizinkan"
        });
    }

    try {
        const token =
            getAuthToken(req);

        if (!token) {
            return res.status(401).json({
                success: false,
                message:
                    "Belum login"
            });
        }

        const payload =
            await verifyToken(
                token
            );

        if (
            !payload?.userId
        ) {
            return res.status(401).json({
                success: false,
                message:
                    "Session tidak valid"
            });
        }

        await connectDB();

        const userId =
            payload.userId;

        if (
            req.method === "POST" &&
            String(
                req.headers[
                    "content-type"
                ] || ""
            ).includes(
                "multipart/form-data"
            )
        ) {
            const {
                fields,
                files
            } =
                await parseMultipart(
                    req
                );

            const action =
                String(
                    fields.action ||
                    ""
                )
                    .trim()
                    .toLowerCase();

            if (
                action ===
                "createproduct"
            ) {
                const product =
                    await createProduct(
                        userId,
                        fields,
                        files
                    );

                return res.status(201).json({
                    success: true,
                    product
                });
            }

            if (
                action ===
                "updateproduct"
            ) {
                const product =
                    await updateProduct(
                        userId,
                        fields,
                        files
                    );

                return res.status(200).json({
                    success: true,
                    product
                });
            }

            return res.status(400).json({
                success: false,
                message:
                    "Action multipart tidak dikenali"
            });
        }

        let body = {};

        if (
            req.method ===
            "POST"
        ) {
            body =
                typeof req.body ===
                "object" &&
                req.body
                    ? req.body
                    : {};
        }

        const action =
            String(
                req.method === "GET"
                    ? req.query?.action ||
                        ""
                    : body.action ||
                        ""
            )
                .trim()
                .toLowerCase();

        if (
            action ===
            "products"
        ) {
            const result =
                await getProducts(
                    req
                );

            return res.status(200).json({
                success: true,
                ...result
            });
        }

        if (
            action ===
            "product"
        ) {
            const product =
                await getProductById(
                    req.query?.id ||
                        body.id
                );

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Produk tidak ditemukan"
                });
            }

            return res.status(200).json({
                success: true,
                product:
                    normalizeProduct(
                        product
                    )
            });
        }

        if (
            action ===
            "myproducts"
        ) {
            const products =
                await Product.find({
                    sellerId:
                        userId
                })
                    .sort({
                        createdAt:
                            -1
                    })
                    .lean();

            return res.status(200).json({
                success: true,
                products:
                    products.map(
                        normalizeProduct
                    )
            });
        }

        if (
            action ===
            "deleteproduct"
        ) {
            const productId =
                body.productId;

            if (!productId) {
                throw new Error(
                    "Product ID wajib diisi"
                );
            }

            await deleteProduct(
                userId,
                productId
            );

            return res.status(200).json({
                success: true
            });
        }

        if (
            action ===
            "cart"
        ) {
            const cart =
                await getCart(
                    userId
                );

            return res.status(200).json({
                success: true,
                cart
            });
        }

        if (
            action ===
            "addcart"
        ) {
            const productId =
                body.productId;

            const quantity =
                parsePositiveInt(
                    body.quantity
                );

            if (
                !productId ||
                !quantity
            ) {
                throw new Error(
                    "Produk dan jumlah wajib diisi"
                );
            }

            const cart =
                await addCartItem(
                    userId,
                    productId,
                    quantity
                );

            return res.status(200).json({
                success: true,
                cart
            });
        }

        if (
            action ===
            "removecart"
        ) {
            const productId =
                body.productId;

            const quantity =
                body.quantity ===
                undefined
                    ? null
                    : parsePositiveInt(
                        body.quantity
                    );

            if (!productId) {
                throw new Error(
                    "Product ID wajib diisi"
                );
            }

            const cart =
                await removeCartItem(
                    userId,
                    productId,
                    quantity
                );

            return res.status(200).json({
                success: true,
                cart
            });
        }

        if (
            action ===
            "checkout"
        ) {
            const order =
                await checkout(
                    userId
                );

            return res.status(201).json({
                success: true,
                order: {
                    id:
                        order._id.toString(),
                    total:
                        order.total,
                    status:
                        order.status,
                    items:
                        order.items,
                    createdAt:
                        order.createdAt
                }
            });
        }

        if (
            action ===
            "orders"
        ) {
            const orders =
                await getOrders(
                    userId
                );

            return res.status(200).json({
                success: true,
                orders
            });
        }

        if (
            action ===
            "sellerorders"
        ) {
            const orders =
                await getSellerOrders(
                    userId
                );

            return res.status(200).json({
                success: true,
                orders
            });
        }

        return res.status(400).json({
            success: false,
            message:
                "Action tidak dikenali"
        });
    } catch (error) {
        console.error(
            "MARKETPLACE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error?.message ||
                "Terjadi kesalahan pada marketplace"
        });
    }
}

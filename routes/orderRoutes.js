const express = require("express");
const router = express.Router();
const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const User = require("../models/userModel"); // Adjust the path as necessary based on your project structure
const mongoose = require("mongoose");
const authMiddleware = require('../middleware/authMiddleware');
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});


// ✅ Create Order API Route
router.post("/create-order", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Extract necessary data from request
    const { cartItems, shippingAddress, paymentMethod, userInfo, userId, totalPrice, discountAmount, shippingCharges, appliedCoupons } = req.body;

    // Validation
    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty." });
    }
    if (!shippingAddress || !paymentMethod) {
      return res.status(422).json({ message: "Shipping address and payment method are required." });
    }

    // Determine user type
    let userDetails = null;
    if (userId) {
      const user = await User.findById(userId).select("name email phone");
      if (user) {
        userDetails = { name: user.name, email: user.email, phone: user.phone };
      }
    }

    // Process order items & stock updates
    const orderItems = [];
    for (let item of cartItems) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ message: `Product with ID ${item.productId} not found.` });
      }
      if (product.stock < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Insufficient stock for ${product.name}.` });
      }

      product.stock -= item.quantity;
      await product.save({ session });

      orderItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        subtotal: product.price * item.quantity,
      });
    }

    // Calculate final total
    const finalTotal = totalPrice - discountAmount + shippingCharges;
     // Generate Order ID
    const userFriendlyOrderId = await generateOrderId();

// ✅ Razorpay Flow: Don't create DB order yet, just return Razorpay order details
if (paymentMethod === "razorpay") {
  const razorpayOrder = await razorpay.orders.create({
    amount: finalTotal * 100, // Razorpay expects paise
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
  });

  await session.commitTransaction();
  session.endSession();

  return res.status(200).json({
    success: true,
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    key: process.env.RAZORPAY_KEY_ID, // Send this for Razorpay checkout in frontend
    orderDetails: {
      orderId: userFriendlyOrderId,
      totalPrice,
      discountAmount,
      shippingCharges,
      finalTotal,
      appliedCoupons,
    }
  });
}

   
    // Construct order data
    const orderData = {
      userId,
      orderId: userFriendlyOrderId,
      orderItems,
      shippingAddress,
      paymentMethod,
      totalPrice, // Original total before discounts
      discountAmount, // Deducted discount
      shippingCharges, // Shipping costs adjusted after discount
      finalTotal, // Explicitly stored final amount
      appliedCoupons, // Store the coupon code(s)
      orderStatus: "Pending",
      paymentStatus: "Pending",
      orderDate: new Date(),
      isRegisteredUser: !!userId,
      trackingId: null,
      courierPartner: null,
    };

    // Store user details if registered, otherwise save guest info
    if (userId) {
      orderData.userName = userDetails?.name;
      orderData.userEmail = userDetails?.email;
      orderData.userPhone = userDetails?.phone;
    } else if (userInfo) {
      orderData.guestName = userInfo.name;
      orderData.guestEmail = userInfo.email;
      orderData.guestPhone = userInfo.phone;
    }

    // Save the order
    const order = new Order(orderData);
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    console.log(`Order ${userFriendlyOrderId} created${appliedCoupons.length ? ` using coupon ${appliedCoupons.join(", ")}` : ""}.`);
  

    // ✅ Auto-cancel order if payment is not completed after 30 minutes (1800000 ms)
    setTimeout(async () => {
        try {
            const pendingOrder = await Order.findById(order._id);
            if (pendingOrder && pendingOrder.paymentStatus === "Pending") {
                await restoreStock(pendingOrder.orderItems);
                await Order.updateOne(
                    { _id: order._id },
                    { orderStatus: "Canceled", paymentStatus: "Failed" }
                );
                console.log(`⏰ Order ${order._id} auto-canceled due to non-payment.`);
            }
        } catch (err) {
            console.error(`❗ Error while auto-canceling order:`, err);
        }
    }, 1800000);

    return res.status(201).json({
        message: "Order created successfully",
        orderId: userFriendlyOrderId,
    });

  } catch (error) {
    console.error(error);

    if (session.inTransaction()) {
        await session.abortTransaction();
    }
    session.endSession();

    return res.status(500).json({ message: "Error creating order", error });
  }
});

// ✅ Restore Stock Function
async function restoreStock(orderItems) {
    for (let item of orderItems) {
        const product = await Product.findById(item.productId);
        if (product) {
            product.stock += item.quantity;
            await product.save();
        }
    }
}

// ✅ Generate Order ID Function
async function generateOrderId() {
    try {
        const lastOrder = await Order.findOne({}, {}, { sort: { createdAt: -1 } });
        let lastOrderNumber = lastOrder ? parseInt(lastOrder.orderId.split("-").pop()) : 0;
        lastOrderNumber += 1;

        const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");
        return `ORD-${timestamp}-${lastOrderNumber}`;
    } catch (error) {
        console.error("Error generating order ID:", error);
        return `ORD-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-1`;
    }
}
router.post('/track-order', async (req, res) => {
    try {
        const { email, phone, orderId } = req.body;

        if (!email || !phone) {
            return res.status(400).json({ message: 'Email and phone are required.' });
        }

        const query = {
            $or: [
                { guestEmail: email, guestPhone: phone },
                { userEmail: email, userPhone: phone }
            ]
        };

        if (orderId) {
            query.$or.push({ orderId });
            query.$or.push({ _id: orderId });
        }

        const orders = await Order.find(query).lean();

        if (!orders || orders.length === 0) {
            return res.status(404).json({ message: 'No orders found for the given details.' });
        }

        const formattedOrders = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            trackingId: order.trackingId || "N/A",
            courierPartner: order.courierPartner || "N/A",
            name: order.isRegisteredUser ? order.userName : order.guestName,
            email: order.isRegisteredUser ? order.userEmail : order.guestEmail,
            phone: order.isRegisteredUser ? order.userPhone : order.guestPhone,
            orderStatus: order.orderStatus,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            totalPrice: order.totalPrice,
            finalTotal: order.finalTotal,                      // ✅ Added
            shippingCharges: order.shippingCharges,            // ✅ Added
            appliedCoupons: order.appliedCoupons || [],        // ✅ Added
            orderDate: order.createdAt,
            shippingAddress: order.shippingAddress,
            orderItems: order.orderItems.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                subtotal: item.subtotal
            }))
        }));

        res.status(200).json({ orders: formattedOrders });
    } catch (error) {
        console.error('Track Order Error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

router.get('/my-orders', authMiddleware, async (req, res) => {
    try {
        console.log("Entering /my-orders route...");

        const userId = req.user.userId;
        console.log("User ID from middleware:", userId);

        const orders = await Order.find({ userId })
            .lean()
            .populate("orderItems.productId", "image")
            .sort({ createdAt: -1 });

        if (!orders || orders.length === 0) {
            console.log("No orders found for this user.");
            return res.status(404).json({ message: 'No orders found for this user.' });
        }

        const formattedOrders = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            trackingId: order.trackingId || "N/A",
            courierPartner: order.courierPartner || "N/A",
            name: order.userName,
            email: order.userEmail,
            phone: order.userPhone,
            orderStatus: order.orderStatus,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            totalPrice: order.totalPrice,
            finalTotal: order.finalTotal,                      // ✅ Added
            shippingCharges: order.shippingCharges,            // ✅ Added
            appliedCoupons: order.appliedCoupons || [],        // ✅ Added
            orderDate: order.createdAt,
            shippingAddress: order.shippingAddress,
            orderItems: order.orderItems.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                subtotal: item.subtotal,
                image: item.productId?.image || 'fallback.jpg'
            }))
        }));

        console.log("Formatted Orders:", formattedOrders);

        res.status(200).json({ orders: formattedOrders });
    } catch (error) {
        console.error("My Orders Error:", error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// Fetch Product Details Route
router.get('/products/:productId', async (req, res) => {
    try {
        const { productId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ message: 'Invalid product ID.' });
        }

        const product = await Product.findById(productId).lean();
        if (!product) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        res.status(200).json({
            name: product.name,
            price: product.price,
            image: product.image,
            description: product.description || "No description available."
        });
    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});
router.post("/confirm-payment", async (req, res) => {
  const {
    cartItems,
    shippingAddress,
    paymentMethod,
    userInfo,
    userId,
    totalPrice,
    discountAmount,
    shippingCharges,
    finalTotal,
    appliedCoupons,
    razorpayPaymentId,
    razorpayOrderId,
    razorpaySignature,
  } = req.body;

  // 🔐 Step 1: Verify Signature
  const body = razorpayOrderId + "|" + razorpayPaymentId;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature !== razorpaySignature) {
    return res.status(400).json({ message: "Invalid payment signature." });
  }

  try {
    // Step 2: Save Order
    const userDetails = userId
      ? await User.findById(userId).select("name email phone")
      : null;

    const orderItems = [];
    for (let item of cartItems) {
      const product = await Product.findById(item.productId);
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({ message: `Stock error for ${item.name}` });
      }
      product.stock -= item.quantity;
      await product.save();

      orderItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        subtotal: product.price * item.quantity,
      });
    }
const finalTotal = totalPrice - discountAmount + shippingCharges;

    const userFriendlyOrderId = await generateOrderId();

    const orderData = {
      userId,
      orderId: userFriendlyOrderId,
      orderItems,
      shippingAddress,
      paymentMethod,
      totalPrice,
      discountAmount,
      shippingCharges,
      finalTotal,
      appliedCoupons,
      paymentStatus: "Paid",
      orderStatus: "Processing",
      transactionId: razorpayPaymentId,
      orderDate: new Date(),
      isRegisteredUser: !!userId,
      trackingId: null,
      courierPartner: null,
    };

    if (userId && userDetails) {
      orderData.userName = userDetails.name;
      orderData.userEmail = userDetails.email;
      orderData.userPhone = userDetails.phone;
    } else if (userInfo) {
      orderData.guestName = userInfo.name;
      orderData.guestEmail = userInfo.email;
      orderData.guestPhone = userInfo.phone;
    }

    const order = new Order(orderData);
    await order.save();

    res.status(201).json({ message: "Order confirmed", orderId: order.orderId });
  } catch (err) {
    console.error("❌ Razorpay confirm error:", err);
    res.status(500).json({ message: "Failed to confirm order" });
  }
});


module.exports = router;

const express = require('express');
const router = express.Router();
const User = require('../../models/userModel');
const Product = require('../../models/productModel');
const Order = require('../../models/orderModel'); // adjust the path as needed
const authMiddleware = require("../../middleware/authMiddleware");

// 📌 Fetch Dashboard Stats (Without Orders & Sales)

router.get('/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalProducts = await Product.countDocuments();
        const totalOrders = await Order.countDocuments();

        res.json({
            totalUsers,
            totalProducts,
            totalOrders,
            totalSales: 0  // Keeping totalSales fixed as 0
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch dashboard stats", error: error.message });
    }
});

// 📌 Fetch Chart Data (Users & Products)
router.get('/chart-data', async (req, res) => {
    try {
        const timeRanges = ["Daily", "Weekly", "Monthly", "Yearly"];
        let chartData = {
            Users: {},
            Products: {}
        };

        for (let range of timeRanges) {
            chartData.Users[range] = await getUsersData(range);
            chartData.Products[range] = await getProductsData(range);
        }

        res.json(chartData);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch chart data", error: error.message });
    }
});

// 📌 Helper Functions to Aggregate Data
async function getUsersData(range) {
    const matchStage = getTimeMatchStage(range, "createdAt");
    const users = await User.aggregate([
        { $match: matchStage },
        { $group: { _id: null, count: { $sum: 1 } } }  // ✅ FIXED
    ]);
    return users.length ? users[0].count : 0;
}

async function getProductsData(range) {
    const matchStage = getTimeMatchStage(range, "createdAt");
    const products = await Product.aggregate([
        { $match: matchStage },
        { $group: { _id: null, count: { $sum: 1 } } }  // ✅ FIXED
    ]);
    return products.length ? products[0].count : 0;
}

// 📌 Function to Get Time Filtering Stage for MongoDB Queries
function getTimeMatchStage(range, field) {
    const now = new Date();
    let startDate;

    switch (range) {
        case "Daily":
            startDate = new Date(now.setDate(now.getDate() - 7)); // Last 7 days
            break;
        case "Weekly":
            startDate = new Date(now.setDate(now.getDate() - 30)); // Last 30 days
            break;
        case "Monthly":
            startDate = new Date(now.setFullYear(now.getFullYear() - 1)); // Last 12 months
            break;
        case "Yearly":
            startDate = new Date(now.setFullYear(now.getFullYear() - 5)); // Last 5 years
            break;
        default:
            startDate = new Date("2000-01-01"); // All data
    }

    return { [field]: { $gte: startDate } };
}
// Total Orders API Endpoint for Dashboard
router.get("/orders", async (req, res) => {
    try {
        const { timePeriod } = req.query;

        const now = new Date();
        let startDate, dateFormat, rangeLength;

        if (timePeriod === "daily") {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Today
            rangeLength = 1;
            dateFormat = { day: 'numeric', month: 'short' };
        } else if (timePeriod === "weekly") {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 6); // Last 7 days
            rangeLength = 7;
            dateFormat = { day: 'numeric', month: 'short' };
        } else if (timePeriod === "monthly") {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Start of month
            rangeLength = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); // Days in current month
            dateFormat = { day: 'numeric', month: 'short' };
        } else if (timePeriod === "yearly") {
            startDate = new Date(now.getFullYear(), 0, 1); // Start of year
            rangeLength = 12;
            dateFormat = { month: 'short' };
        } else {
            return res.status(400).json({ message: "Invalid time period" });
        }

        // Fetch all orders after startDate
        const orders = await Order.find({ createdAt: { $gte: startDate } });

        // Prepare date-wise mapping
        const statsMap = {};

        // Initialize map with all days/months and 0
        for (let i = 0; i < rangeLength; i++) {
            let label;
            if (timePeriod === "yearly") {
                const date = new Date(startDate.getFullYear(), i, 1);
                label = date.toLocaleDateString("en-US", dateFormat);
            } else {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + i);
                label = date.toLocaleDateString("en-US", dateFormat);
            }
            statsMap[label] = 0;
        }

        // Count orders per day/month
        orders.forEach(order => {
            const date = new Date(order.createdAt);
            let label;

            if (timePeriod === "yearly") {
                label = date.toLocaleDateString("en-US", dateFormat);
            } else {
                label = date.toLocaleDateString("en-US", dateFormat);
            }

            if (statsMap[label] !== undefined) {
                statsMap[label]++;
            }
        });

        const labels = Object.keys(statsMap);
        const data = Object.values(statsMap);

        res.json({ labels, data });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: "Error fetching orders" });
    }
});

router.get("/all-orders", authMiddleware, async (req, res) => {
    try {
      const orders = await Order.find()
        .sort({ createdAt: -1 })
        .populate("userId", "name email phone"); // Correct field
  
      const formattedOrders = orders.map(order => {
        const isRegistered = order.isRegisteredUser;
        return {
            _id: order._id, // MongoDB Object ID
            orderId: order.orderId, // User-friendly Order ID
            trackingId: order.trackingId || "N/A", // Include updated tracking ID
            courierPartner: order.courierPartner || "N/A", // Include updated courier partner
          isRegisteredUser: isRegistered,
          userName: isRegistered ? order.userId?.name : order.guestName,
          userEmail: isRegistered ? order.userId?.email : order.guestEmail,
          userPhone: isRegistered ? order.userId?.phone : order.guestPhone,
          orderItems: order.orderItems,
          shippingAddress: order.shippingAddress,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          transactionId: order.transactionId,
          orderStatus: order.orderStatus,
          totalPrice: order.totalPrice,
          orderDate: order.orderDate,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        };
      });
  
      res.json(formattedOrders);
    } catch (error) {
      console.error("Error fetching all orders:", error);
      res.status(500).json({ message: "Error fetching orders" });
    }
  });

  router.patch("/order/:id/status", authMiddleware, async (req, res) => {
    try {
        const { status, trackingId, courierPartner } = req.body; // Extract additional fields from the request body

        const updatedFields = { orderStatus: status }; // Start with orderStatus
        if (trackingId) updatedFields.trackingId = trackingId; // Add trackingId if provided
        if (courierPartner) updatedFields.courierPartner = courierPartner; // Add courierPartner if provided

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            updatedFields, // Update only the provided fields
            { new: true }
        ).populate("userId", "name email phone");

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        const isRegistered = order.isRegisteredUser;
        const updatedOrder = {
            _id: order._id, // MongoDB Object ID
            orderId: order.orderId, // User-friendly Order ID
            trackingId: order.trackingId || "N/A", // Include updated tracking ID
            courierPartner: order.courierPartner || "N/A", // Include updated courier partner
            isRegisteredUser: isRegistered,
            userName: isRegistered ? order.userId?.name : order.guestName,
            userEmail: isRegistered ? order.userId?.email : order.guestEmail,
            userPhone: isRegistered ? order.userId?.phone : order.guestPhone,
            orderItems: order.orderItems,
            shippingAddress: order.shippingAddress,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            transactionId: order.transactionId,
            orderStatus: order.orderStatus,
            totalPrice: order.totalPrice,
            orderDate: order.orderDate,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
        };

        res.json({ message: "Order updated successfully", order: updatedOrder });
    } catch (error) {
        console.error("Error updating order:", error);
        res.status(500).json({ message: "Error updating order" });
    }
});

  // Get single order by ID
router.get("/order/:id", authMiddleware, async (req, res) => {
    try {
      const order = await Order.findById(req.params.id).populate("userId", "name email phone");
  
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
  
      const isRegistered = order.isRegisteredUser;
      const detailedOrder = {
        _id: order._id, // MongoDB Object ID
            orderId: order.orderId, // User-friendly Order ID
            trackingId: order.trackingId || "N/A", // Include updated tracking ID
            courierPartner: order.courierPartner || "N/A", // Include updated courier partner
        isRegisteredUser: isRegistered,
        userName: isRegistered ? order.userId?.name : order.guestName,
        userEmail: isRegistered ? order.userId?.email : order.guestEmail,
        userPhone: isRegistered ? order.userId?.phone : order.guestPhone,
        orderItems: order.orderItems,
        shippingAddress: order.shippingAddress,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        transactionId: order.transactionId,
        orderStatus: order.orderStatus,
        totalPrice: order.totalPrice,
        orderDate: order.orderDate,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
  
      res.json(detailedOrder);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Server error" });
    }
  });
  
    
  

router.get('/users-growth', async (req, res) => {
    try {
        const { timePeriod } = req.query;

        const now = new Date();
        let startDate;
        let dateFormat;
        let totalUnits;
        let unitIncrement;

        switch (timePeriod) {
            case 'daily':
                startDate = new Date(now.setHours(0, 0, 0, 0));
                dateFormat = "%H:00"; // hourly
                totalUnits = 24;
                unitIncrement = (d) => d.setHours(d.getHours() + 1);
                break;
            case 'weekly':
                startDate = new Date();
                startDate.setDate(now.getDate() - 6); // last 7 days
                startDate.setHours(0, 0, 0, 0);
                dateFormat = "%Y-%m-%d";
                totalUnits = 7;
                unitIncrement = (d) => d.setDate(d.getDate() + 1);
                break;
            case 'monthly':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                dateFormat = "%Y-%m-%d";
                totalUnits = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                unitIncrement = (d) => d.setDate(d.getDate() + 1);
                break;
            case 'yearly':
                startDate = new Date(now.getFullYear(), 0, 1);
                dateFormat = "%Y-%m";
                totalUnits = 12;
                unitIncrement = (d) => d.setMonth(d.getMonth() + 1);
                break;
            default:
                return res.status(400).json({ message: "Invalid time period" });
        }

        const users = await User.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: dateFormat, date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        // Fill missing units with zero
        const labels = [];
        const counts = [];
        const datePointer = new Date(startDate);
        const userMap = new Map(users.map(u => [u._id, u.count]));

        for (let i = 0; i < totalUnits; i++) {
            const formatter = new Intl.DateTimeFormat('en-CA', {
                year: 'numeric',
                month: timePeriod === 'yearly' ? '2-digit' : 'numeric',
                day: timePeriod === 'daily' ? undefined : '2-digit',
                hour: timePeriod === 'daily' ? '2-digit' : undefined,
                hour12: false
            });

            const label = timePeriod === 'daily'
                ? `${String(datePointer.getHours()).padStart(2, '0')}:00`
                : timePeriod === 'yearly'
                ? `${datePointer.getFullYear()}-${String(datePointer.getMonth() + 1).padStart(2, '0')}`
                : formatter.format(datePointer);

            labels.push(label);
            counts.push(userMap.get(label) || 0);

            unitIncrement(datePointer);
        }

        res.json({ labels, data: counts });

    } catch (error) {
        console.error("Error in users-growth route:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

module.exports = router;

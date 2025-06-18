require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./database');
const multer = require('multer');
const app = express();
const path = require('path');

// ✅ Increase body size limits to fix 413 errors
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// ✅ Connect to MongoDB
connectDB();

// ✅ Enable CORS
app.use(cors());

// ✅ Routes
const categoryRoutes = require('./seller-backend/routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const sellerRoutes = require("./seller-backend/routes/sellerRoutes");
const authSeller = require("./middleware/authSeller");

app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/dashboard', require('./seller-backend/routes/dashboardRoutes'));
app.use('/api/categories', categoryRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/api/orders', orderRoutes);
app.use('store-copy/store/assets/images', express.static(path.join(__dirname, '../store/assets/images')));
app.use("/api/sellers", sellerRoutes);

// ✅ Health check
app.get('/', (req, res) => {
  res.send('🍏 Snowberry API');
});

// ✅ Debug registered routes
app._router.stack.forEach((r) => {
  if (r.route && r.route.path) {
    console.log(`✅ Registered route: ${r.route.path} [${Object.keys(r.route.methods)}]`);
  }
});

// ✅ Error Handling
app.use((req, res, next) => {
  res.status(404).json({ message: "API route not found!" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!", error: err.message });
});

// ✅ Start server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

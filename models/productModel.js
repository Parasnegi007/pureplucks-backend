const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true }, // Sale price
  mrp: { type: Number, required: true }, // MRP (Maximum Retail Price)
  sale: { type: Boolean, default: false }, // Flag to indicate if the product is on sale
  image: { type: String, required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  description: { type: String, required: false },
  featured: { type: Boolean, default: false },

  // ✅ Added manual out-of-stock toggle
  outOfStock: { type: Boolean, default: false }
});

const Product = mongoose.model("Product", productSchema);
module.exports = Product;

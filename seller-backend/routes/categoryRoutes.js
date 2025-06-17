const express = require("express");
const Category = require("../models/categoryModel");
const router = express.Router();
const mongoose = require("mongoose");

// Cloudinary Setup
const cloudinary = require("../../utils/cloudinary");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "fruits-ecommerce/categories",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    transformation: [{ width: 800, height: 800, crop: "limit" }],
  },
});

const upload = multer({ storage });

console.log("✅ categoryRoutes.js is running!");

// 🔹 POST - Add New Category
router.post("/", upload.single("image"), async (req, res) => {
  const { name, description, slug, featured } = req.body;
  const image = req.file ? req.file.path : "";

  if (!name || !description || !slug) {
    return res.status(400).json({ message: "Name, description, and slug are required." });
  }

  try {
    const newCategory = new Category({
      name,
      description,
      slug,
      featured,
      image,
    });

    const savedCategory = await newCategory.save();
    res.json({ message: "Category added successfully!", category: savedCategory });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ message: "Error adding category" });
  }
});

// 🔹 GET - All Categories
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Error fetching categories" });
  }
});

// 🔹 GET - Single Category by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(category);
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({ message: "Error fetching category" });
  }
});

// 🔹 PUT - Update Category
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const { name, description, slug, featured } = req.body;
    const image = req.file ? req.file.path : "";

    const updateData = { name, description, slug, featured };
    if (image) updateData.image = image;

    const updatedCategory = await Category.findByIdAndUpdate(id, updateData, { new: true });

    if (!updatedCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ message: "Category updated successfully!", category: updatedCategory });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ message: "Error updating category" });
  }
});

// 🔹 DELETE - Remove Category
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const deletedCategory = await Category.findByIdAndDelete(id);
    if (!deletedCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ message: "Category deleted successfully!" });
  } catch (error) {
    console.error("❌ Error deleting category:", error);
    res.status(500).json({ message: "Error deleting category" });
  }
});

module.exports = router;

const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized! Token missing." });
    }

    const token = authHeader.split(" ")[1]; // ✅ Extract Bearer token correctly

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach user data to request
        next(); // Proceed to the next middleware
    } catch (error) {
        res.status(401).json({ message: "Unauthorized! Invalid token." });
    }
};

module.exports = authMiddleware;

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const jwt = require('jsonwebtoken');

// Secured verification middleware for accessing restricted histories
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Get 'Bearer <token>'

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access Denied. Authentication token missing.' });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_session_token_key_1329');
        req.user = verified;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired authentication token.' });
    }
};

// User Authorization Routes
router.post('/register', userController.register);
router.post('/login', userController.login);

// User Profile Actions & History Logging Routes
router.get('/history', verifyToken, userController.getHistory);
router.post('/history/save', verifyToken, userController.saveMeeting);

module.exports = router;
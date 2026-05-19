const User = require('../models/user.model');
const Meeting = require('../models/meeting.model');
const jwt = require('jsonwebtoken');

// Create user account
exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Please fulfill all requested credentials.' });
        }

        const userExists = await User.findOne({ $or: [{ email }, { username }] });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'Username or Email is already registered.' });
        }

        const newUser = new User({ username, email, password });
        await newUser.save();

        return res.status(201).json({ success: true, message: 'Registration successful! You can sign in now.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error during sign up.', error: error.message });
    }
};

// Sign in user & supply token
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username, email: user.email },
            process.env.JWT_SECRET || 'super_secret_session_token_key_1329',
            { expiresIn: '24h' }
        );

        return res.status(200).json({
            success: true,
            message: 'Signed in successfully!',
            token,
            user: { id: user._id, username: user.username, email: user.email }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error during sign in.', error: error.message });
    }
};

// Log a finished meeting room session
exports.saveMeeting = async (req, res) => {
    try {
        const { meetingCode, startTime, endTime, participants } = req.body;
        const hostId = req.user.id; // Assigned from verifyToken middleware

        const newMeeting = new Meeting({
            meetingCode,
            host: hostId,
            startTime,
            endTime,
            participants
        });

        await newMeeting.save();
        return res.status(201).json({ success: true, message: 'Meeting log saved successfully.', meeting: newMeeting });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to record meeting logs.', error: error.message });
    }
};

// Retrieve history logs for a user
exports.getHistory = async (req, res) => {
    try {
        const hostId = req.user.id;
        const meetings = await Meeting.find({ host: hostId }).sort({ startTime: -1 });
        return res.status(200).json({ success: true, meetings });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to retrieve meeting logs.', error: error.message });
    }
};
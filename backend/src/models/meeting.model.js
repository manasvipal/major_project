const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
    meetingCode: {
        type: String,
        required: [true, 'Meeting code is required'],
        trim: true
    },
    host: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: {
        type: Date
    },
    participants: [{
        username: {
            type: String,
            required: true
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }]
});

module.exports = mongoose.model('Meeting', meetingSchema);
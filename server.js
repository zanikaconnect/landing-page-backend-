require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 5000;

/* ================================
   SECURITY MIDDLEWARE
================================ */

app.use(helmet());

// ✅ Allow ALL Vercel deployments + localhost
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        if (
            origin.includes('vercel.app') ||
            origin.includes('localhost')
        ) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

/* ================================
   RATE LIMITING
================================ */

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: { error: 'Too many requests, please try again later.' }
});

/* ================================
   SUPABASE SETUP
================================ */

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/* ================================
   ROUTES
================================ */

/**
 * @route   POST /send-email
 * @desc    Store subscriber email
 * @access  Public
 */
app.post(
    '/send-email',
    limiter,
    [
        body('email')
            .isEmail()
            .withMessage('Please provide a valid email address')
            .normalizeEmail()
    ],
    async (req, res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email } = req.body;

        try {
            const { error } = await supabase
                .from('subscribers')
                .insert([{ email }]);

            if (error) {
                if (error.code === '23505') {
                    return res.status(409).json({
                        error: 'This email is already subscribed.'
                    });
                }
                throw error;
            }

            return res.status(201).json({
                message: 'Successfully subscribed!',
                email
            });

        } catch (err) {
            console.error('Subscription Error:', err.message);
            return res.status(500).json({
                error: 'Internal server error. Please try again later.'
            });
        }
    }
);

/**
 * @route   GET /health
 * @desc    Health check + DB connectivity
 */
app.get('/health', async (req, res) => {
    try {
        const { error } = await supabase
            .from('subscribers')
            .select('id')
            .limit(1);

        if (error) throw error;

        res.status(200).json({
            status: 'OK',
            database: 'Connected'
        });

    } catch (err) {
        console.error('Health Check Failed:', err.message);
        res.status(503).json({
            status: 'Error',
            database: 'Disconnected'
        });
    }
});

/* ================================
   GLOBAL ERROR HANDLER
================================ */

app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
});

/* ================================
   START SERVER
================================ */

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
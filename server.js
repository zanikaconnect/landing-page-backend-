require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet());
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000'
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));
app.use(express.json());

// Rate Limiting: 5 requests per 15 minutes per IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many requests, please try again later.' }
});

// Initialize Supabase Client (Server-side only with Service Role Key)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * @route   POST /subscribe
 * @desc    Collect and store user emails
 * @access  Public
 */
app.post('/subscribe',
    limiter,
    [
        body('email')
            .isEmail().withMessage('Please provide a valid email address')
            .normalizeEmail()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email } = req.body;

        try {
            const { data, error } = await supabase
                .from('subscribers')
                .insert([{ email }]);

            if (error) {
                // Handle Duplicate Email
                if (error.code === '23505') {
                    return res.status(409).json({ error: 'This email is already subscribed.' });
                }
                throw error;
            }

            return res.status(201).json({
                message: 'Successfully subscribed!',
                email: email
            });

        } catch (err) {
            console.error('Subscription Error:', err.message);
            return res.status(500).json({ error: 'Internal server error. Please try again later.' });
        }
    }
);

// Health Check - Checks Database Connectivity
app.get('/health', async (req, res) => {
    try {
        const { error } = await supabase.from('subscribers').select('id').limit(1);
        if (error) throw error;
        res.status(200).json({ status: 'OK', database: 'Connected' });
    } catch (err) {
        console.error('Health Check Failed:', err.message);
        res.status(503).json({ status: 'Error', database: 'Disconnected' });
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

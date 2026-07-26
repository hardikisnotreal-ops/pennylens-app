const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'spendwise_secret_change_me';
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || '';
const DB_FILE = path.join(__dirname, 'spendwise_data.json');

let stripe = null;
if (STRIPE_SECRET) {
    stripe = require('stripe')(STRIPE_SECRET);
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

const FREE_EXPENSE_LIMIT = 50;

// Rate limiters
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please wait 15 minutes.' }
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many API requests. Please slow down.' }
});

app.use(generalLimiter);

function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
    return { users: [], expenses: [] };
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const token = header.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

function userResponse(user) {
    return {
        id: user.id, email: user.email, name: user.name,
        currency: user.currency, budget: user.budget, theme: user.theme,
        premium: !!user.premium, premiumUntil: user.premiumUntil || null
    };
}

// Auth Routes
app.post('/api/auth/register', authLimiter, (req, res) => {
    try {
        const { email, name, password } = req.body;
        if (!email || !name || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const db = loadDB();
        if (db.users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hash = bcrypt.hashSync(password, 10);
        const user = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            email, name, password: hash,
            currency: 'USD', budget: 0, theme: 'system',
            premium: false, premiumUntil: null, stripeCustomerId: null
        };
        db.users.push(user);
        saveDB(db);

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: userResponse(user) });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', authLimiter, (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const db = loadDB();
        const user = db.users.find(u => u.email === email);
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Check if premium expired
        if (user.premium && user.premiumUntil && new Date(user.premiumUntil) < new Date()) {
            user.premium = false;
            user.premiumUntil = null;
            saveDB(db);
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: userResponse(user) });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    try {
        const db = loadDB();
        const user = db.users.find(u => u.id === req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.premium && user.premiumUntil && new Date(user.premiumUntil) < new Date()) {
            user.premium = false;
            user.premiumUntil = null;
            saveDB(db);
        }

        res.json({ user: userResponse(user) });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/auth/settings', authMiddleware, (req, res) => {
    try {
        const db = loadDB();
        const user = db.users.find(u => u.id === req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const { currency, budget, theme } = req.body;
        if (currency !== undefined) user.currency = currency;
        if (budget !== undefined) user.budget = budget;
        if (theme !== undefined) user.theme = theme;
        saveDB(db);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Expenses Routes
app.get('/api/expenses', authMiddleware, (req, res) => {
    try {
        const db = loadDB();
        const user = db.users.find(u => u.id === req.userId);
        let expenses = (db.expenses || []).filter(e => e.userId === req.userId);

        // Free users only see current month
        if (!user || !user.premium) {
            const now = new Date();
            const currentMonth = now.toISOString().slice(0, 7);
            expenses = expenses.filter(e => e.date && e.date.startsWith(currentMonth));
        }

        res.json({ expenses });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/expenses/sync', authMiddleware, (req, res) => {
    try {
        const { expenses } = req.body;
        if (!Array.isArray(expenses)) return res.status(400).json({ error: 'Invalid data' });

        const db = loadDB();
        const user = db.users.find(u => u.id === req.userId);

        // Free user limit
        if (!user || !user.premium) {
            if (expenses.length > FREE_EXPENSE_LIMIT) {
                return res.status(403).json({
                    error: `Free plan limited to ${FREE_EXPENSE_LIMIT} expenses. Upgrade to Premium for unlimited.`,
                    upgradeRequired: true
                });
            }
        }

        db.expenses = (db.expenses || []).filter(e => e.userId !== req.userId);
        for (const e of expenses) {
            db.expenses.push({ ...e, userId: req.userId });
        }
        saveDB(db);
        res.json({ ok: true, count: expenses.length });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Stripe Routes
app.post('/api/checkout', apiLimiter, authMiddleware, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ error: 'Payments not configured. Add STRIPE_SECRET_KEY.' });
        }
        if (!STRIPE_PRICE_ID) {
            return res.status(500).json({ error: 'Price not configured. Add STRIPE_PRICE_ID.' });
        }

        const db = loadDB();
        const user = db.users.find(u => u.id === req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            customer_email: user.email,
            line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
            success_url: `${req.headers.origin || 'http://localhost:3000'}?upgraded=true`,
            cancel_url: `${req.headers.origin || 'http://localhost:3000'}`,
            metadata: { userId: user.id }
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error('Checkout error:', err.message);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// Stripe Webhook (raw body needed)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
        return res.status(400).send('Webhook not configured');
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const db = loadDB();

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata.userId;
        const user = db.users.find(u => u.id === userId);
        if (user) {
            user.premium = true;
            user.stripeCustomerId = session.customer;
            // 30 days from now (monthly subscription)
            user.premiumUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            saveDB(db);
        }
    }

    if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        const user = db.users.find(u => u.stripeCustomerId === sub.customer);
        if (user) {
            user.premium = false;
            user.premiumUntil = null;
            saveDB(db);
        }
    }

    if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object;
        const user = db.users.find(u => u.stripeCustomerId === invoice.customer);
        if (user) {
            user.premium = true;
            user.premiumUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            saveDB(db);
        }
    }

    res.json({ received: true });
});

// Catch-all
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`PennyLens running at http://localhost:${PORT}`);
    if (!STRIPE_SECRET) console.log('Stripe not configured. Set STRIPE_SECRET_KEY to enable payments.');
});

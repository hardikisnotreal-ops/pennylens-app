const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'spendwise_secret_change_me';
const DB_FILE = path.join(__dirname, 'spendwise_data.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

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

app.post('/api/auth/register', (req, res) => {
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
            currency: 'USD', budget: 0, theme: 'system'
        };
        db.users.push(user);
        saveDB(db);

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
        res.json({
            token,
            user: { id: user.id, email, name, currency: 'USD', budget: 0, theme: 'system' }
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', (req, res) => {
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

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
        res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name, currency: user.currency, budget: user.budget, theme: user.theme }
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    try {
        const db = loadDB();
        const user = db.users.find(u => u.id === req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user: { id: user.id, email: user.email, name: user.name, currency: user.currency, budget: user.budget, theme: user.theme } });
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

app.get('/api/expenses', authMiddleware, (req, res) => {
    try {
        const db = loadDB();
        const expenses = (db.expenses || []).filter(e => e.userId === req.userId);
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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`SpendWise running at http://localhost:${PORT}`);
});

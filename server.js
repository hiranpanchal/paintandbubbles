require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Stripe webhook needs raw body — must be before json middleware
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(cors());
app.use(express.json());
// Serve uploaded images from the persistent volume directory
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'db');
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/admin',   require('./routes/admin'));
app.use('/api/events',  require('./routes/events'));
app.use('/api/bookings',  require('./routes/bookings'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/payments',  require('./routes/payments'));
app.use('/api/design',    require('./routes/design'));
app.use('/api/faqs',      require('./routes/faqs'));
app.use('/api/reviews',   require('./routes/reviews'));
app.use('/api/contact',   require('./routes/contact'));
app.use('/api/vouchers',  require('./routes/vouchers'));

// Serve frontend for all non-API routes
app.get('/admin',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/events',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'events.html')));
app.get('/events/:id',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'event-detail.html')));
app.get('/faq',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'faq.html')));
app.get('/about',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/reviews',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'reviews.html')));
app.get('/contact',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/private-events',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'private-events.html')));
app.get('/gallery',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'gallery.html')));
app.get('/gift-vouchers',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'gift-vouchers.html')));
app.get('*',                (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Paint & Bubbles running at http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
});

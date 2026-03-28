const express = require('express');
const app = express();
const userRoutes = require('./routes/users');
const { verifyToken } = require('./middleware/auth');

app.use(express.json());

// Public routes
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Protected routes — all user operations require a valid JWT
app.use('/api/users', verifyToken, userRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { authenticateToken, SECRET_KEY } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username dan password wajib diisi.' });
  }

  try {
    const user = await db.getAsync(`SELECT * FROM users WHERE username = ?`, [username]);
    if (!user) {
      return res.status(401).json({ message: 'Username atau password salah.' });
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Username atau password salah.' });
    }

    // Sign JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      SECRET_KEY,
      { expiresIn: '7d' }
    );

    // Return user info and token
    return res.json({
      message: 'Login berhasil.',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        npm: user.npm,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Error logging in:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getAsync(`SELECT id, username, role, name, npm, email, phone, created_at FROM users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    }
    return res.json({ user });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authenticateToken, async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: 'Nama dan email wajib diisi.' });
  }

  try {
    // Check if email is already taken by another user
    const emailCheck = await db.getAsync(`SELECT id FROM users WHERE email = ? AND id != ?`, [email, req.user.id]);
    if (emailCheck) {
      return res.status(400).json({ message: 'Email sudah digunakan oleh pengguna lain.' });
    }

    let query = `UPDATE users SET name = ?, email = ?, phone = ?`;
    let params = [name, email, phone];

    if (password && password.trim() !== '') {
      const passwordHash = bcrypt.hashSync(password, 10);
      query += `, password = ?`;
      params.push(passwordHash);
    }

    query += ` WHERE id = ?`;
    params.push(req.user.id);

    await db.runAsync(query, params);

    // Fetch updated user
    const updatedUser = await db.getAsync(`SELECT id, username, role, name, npm, email, phone FROM users WHERE id = ?`, [req.user.id]);

    return res.json({
      message: 'Profil berhasil diperbarui.',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password, name, npm, email, phone } = req.body;

  if (!username || !password || !name || !npm || !email) {
    return res.status(400).json({ message: 'Semua field wajib diisi (kecuali no. HP).' });
  }

  try {
    // Check if username already exists
    const userExist = await db.getAsync(`SELECT id FROM users WHERE username = ?`, [username]);
    if (userExist) {
      return res.status(400).json({ message: 'Username sudah digunakan.' });
    }

    // Check if npm already exists
    const npmExist = await db.getAsync(`SELECT id FROM users WHERE npm = ?`, [npm]);
    if (npmExist) {
      return res.status(400).json({ message: 'NPM sudah terdaftar.' });
    }

    // Check if email already exists
    const emailExist = await db.getAsync(`SELECT id FROM users WHERE email = ?`, [email]);
    if (emailExist) {
      return res.status(400).json({ message: 'Email sudah terdaftar.' });
    }

    // Hash password
    const passwordHash = bcrypt.hashSync(password, 10);

    // Insert user
    await db.runAsync(
      `INSERT INTO users (username, password, role, name, npm, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, passwordHash, 'mahasiswa', name, npm, email, phone || null]
    );

    return res.status(201).json({ message: 'Pendaftaran mahasiswa berhasil. Silakan login.' });
  } catch (error) {
    console.error('Error registering student:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

module.exports = router;


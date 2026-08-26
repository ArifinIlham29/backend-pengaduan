const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Apply admin role protection to all routes in this router
router.use(authenticateToken, authorizeRole('admin'));

// GET /api/students - List all student users
router.get('/', async (req, res) => {
  try {
    const students = await db.allAsync(
      `SELECT id, username, name, npm, email, phone, created_at FROM users WHERE role = 'mahasiswa' ORDER BY npm ASC`
    );
    return res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// POST /api/students - Create a new student user
router.post('/', async (req, res) => {
  const { username, password, name, npm, email, phone } = req.body;

  if (!username || !password || !name || !npm || !email) {
    return res.status(400).json({ message: 'Username, password, nama, NPM, dan email wajib diisi.' });
  }

  try {
    // Check if username already exists
    const userExist = await db.getAsync(`SELECT id FROM users WHERE username = ?`, [username]);
    if (userExist) {
      return res.status(400).json({ message: 'Username sudah digunakan.' });
    }

    // Check if NPM already exists
    const npmExist = await db.getAsync(`SELECT id FROM users WHERE npm = ?`, [npm]);
    if (npmExist) {
      return res.status(400).json({ message: 'NPM sudah digunakan oleh mahasiswa lain.' });
    }

    // Check if email already exists
    const emailExist = await db.getAsync(`SELECT id FROM users WHERE email = ?`, [email]);
    if (emailExist) {
      return res.status(400).json({ message: 'Email sudah digunakan oleh pengguna lain.' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const result = await db.runAsync(
      `INSERT INTO users (username, password, role, name, npm, email, phone) VALUES (?, ?, 'mahasiswa', ?, ?, ?, ?)`,
      [username, hashedPassword, name, npm, email, phone || null]
    );

    const newStudent = await db.getAsync(
      `SELECT id, username, name, npm, email, phone, created_at FROM users WHERE id = ?`,
      [result.lastID]
    );

    return res.status(201).json({
      message: 'Akun Mahasiswa berhasil dibuat.',
      student: newStudent
    });
  } catch (error) {
    console.error('Error creating student:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// PUT /api/students/:id - Update an existing student user
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, npm, email, phone, password } = req.body;

  if (!name || !npm || !email) {
    return res.status(400).json({ message: 'Nama, NPM, dan email wajib diisi.' });
  }

  try {
    const student = await db.getAsync(`SELECT id FROM users WHERE id = ? AND role = 'mahasiswa'`, [id]);
    if (!student) {
      return res.status(404).json({ message: 'Mahasiswa tidak ditemukan.' });
    }

    // Check unique NPM
    const npmCheck = await db.getAsync(`SELECT id FROM users WHERE npm = ? AND id != ?`, [npm, id]);
    if (npmCheck) {
      return res.status(400).json({ message: 'NPM sudah digunakan oleh mahasiswa lain.' });
    }

    // Check unique Email
    const emailCheck = await db.getAsync(`SELECT id FROM users WHERE email = ? AND id != ?`, [email, id]);
    if (emailCheck) {
      return res.status(400).json({ message: 'Email sudah digunakan oleh pengguna lain.' });
    }

    let query = `UPDATE users SET name = ?, npm = ?, email = ?, phone = ?`;
    let params = [name, npm, email, phone || null];

    if (password && password.trim() !== '') {
      const passwordHash = bcrypt.hashSync(password, 10);
      query += `, password = ?`;
      params.push(passwordHash);
    }

    query += ` WHERE id = ?`;
    params.push(id);

    await db.runAsync(query, params);

    const updatedStudent = await db.getAsync(
      `SELECT id, username, name, npm, email, phone, created_at FROM users WHERE id = ?`,
      [id]
    );

    return res.json({
      message: 'Data Mahasiswa berhasil diperbarui.',
      student: updatedStudent
    });
  } catch (error) {
    console.error('Error updating student:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// DELETE /api/students/:id - Delete a student user
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const student = await db.getAsync(`SELECT id FROM users WHERE id = ? AND role = 'mahasiswa'`, [id]);
    if (!student) {
      return res.status(404).json({ message: 'Mahasiswa tidak ditemukan.' });
    }

    // Delete student complaints and their corresponding image files from disk first
    const complaints = await db.allAsync(`SELECT image_path FROM complaints WHERE student_id = ?`, [id]);
    for (const c of complaints) {
      if (c.image_path && fs.existsSync(c.image_path)) {
        try { fs.unlinkSync(c.image_path); } catch (e) {}
      }
    }

    await db.runAsync(`DELETE FROM users WHERE id = ?`, [id]);
    return res.json({ message: 'Akun Mahasiswa berhasil dihapus.' });
  } catch (error) {
    console.error('Error deleting student:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

module.exports = router;

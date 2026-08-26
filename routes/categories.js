const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// GET /api/categories - All authenticated users can view categories
router.get('/', authenticateToken, async (req, res) => {
  try {
    const categories = await db.allAsync(`SELECT * FROM categories ORDER BY name ASC`);
    return res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// POST /api/categories - Admin only
router.post('/', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Nama kategori wajib diisi.' });
  }

  try {
    const existing = await db.getAsync(`SELECT id FROM categories WHERE name = ?`, [name]);
    if (existing) {
      return res.status(400).json({ message: 'Kategori dengan nama tersebut sudah ada.' });
    }

    const result = await db.runAsync(
      `INSERT INTO categories (name, description) VALUES (?, ?)`,
      [name, description]
    );

    const newCategory = await db.getAsync(`SELECT * FROM categories WHERE id = ?`, [result.lastID]);
    return res.status(201).json({
      message: 'Kategori berhasil ditambahkan.',
      category: newCategory
    });
  } catch (error) {
    console.error('Error creating category:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// PUT /api/categories/:id - Admin only
router.put('/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { name, description } = req.body;
  const { id } = req.params;

  if (!name) {
    return res.status(400).json({ message: 'Nama kategori wajib diisi.' });
  }

  try {
    const existing = await db.getAsync(`SELECT id FROM categories WHERE name = ? AND id != ?`, [name, id]);
    if (existing) {
      return res.status(400).json({ message: 'Kategori dengan nama tersebut sudah digunakan.' });
    }

    const result = await db.runAsync(
      `UPDATE categories SET name = ?, description = ? WHERE id = ?`,
      [name, description, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ message: 'Kategori tidak ditemukan.' });
    }

    const updatedCategory = await db.getAsync(`SELECT * FROM categories WHERE id = ?`, [id]);
    return res.json({
      message: 'Kategori berhasil diperbarui.',
      category: updatedCategory
    });
  } catch (error) {
    console.error('Error updating category:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// DELETE /api/categories/:id - Admin only
router.delete('/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.runAsync(`DELETE FROM categories WHERE id = ?`, [id]);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Kategori tidak ditemukan.' });
    }
    return res.json({ message: 'Kategori berhasil dihapus.' });
  } catch (error) {
    console.error('Error deleting category:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

module.exports = router;

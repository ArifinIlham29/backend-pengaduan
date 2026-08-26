const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Setup image upload directory
const uploadDir = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Hanya file gambar (jpg, png, webp, gif) yang diperbolehkan!'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// GET /api/complaints/image/:id - Serve base64 image as binary
router.get('/image/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await db.getAsync('SELECT image_path FROM complaints WHERE id = ?', [id]);
    if (!complaint || !complaint.image_path || !complaint.image_path.startsWith('data:image')) {
      return res.status(404).send('Image not found');
    }
    const base64Data = complaint.image_path.replace(/^data:image\/\w+;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');
    let mime = 'image/jpeg';
    if (complaint.image_path.startsWith('data:image/png')) mime = 'image/png';
    else if (complaint.image_path.startsWith('data:image/webp')) mime = 'image/webp';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': imgBuffer.length,
      'Cache-Control': 'public, max-age=31536000'
    });
    res.end(imgBuffer);
  } catch (error) {
    res.status(500).send('Error');
  }
});

// GET /api/complaints - Fetch complaints (supports filtering and search)
router.get('/', authenticateToken, async (req, res) => {
  const { status, category_id, search } = req.query;

  try {
    let query = ``;
    let params = [];

    if (req.user.role === 'mahasiswa') {
      // Students only see their own complaints
      query = `
        SELECT c.*, cat.name as category_name 
        FROM complaints c 
        JOIN categories cat ON c.category_id = cat.id 
        WHERE c.student_id = ?
      `;
      params.push(req.user.id);
    } else {
      // Admin and Pimpinan see all complaints
      query = `
        SELECT c.*, cat.name as category_name, u.name as student_name, u.npm as student_npm 
        FROM complaints c 
        JOIN categories cat ON c.category_id = cat.id 
        JOIN users u ON c.student_id = u.id 
        WHERE 1=1
      `;
    }

    // Apply filters
    if (status) {
      query += ` AND c.status = ?`;
      params.push(status);
    }
    if (category_id) {
      query += ` AND c.category_id = ?`;
      params.push(category_id);
    }
    if (search) {
      query += ` AND (c.location LIKE ? OR c.description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY c.created_at DESC`;

    const complaints = await db.allAsync(query, params);
    
    // Map image paths to full URLs if needed
    const complaintsWithUrls = complaints.map(c => ({
      ...c,
      image_url: c.image_path ? /api/complaints/image/${c.id} : null
    }));

    return res.json(complaintsWithUrls);
  } catch (error) {
    console.error('Error fetching complaints:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// GET /api/complaints/:id - Fetch single complaint details
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    let query = `
      SELECT c.*, cat.name as category_name, cat.description as category_desc, 
             u.name as student_name, u.npm as student_npm, u.email as student_email, u.phone as student_phone 
      FROM complaints c 
      JOIN categories cat ON c.category_id = cat.id 
      JOIN users u ON c.student_id = u.id 
      WHERE c.id = ?
    `;

    const complaint = await db.getAsync(query, [id]);

    if (!complaint) {
      return res.status(404).json({ message: 'Pengaduan tidak ditemukan.' });
    }

    // Check ownership for mahasiswa
    if (req.user.role === 'mahasiswa' && complaint.student_id !== req.user.id) {
      return res.status(403).json({ message: 'Akses ditolak. Anda tidak berwenang melihat pengaduan ini.' });
    }

    complaint.image_url = complaint.image_path ? /api/complaints/image/${complaint.id} : null;

    return res.json(complaint);
  } catch (error) {
    console.error('Error fetching complaint details:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// POST /api/complaints - Mahasiswa submits a new complaint
router.post('/', authenticateToken, authorizeRole('mahasiswa'), upload.single('image'), async (req, res) => {
  const { category_id, location, description } = req.body;
  const imageFile = req.file;

  if (!category_id || !location || !description) {
    // Delete uploaded image if inputs are missing
    
    return res.status(400).json({ message: 'Kategori, lokasi, dan deskripsi wajib diisi.' });
  }

  try {
    // Check if category exists
    const category = await db.getAsync(`SELECT id FROM categories WHERE id = ?`, [category_id]);
    if (!category) {
      
      return res.status(400).json({ message: 'Kategori tidak valid.' });
    }

    const imagePath = imageFile ? 'data:' + imageFile.mimetype + ';base64,' + imageFile.buffer.toString('base64') : null;

    const result = await db.runAsync(
      `INSERT INTO complaints (student_id, category_id, location, description, image_path, status) VALUES (?, ?, ?, ?, ?, 'Menunggu Verifikasi')`,
      [req.user.id, category_id, location, description, imagePath]
    );

    const newComplaint = await db.getAsync(`SELECT * FROM complaints WHERE id = ?`, [result.lastID]);
    newComplaint.image_url = imagePath ? /api/complaints/image/${newComplaint.id} : null;

    return res.status(201).json({
      message: 'Pengaduan berhasil dikirim.',
      complaint: newComplaint
    });
  } catch (error) {
    console.error('Error submitting complaint:', error);
    if (imageFile) {
      try { fs.unlinkSync(imageFile.path); } catch (e) {}
    }
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// PUT /api/complaints/:id/status - Admin updates complaint status & response
router.put('/:id/status', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { status, response } = req.body;

  if (!status) {
    return res.status(400).json({ message: 'Status wajib diisi.' });
  }

  const validStatuses = ['Menunggu Verifikasi', 'Sedang Diproses', 'Selesai'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Status tidak valid.' });
  }

  try {
    const complaint = await db.getAsync(`SELECT id, status FROM complaints WHERE id = ?`, [id]);
    if (!complaint) {
      return res.status(404).json({ message: 'Pengaduan tidak ditemukan.' });
    }

    const resolvedAt = status === 'Selesai' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;

    await db.runAsync(
      `UPDATE complaints SET status = ?, response = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, response || null, resolvedAt, id]
    );

    const updatedComplaint = await db.getAsync(`SELECT * FROM complaints WHERE id = ?`, [id]);
    updatedComplaint.image_url = updatedComplaint.image_path ? `/uploads/${path.basename(updatedComplaint.image_path)}` : null;

    return res.json({
      message: 'Status pengaduan berhasil diperbarui.',
      complaint: updatedComplaint
    });
  } catch (error) {
    console.error('Error updating complaint status:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// DELETE /api/complaints/:id - Admin only (or Student if status is 'Menunggu Verifikasi')
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const complaint = await db.getAsync(`SELECT * FROM complaints WHERE id = ?`, [id]);
    if (!complaint) {
      return res.status(404).json({ message: 'Pengaduan tidak ditemukan.' });
    }

    if (req.user.role === 'mahasiswa') {
      if (complaint.student_id !== req.user.id) {
        return res.status(403).json({ message: 'Akses ditolak. Anda tidak berwenang menghapus pengaduan ini.' });
      }
      if (complaint.status !== 'Menunggu Verifikasi') {
        return res.status(400).json({ message: 'Pengaduan yang sedang diproses atau selesai tidak dapat dihapus.' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Akses ditolak.' });
    }

    // Delete image file if it exists
    if (complaint.image_path && fs.existsSync(complaint.image_path)) {
      try { fs.unlinkSync(complaint.image_path); } catch (e) {}
    }

    await db.runAsync(`DELETE FROM complaints WHERE id = ?`, [id]);
    return res.json({ message: 'Pengaduan berhasil dihapus.' });
  } catch (error) {
    console.error('Error deleting complaint:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

module.exports = router;






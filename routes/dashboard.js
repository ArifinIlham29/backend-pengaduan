const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// GET /api/dashboard/stats - Admin and Pimpinan only
router.get('/stats', authenticateToken, authorizeRole('admin', 'pimpinan'), async (req, res) => {
  try {
    // 1. Overall status counts
    const statusCounts = await db.allAsync(`
      SELECT status, COUNT(*) as count 
      FROM complaints 
      GROUP BY status
    `);
    
    // Convert statusCounts array to a key-value object for easier access
    const statusMap = {
      'Menunggu Verifikasi': 0,
      'Sedang Diproses': 0,
      'Selesai': 0
    };
    statusCounts.forEach(item => {
      if (item.status in statusMap) {
        statusMap[item.status] = item.count;
      }
    });

    // 2. Counts by Category
    const categoryCounts = await db.allAsync(`
      SELECT cat.name as category_name, COUNT(c.id) as count
      FROM categories cat
      LEFT JOIN complaints c ON cat.id = c.category_id
      GROUP BY cat.id
    `);

    // 3. Monthly statistics (last 6 months)
    const monthlyStats = await db.allAsync(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count
      FROM complaints
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `);

    // 4. Totals
    const totalComplaints = await db.getAsync(`SELECT COUNT(*) as count FROM complaints`);
    const totalStudents = await db.getAsync(`SELECT COUNT(*) as count FROM users WHERE role = 'mahasiswa'`);

    return res.json({
      total_complaints: totalComplaints.count,
      total_students: totalStudents.count,
      status_stats: statusMap,
      category_stats: categoryCounts,
      monthly_stats: monthlyStats
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// GET /api/dashboard/reports - Admin and Pimpinan only
router.get('/reports', authenticateToken, authorizeRole('admin', 'pimpinan'), async (req, res) => {
  const { start_date, end_date, category_id } = req.query;

  try {
    let query = `
      SELECT c.id, c.student_id, c.category_id, c.location, c.description, c.image_path, c.status, c.response, c.created_at, c.updated_at, c.resolved_at,
             cat.name as category_name, u.name as student_name, u.npm as student_npm, u.email as student_email, u.phone as student_phone
      FROM complaints c
      JOIN categories cat ON c.category_id = cat.id
      JOIN users u ON c.student_id = u.id
      WHERE 1=1
    `;
    let params = [];

    if (start_date) {
      query += ` AND DATE(DATE_ADD(c.created_at, INTERVAL 7 HOUR)) >= DATE(?)`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND DATE(DATE_ADD(c.created_at, INTERVAL 7 HOUR)) <= DATE(?)`;
      params.push(end_date);
    }
    if (category_id) {
      query += ` AND c.category_id = ?`;
      params.push(category_id);
    }

    query += ` ORDER BY c.created_at DESC`;

    const reportData = await db.allAsync(query, params);
    return res.json(reportData);
  } catch (error) {
    console.error('Error generating report:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

module.exports = router;

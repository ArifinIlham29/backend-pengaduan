const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbConfig = { host: 'mysql-1f29f192-manham2204-fc17.b.aivencloud.com', port: 16844, user: 'avnadmin', password: 'AVNS_0qGSCDWP' + 'LucVE25W6Fm', database: 'defaultdb', ssl: { rejectUnauthorized: false } };

const pool = mysql.createPool({ host: dbConfig.host, port: dbConfig.port, user: dbConfig.user, password: dbConfig.password, database: dbConfig.database, ssl: dbConfig.ssl, waitForConnections: true, connectionLimit: 10, queueLimit: 0 });

async function initDb() {
  try {
    // Connect without database to create it if not exists
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      ssl: dbConfig.ssl
    });
    
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    console.log(`Database ${dbConfig.database} created or already exists.`);
    await connection.end();

    // Create a pool
    pool = mysql.createPool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      ssl: dbConfig.ssl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    console.log('Connected to MySQL database.');

    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('mahasiswa', 'admin', 'pimpinan') NOT NULL,
        name VARCHAR(255) NOT NULL,
        npm VARCHAR(255) UNIQUE,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        category_id INT NOT NULL,
        location VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        image_path VARCHAR(255),
        status ENUM('Menunggu Verifikasi', 'Sedang Diproses', 'Selesai') DEFAULT 'Menunggu Verifikasi',
        response TEXT,
        resolved_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      )
    `);

    // Seed default users if they don't exist
    const [adminRows] = await pool.query(`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`);
    if (adminRows[0].count === 0) {
      const adminPasswordHash = bcrypt.hashSync('admin123', 10);
      await pool.query(
        `INSERT INTO users (username, password, role, name, email) VALUES (?, ?, ?, ?, ?)`,
        ['admin', adminPasswordHash, 'admin', 'Administrator AMIK-YPAT', 'admin@amikypat.ac.id']
      );
      console.log('Seeded default admin user.');
    }

    const [pimpinanRows] = await pool.query(`SELECT COUNT(*) as count FROM users WHERE role = 'pimpinan'`);
    if (pimpinanRows[0].count === 0) {
      const pimpinanPasswordHash = bcrypt.hashSync('pimpinan123', 10);
      await pool.query(
        `INSERT INTO users (username, password, role, name, email) VALUES (?, ?, ?, ?, ?)`,
        ['pimpinan', pimpinanPasswordHash, 'pimpinan', 'Direktur AMIK-YPAT', 'pimpinan@amikypat.ac.id']
      );
      console.log('Seeded default pimpinan user.');
    }

    const [mhsRows] = await pool.query(`SELECT COUNT(*) as count FROM users WHERE role = 'mahasiswa'`);
    if (mhsRows[0].count === 0) {
      const mhsPasswordHash = bcrypt.hashSync('mahasiswa123', 10);
      await pool.query(
        `INSERT INTO users (username, password, role, name, npm, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['mahasiswa', mhsPasswordHash, 'mahasiswa', 'Ahmad Fauzi', '211351001', 'ahmad.fauzi@amikypat.ac.id', '08123456789']
      );
      console.log('Seeded default mahasiswa user.');
    }

    // Seed default categories if they don't exist
    const [catRows] = await pool.query(`SELECT COUNT(*) as count FROM categories`);
    if (catRows[0].count === 0) {
      const defaultCategories = [
        { name: 'Fasilitas Kelas', description: 'Kerusakan meja, kursi, papan tulis, LCD proyektor, AC kelas, dll.' },
        { name: 'Laboratorium', description: 'Kendala PC komputer, jaringan internet lab, AC lab, software, dll.' },
        { name: 'Toilet & Sanitasi', description: 'Keran rusak, toilet tersumbat, wastafel bocor, lampu mati, dll.' },
        { name: 'Layanan Akademik', description: 'Keluhan administrasi, kendala portal SIAKAD, antrean layanan, dll.' },
        { name: 'Lain-lain', description: 'Laporan kerusakan atau keluhan di luar kategori yang tertera.' }
      ];

      for (const cat of defaultCategories) {
        await pool.query(
          `INSERT INTO categories (name, description) VALUES (?, ?)`,
          [cat.name, cat.description]
        );
      }
      console.log('Seeded default categories.');
    }

    // Seed default complaints if none exist
    const [compRows] = await pool.query(`SELECT COUNT(*) as count FROM complaints`);
    if (compRows[0].count === 0) {
      const [mhsUserRows] = await pool.query(`SELECT id FROM users WHERE username = 'mahasiswa'`);
      const [catKelasRows] = await pool.query(`SELECT id FROM categories WHERE name = 'Fasilitas Kelas'`);
      const [catToiletRows] = await pool.query(`SELECT id FROM categories WHERE name = 'Toilet & Sanitasi'`);

      if (mhsUserRows.length > 0 && catKelasRows.length > 0 && catToiletRows.length > 0) {
        const mhsId = mhsUserRows[0].id;
        const kelasId = catKelasRows[0].id;
        const toiletId = catToiletRows[0].id;

        // 1. Complaint: Menunggu Verifikasi
        await pool.query(
          `INSERT INTO complaints (student_id, category_id, location, description, status) VALUES (?, ?, ?, ?, ?)`,
          [
            mhsId,
            toiletId,
            'Toilet Lantai 2 Gedung Utama',
            'Keran air di toilet pria sebelah kanan patah, menyebabkan air terus mengalir dan terbuang sia-sia.',
            'Menunggu Verifikasi'
          ]
        );

        // 2. Complaint: Sedang Diproses
        await pool.query(
          `INSERT INTO complaints (student_id, category_id, location, description, status) VALUES (?, ?, ?, ?, ?)`,
          [
            mhsId,
            kelasId,
            'Ruang Kelas 302 Gedung B',
            'AC di ruang kelas 302 mengeluarkan bunyi bising dan udaranya tidak dingin sama sekali saat perkuliahan berlangsung.',
            'Sedang Diproses'
          ]
        );

        // 3. Complaint: Selesai
        const now = new Date().toISOString().slice(0, 19).replace('T', ' '); // MySQL DATETIME format
        await pool.query(
          `INSERT INTO complaints (student_id, category_id, location, description, status, response, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            mhsId,
            kelasId,
            'Laboratorium Komputer 2',
            'LCD proyektor berkedip-kedip (flicker) terus menerus sehingga menyulitkan mahasiswa melihat materi presentasi dosen.',
            'Selesai',
            'Kabel VGA proyektor telah diganti dengan yang baru dan port konektor telah dibersihkan. Silakan dicoba kembali.',
            now
          ]
        );
        console.log('Seeded initial complaints.');
      }
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

// Wrapper to mimic SQLite API to keep existing routes compatible
const dbWrapper = {
  async getAsync(sql, params = []) {
    if (!pool) throw new Error('Database pool not initialized');
    const [rows] = await pool.execute(sql, params);
    return rows.length > 0 ? rows[0] : undefined;
  },
  async allAsync(sql, params = []) {
    if (!pool) throw new Error('Database pool not initialized');
    const [rows] = await pool.execute(sql, params);
    return rows;
  },
  async runAsync(sql, params = []) {
    if (!pool) throw new Error('Database pool not initialized');
    const [result] = await pool.execute(sql, params);
    return { lastID: result.insertId, changes: result.affectedRows };
  }
};

module.exports = {
  db: dbWrapper,
  initDb
};





const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({host:'localhost', user:'root', database:'pengaduan_layanan'});
  const [rows] = await conn.query(`
      SELECT c.id, c.location, c.description, c.status, c.response, c.created_at, c.resolved_at,
             cat.name as category_name, u.name as student_name, u.npm as student_npm
      FROM complaints c
      JOIN categories cat ON c.category_id = cat.id
      JOIN users u ON c.student_id = u.id
      WHERE DATE(DATE_ADD(c.created_at, INTERVAL 7 HOUR)) >= DATE('2026-08-27')
        AND c.category_id = 3
  `);
  console.log('Result length:', rows.length);
  console.log('Result data:', rows);
  process.exit(0);
})();

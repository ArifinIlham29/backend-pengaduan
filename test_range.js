const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({host:'localhost', user:'root', database:'pengaduan_layanan'});
  const [rows] = await conn.query(`
      SELECT c.id, c.location, c.created_at, DATE(DATE_ADD(c.created_at, INTERVAL 7 HOUR)) as d_add
      FROM complaints c
      WHERE DATE(DATE_ADD(c.created_at, INTERVAL 7 HOUR)) >= DATE('2026-08-01')
        AND DATE(DATE_ADD(c.created_at, INTERVAL 7 HOUR)) <= DATE('2026-08-27')
  `);
  console.log('Result length:', rows.length);
  console.log('Result data:', rows);
  process.exit(0);
})();

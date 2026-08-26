const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({host:'localhost', user:'root', database:'pengaduan_layanan'});
  const [rows] = await conn.execute(`
      SELECT c.id
      FROM complaints c
      WHERE DATE(DATE_ADD(c.created_at, INTERVAL 7 HOUR)) >= DATE(?)
        AND DATE(DATE_ADD(c.created_at, INTERVAL 7 HOUR)) <= DATE(?)
  `, ['2026-08-01', '2026-08-27']);
  console.log('Result execute length:', rows.length);
  process.exit(0);
})();

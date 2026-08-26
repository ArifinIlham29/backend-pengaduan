const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({host:'localhost', user:'root', database:'pengaduan_layanan'});
  const [rows] = await conn.query("SELECT DATE(DATE_ADD(created_at, INTERVAL 7 HOUR)) as adjusted_date, created_at, location FROM complaints");
  console.log(rows);
  
  const [rows2] = await conn.query("SELECT DATE(DATE_ADD(created_at, INTERVAL 7 HOUR)) >= '2026-08-27' as is_match FROM complaints WHERE location = 'b1'");
  console.log(rows2);
  
  process.exit(0);
})();

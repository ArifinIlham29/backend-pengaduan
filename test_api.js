const jwt = require('jsonwebtoken');
const http = require('http');

const SECRET_KEY = 'amikypat_secret_key';
const token = jwt.sign({ id: 1, role: 'pimpinan' }, SECRET_KEY, { expiresIn: '1h' });

const options = {
  host: 'localhost',
  port: 3000,
  path: '/api/dashboard/reports?start_date=2026-08-01&end_date=2026-08-27',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + token
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'DATA:', data));
});
req.end();

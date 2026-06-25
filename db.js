const mysql = require('mysql2/promise');
const connection = mysql.createPool({
    host: process.env.DIRECTOR_DATABASE_HOST,
    user: process.env.DIRECTOR_DATABASE_USERNAME,
    password: process.env.DIRECTOR_DATABASE_PASSWORD,
    database: process.env.DIRECTOR_DATABASE_NAME,
    enableKeepAlive: true
})
module.exports = connection;
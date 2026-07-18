const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: process.env.DIRECTOR_DATABASE_HOST,
    user: process.env.DIRECTOR_DATABASE_USERNAME,
    password: process.env.DIRECTOR_DATABASE_PASSWORD,
    database: process.env.DIRECTOR_DATABASE_NAME,
    enableKeepAlive: true
})
async function queryRetry(query, args = [])
{
    for(let i = 0; i < 5; i++) {
        try {
            const [rows] = await db.execute(query, args);
            return rows;
        }
        catch(e) {
            if(i < 4) {
                await new Promise(r => setTimeout(r, 100 * (i + 1)));
                continue;
            }
            throw e;
        }
    }
}
module.exports = queryRetry;
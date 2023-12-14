const express = require('express');
const mysql = require('mysql');
const fs = require('fs');
const csv = require('csv-parser');
const app = express();
require('dotenv').config();

app.use(express.json());


const pool = mysql.createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});



// db.connect(err => {
//     if (err) {
//         throw err;
//     }
//     console.log('Database connected...');
// });




function convertTimestampToMySQLDateTime(timestamp) {
    return new Date(parseInt(timestamp)).toISOString().slice(0, 19).replace('T', ' ');
}

function dbQuery(sql, params) {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
            if (err) {
                reject(err);
                return;
            }
            connection.query(sql, params, (error, results) => {
                connection.release();
                if (error) {
                    console.error('Error executing query:', error);
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
    });
}


function loadCsvData(path, tableName) {
    const rowsToInsert = [];
    const batchSize = 1000; 

    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(path).pipe(csv());

        stream.on('data', (row) => {
            if (row.date) {
                row.date = convertTimestampToMySQLDateTime(row.date);
            }
            if (row.recommend !== undefined) {
                row.recommend = row.recommend === 'true' ? 1 : 0;
            }
            if (row.reported !== undefined) {
                row.reported = row.reported === 'true' ? 1 : 0;
            }
            rowsToInsert.push(row);

            if (rowsToInsert.length >= batchSize) {
                stream.pause(); 

                const columns = Object.keys(rowsToInsert[0]);
                const columnSql = columns.join(', ');

                const valuesSql = rowsToInsert.map(row => {
                    const values = columns.map(column => mysql.escape(row[column]));
                    return `(${values.join(', ')})`;
                }).join(', ');

                const sql = `INSERT INTO ${tableName} (${columnSql}) VALUES ${valuesSql}`;

                dbQuery(sql, [])
                    .then(() => {
                        rowsToInsert.length = 0; 
                        stream.resume(); 
                    })
                    .catch(reject);
            }
        })
        .on('end', () => {
            if (rowsToInsert.length > 0) {
                const columns = Object.keys(rowsToInsert[0]);
                const columnSql = columns.join(', ');

                const valuesSql = rowsToInsert.map(row => {
                    const values = columns.map(column => mysql.escape(row[column]));
                    return `(${values.join(', ')})`;
                }).join(', ');

                const sql = `INSERT INTO ${tableName} (${columnSql}) VALUES ${valuesSql}`;

                dbQuery(sql, [])
                    .then(resolve)
                    .catch(reject);
            } else {
                resolve();
            }
        });
    });
}



app.get('/importCsv', async (req, res) => {
    try {
        await loadCsvData('/home/ubuntu/myexpressapp/data/product.csv', 'Products');
        await loadCsvData('/home/ubuntu/myexpressapp/data/reviews.csv', 'Reviews');
        await loadCsvData('/home/ubuntu/myexpressapp/data/reviews_photos.csv', 'reviews_photos');
        await loadCsvData('/home/ubuntu/myexpressapp/data/characteristics.csv', 'Characteristics');
        await loadCsvData('/home/ubuntu/myexpressapp/data/characteristic_reviews.csv', 'characteristic_reviews');
        
        res.send('CSV data imported.');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error importing CSV data.');
    }
});
app.get('/reviews', (req, res) => {
    let productId = req.query.product_id;
    if (!productId) {
        return res.status(400).send('Product ID is required');
    }
    const query = `
    WITH cte AS (
        SELECT 
            r.id as review_id, 
            r.product_id,
            r.rating, 
            r.summary, 
            r.body, 
            r.recommend, 
            r.reviewer_name, 
            r.reviewer_email, 
            r.date, 
            r.helpfulness,
            GROUP_CONCAT(ph.url SEPARATOR ', ') AS photo_urls 
        FROM 
            Reviews r
            LEFT JOIN reviews_photos ph ON r.id = ph.review_id
        WHERE
            r.product_id = ?
        GROUP BY 
            r.id, r.product_id, r.rating, r.summary, r.body, r.recommend, r.reviewer_name, r.reviewer_email, r.date, r.helpfulness
    ),
    cte1 AS (
        SELECT 
            c1.review_id,
            c1.product_id,
            c1.rating,
            c1.summary,
            c1.body,
            c1.recommend,
            c1.reviewer_name,
            c1.reviewer_email,
            c1.date,
            c1.helpfulness,
            c1.photo_urls,
            GROUP_CONCAT(CONCAT(ch.name, ': ', cr.value) SEPARATOR ', ') AS characteristic_values
        FROM 
            cte c1
            LEFT JOIN characteristic_reviews cr ON c1.review_id = cr.review_id 
            LEFT JOIN Characteristics ch ON cr.characteristic_id = ch.id
        GROUP BY 
            c1.review_id, c1.product_id, c1.rating, c1.summary, c1.body, c1.recommend, c1.reviewer_name, c1.reviewer_email, c1.date, c1.helpfulness, c1.photo_urls
    )
    SELECT 
        rd.review_id,
        rd.product_id,
        rd.rating, 
        rd.summary, 
        rd.body, 
        rd.recommend, 
        rd.reviewer_name, 
        rd.reviewer_email, 
        rd.date, 
        rd.helpfulness,
        rd.photo_urls,
        rd.characteristic_values 
    FROM 
        cte1 rd
    ORDER BY 
        rd.review_id;
    `;

    db.query(query, [productId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send(err);
        }
        res.status(200).json(results);
    });
});

app.post('/reviews', async (req, res) => {
    const { product_id, rating, summary, body, recommend, reviewer_name, reviewer_email, photos, characteristics } = req.body;

    try {

        const reviewQuery = 'INSERT INTO Reviews (product_id, rating, summary, body, recommend, reviewer_name, reviewer_email, date, helpfulness) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 0)';
        const reviewResult = await dbQuery(reviewQuery, [product_id, rating, summary, body, recommend, reviewer_name, reviewer_email]);
        const reviewId = reviewResult.insertId;


        if (photos && photos.length) {
            const photoQuery = 'INSERT INTO reviews_photos (review_id, url) VALUES ?';
            const photoValues = photos.map(url => [reviewId, url]);
            await dbQuery(photoQuery, [photoValues]);
        }

        if (characteristics && Object.keys(characteristics).length) {
            const characteristicQuery = 'INSERT INTO characteristic_reviews (review_id, characteristic_id, value) VALUES ?';
            const characteristicValues = Object.entries(characteristics).map(([characteristic_id, value]) => [reviewId, characteristic_id, value]);
            await dbQuery(characteristicQuery, [characteristicValues]);
        }

        res.status(201).json({ message: 'Review and associated data added', reviewId: reviewId });
    } catch (err) {
        console.error('Error inserting review data:', err);
        res.status(500).send('Error inserting review data.');
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

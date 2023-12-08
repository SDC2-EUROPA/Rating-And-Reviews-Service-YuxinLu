const express = require('express');
const mysql = require('mysql');
const fs = require('fs');
const csv = require('csv-parser');
const app = express();

app.use(express.json());


const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Luyuxin0715',
    database: 'ReviewsAllthings'
});


db.connect(err => {
    if (err) {
        throw err;
    }
    console.log('Database connected...');
});




function timestampToDatetime(timestamp) {
    return new Date(parseInt(timestamp)).toISOString().slice(0, 19).replace('T', ' ');
}

function dbQuery(tableName, rows) {
    return new Promise((resolve, reject) => {
        
        if (!rows.length || typeof rows[0] !== 'object') {
            return reject(new Error('Invalid data format for insertion'));
        }

        
        const columns = Object.keys(rows[0]);
        const columnSql = columns.join(', ');

        
        const valuesSql = rows.map(row => {
            const values = columns.map(column => mysql.escape(row[column]));
            return `(${values.join(', ')})`;
        }).join(', ');

        
        const sql = `INSERT INTO ${tableName} (${columnSql}) VALUES ${valuesSql}`;

        db.query(sql, (error) => {
            if (error) {
                console.error('Error inserting data:', error);
                reject(error);
            } else {
                resolve();
            }
        });
    });
}


function loadCsvData(path, tableName) {
    const rowsToInsert = [];
    const batchSize = 1000; 

    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(path).pipe(csv());

        stream.on('data', (row) => {
            rowsToInsert.push(row);

            if (rowsToInsert.length >= batchSize) {
                stream.pause(); 

                const sql = `INSERT INTO ${tableName} SET ?`;
                dbQuery(sql, rowsToInsert)
                    .then(() => {
                        rowsToInsert.length = 0; 
                        stream.resume(); 
                    })
                    .catch(reject);
            }
        })
        .on('end', () => {
            if (rowsToInsert.length > 0) {
                const sql = `INSERT INTO ${tableName} SET ?`;
                dbQuery(sql, rowsToInsert)
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
       await  loadCsvData('/Users/yuxinlu/Desktop/data/product.csv', 'Products');
       await loadCsvData('/Users/yuxinlu/Desktop/data/reviews.csv', 'Reviews')
         await loadCsvData('/Users/yuxinlu/Desktop/data/reviews_photos.csv', 'reviews_photos');
         await loadCsvData('/Users/yuxinlu/Desktop/data/characteristics.csv', 'Characteristics');
         await loadCsvData('/Users/yuxinlu/Desktop/data/characteristic_reviews.csv', 'characteristic_reviews');

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

app.post('/reviews', (req, res) => {
    const { product_id, rating, summary, body, recommend, reviewer_name, reviewer_email } = req.body;
    const query = 'INSERT INTO Reviews (product_id, rating, summary, body, recommend, reviewer_name, reviewer_email, date, helpfulness, photo_urls, characteristic_values) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 0)';
    
    db.query(query, [product_id, rating, summary, body, recommend, reviewer_name, reviewer_email], (err, result) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.status(201).json({ message: 'Review added', reviewId: result.insertId });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
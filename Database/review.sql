CREATE DATABASE IF NOT EXISTS ReviewsAllthings;
USE ReviewsAllthings;

CREATE TABLE IF NOT EXISTS Products (
    id INT unsigned NOT NULL,
    name VARCHAR(255),
    slogan VARCHAR(255),
    description TEXT,
    category VARCHAR(255),
    default_price VARCHAR(255),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS Reviews (
    id INT unsigned NOT NULL PRIMARY KEY,
    product_id INT unsigned,
    rating INT,
    date DATETIME,
    summary TEXT,
    body TEXT,
    recommend BOOLEAN,
    reported BOOLEAN,
    reviewer_name VARCHAR(255),
    reviewer_email VARCHAR(255),
    response TEXT,
    helpfulness INT,
    FOREIGN KEY (product_id) REFERENCES Products(id)
);

CREATE TABLE IF NOT EXISTS reviews_photos (
    iid INT unsigned NOT NULL PRIMARY KEY,
    review_id INT unsigned,
    url VARCHAR(255),
    FOREIGN KEY (review_id) REFERENCES Reviews(id)
);

CREATE TABLE IF NOT EXISTS Characteristics (
    id INT unsigned NOT NULL PRIMARY KEY,
    product_id INT unsigned,
    name VARCHAR(255),
    FOREIGN KEY (product_id) REFERENCES Products(id)
);

CREATE TABLE IF NOT EXISTS characteristic_reviews (
    id INT unsigned NOT NULL PRIMARY KEY,
    characteristic_id INT unsigned,
    review_id INT unsigned,
    value INT,
    FOREIGN KEY (characteristic_id) REFERENCES Characteristics(id),
    FOREIGN KEY (review_id) REFERENCES Reviews(id)
);

ALTER TABLE Products AUTO_INCREMENT=3518964;
ALTER TABLE Reviews AUTO_INCREMENT=6879307;
ALTER TABLE reviews_photos AUTO_INCREMENT=2063760;
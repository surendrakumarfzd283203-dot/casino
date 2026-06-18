CREATE DATABASE IF NOT EXISTS solo_casino;
USE solo_casino;

CREATE TABLE IF NOT EXISTS users(
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    coins BIGINT DEFAULT 10000,
    status VARCHAR(20) DEFAULT 'active',
    avatar VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions(
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    amount BIGINT,
    type VARCHAR(50),
    details VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deposit_requests(
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    amount BIGINT,
    payment_method VARCHAR(20),
    details TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admins(
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    password VARCHAR(255)
);

INSERT IGNORE INTO admins(username,password) VALUES
('admin','$2b$10$JCwTu2.rk1h6Ro7G3b2LKujfR52Qrdemgjax1p92wYO9eGWhMypt.');

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'nutritrack.db'));

function initDb() {

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      telegram_id INTEGER UNIQUE,
      first_name TEXT,
      gender TEXT, 
      age INTEGER,
      weight REAL,
      height REAL,
      activity_level REAL,
      target_calories INTEGER,
      target_fat INTEGER,
      target_carbs INTEGER,
      target_protein INTEGER,
      onboarding_step TEXT DEFAULT 'ask_gender',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT CHECK(type IN ('food', 'workout')),
      item_name TEXT,
      calories INTEGER,
      fat REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      protein REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
}

function getUser(telegramId, firstName) {
  let stmt = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
  let user = stmt.get(telegramId);
  
  if (!user) {
    const insertStmt = db.prepare('INSERT INTO users (telegram_id, first_name) VALUES (?, ?)');
    insertStmt.run(telegramId, firstName);
    user = stmt.get(telegramId);
  }
  return user;
}

function updateUser(userId, data) {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setString = keys.map(k => `${k} = ?`).join(', ');
  
  const stmt = db.prepare(`UPDATE users SET ${setString} WHERE id = ?`);
  stmt.run(...values, userId);
}

function logFood(userId, itemName, calories, fat, carbs, protein) {
  const stmt = db.prepare('INSERT INTO logs (user_id, type, item_name, calories, fat, carbs, protein) VALUES (?, ?, ?, ?, ?, ?, ?)');
  stmt.run(userId, 'food', itemName, calories, fat, carbs, protein);
}

function logWorkout(userId, activityName, caloriesBurned) {
  const stmt = db.prepare('INSERT INTO logs (user_id, type, item_name, calories) VALUES (?, ?, ?, ?)');
  stmt.run(userId, 'workout', activityName, -Math.abs(caloriesBurned));
}

function getTodayStats(userId) {
  const stmt = db.prepare(`
    SELECT 
      SUM(CASE WHEN type = 'food' THEN calories ELSE 0 END) as calories_in,
      SUM(CASE WHEN type = 'workout' THEN ABS(calories) ELSE 0 END) as calories_out,
      SUM(fat) as total_fat,
      SUM(carbs) as total_carbs,
      SUM(protein) as total_protein
    FROM logs 
    WHERE user_id = ? AND date(created_at, '+7 hours') = date('now', '+7 hours')
  `);
  return stmt.get(userId) || { calories_in: 0, calories_out: 0, total_fat: 0, total_carbs: 0, total_protein: 0 };
}

function getWeeklyStats(userId) {
  const stmt = db.prepare(`
    SELECT 
      SUM(CASE WHEN type = 'food' THEN calories ELSE 0 END) as calories_in,
      SUM(CASE WHEN type = 'workout' THEN ABS(calories) ELSE 0 END) as calories_out
    FROM logs 
    WHERE user_id = ? AND date(created_at, '+7 hours') >= date('now', '+7 hours', '-7 days')
  `);
  return stmt.get(userId) || { calories_in: 0, calories_out: 0 };
}

function deleteLastLog(userId) {
  const stmt = db.prepare(`
    DELETE FROM logs 
    WHERE id = (
      SELECT id FROM logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
    )
  `);
  const info = stmt.run(userId);
  return info.changes > 0;
}

function getAllActiveUsers() {
  const stmt = db.prepare("SELECT telegram_id, first_name FROM users WHERE onboarding_step = 'completed'");
  return stmt.all();
}

function getAllUsersFull() {
  const stmt = db.prepare("SELECT * FROM users ORDER BY created_at DESC");
  return stmt.all();
}

module.exports = {
  initDb,
  getUser,
  updateUser,
  logFood,
  logWorkout,
  getTodayStats,
  getWeeklyStats,
  deleteLastLog,
  getAllActiveUsers,
  getAllUsersFull
};

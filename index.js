require('dotenv').config();
const { Bot, InlineKeyboard } = require('grammy');
const cron = require('node-cron');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initDb, getUser, updateUser, logFood, logWorkout, getTodayStats, getWeeklyStats, deleteLastLog, getAllActiveUsers, getAllUsersFull } = require('./database');
const { analyzeInput } = require('./ai');

// Inisialisasi Database
initDb();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN || BOT_TOKEN.includes('your_')) {
  console.error("TELEGRAM_BOT_TOKEN belum diset di file .env!");
  process.exit(1);
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// SETUP EXPRESS DASHBOARD
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware Autentikasi
function checkAuth(req, res, next) {
  if (req.cookies.admin_token === 'authenticated') {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.cookie('admin_token', 'authenticated', { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

app.get('/api/users', checkAuth, (req, res) => {
  try {
    const users = getAllUsersFull();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🌐 Admin Dashboard berjalan di http://localhost:${PORT}`);
});

const bot = new Bot(BOT_TOKEN);

// Jadwalkan pengingat setiap hari jam 07:00 pagi
cron.schedule('0 7 * * *', async () => {
  const users = getAllActiveUsers();
  for (const u of users) {
    try {
      await bot.api.sendMessage(
        u.telegram_id, 
        `Selamat pagi ${u.first_name}! ☀️\n\nJangan lupa untuk melacak asupan kalori dan aktivitas olahragamu hari ini ya! Tetap semangat mencapai target! 💪`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error(`Gagal mengirim pengingat ke ${u.telegram_id}:`, e.message);
    }
  }
});

function calculateBMITDEE(user) {
  const bmi = user.weight / Math.pow(user.height / 100, 2);
  let bmr;
  if (user.gender === 'L') {
    bmr = 10 * user.weight + 6.25 * user.height - 5 * user.age + 5;
  } else {
    bmr = 10 * user.weight + 6.25 * user.height - 5 * user.age - 161;
  }
  const tdee = bmr * user.activity_level;
  return { bmi: bmi.toFixed(1), tdee: Math.round(tdee) };
}

bot.command('start', async (ctx) => {
  const user = getUser(ctx.from.id, ctx.from.first_name);
  updateUser(user.id, { onboarding_step: 'ask_gender' });
  
  await ctx.reply(
    `Halo ${user.first_name}! Selamat datang di NutriTrack Bot 🏃‍♂️🍏\n\n` +
    `Sebelum kita mulai melacak makanan dan olahraga, mari isi data diri Anda untuk menghitung BMI dan Target Kalori harian.\n\n` +
    `Apa Jenis Kelamin Anda?\nKetik *L* untuk Laki-laki atau *P* untuk Perempuan.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('stats', async (ctx) => {
  const user = getUser(ctx.from.id, ctx.from.first_name);
  if (user.onboarding_step !== 'completed') return ctx.reply('Selesaikan pendaftaran dulu (Ketik /start).');

  const stats = getTodayStats(user.id);
  const target = user.target_calories || 0;
  const sisa = target - stats.calories_in + stats.calories_out;
  
  await ctx.reply(
    `📊 *Ringkasan Hari Ini:*\n\n` +
    `🎯 Target Harian: ${target} kcal\n` +
    `🍏 Kalori Masuk: ${stats.calories_in} kcal\n` +
    `🔥 Kalori Keluar: ${stats.calories_out} kcal\n` +
    `=======================\n` +
    `🥑 Total Lemak: ${stats.total_fat}g / ${user.target_fat}g\n` +
    `🍞 Total Karbo: ${stats.total_carbs}g / ${user.target_carbs}g\n` +
    `🥩 Total Protein: ${stats.total_protein}g / ${user.target_protein}g\n` +
    `=======================\n` +
    `💡 *SISA KALORI:* ${sisa} kcal\n\n` +
    `Terus semangat! 💪`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('history', async (ctx) => {
  const user = getUser(ctx.from.id, ctx.from.first_name);
  if (user.onboarding_step !== 'completed') return ctx.reply('Selesaikan pendaftaran dulu (Ketik /start).');

  const stats = getWeeklyStats(user.id);
  const avgIn = Math.round(stats.calories_in / 7);
  const avgOut = Math.round(stats.calories_out / 7);
  
  await ctx.reply(
    `📅 *Statistik 7 Hari Terakhir:*\n\n` +
    `Total Kalori Masuk: ${stats.calories_in} kcal\n` +
    `Rata-rata Harian Masuk: ${avgIn} kcal/hari\n\n` +
    `Total Kalori Dibakar: ${stats.calories_out} kcal\n` +
    `Rata-rata Harian Dibakar: ${avgOut} kcal/hari\n`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('undo', async (ctx) => {
  const user = getUser(ctx.from.id, ctx.from.first_name);
  const deleted = deleteLastLog(user.id);
  
  if (deleted) {
    await ctx.reply('✅ Log terakhir berhasil dihapus dari jurnal Anda.');
  } else {
    await ctx.reply('⚠️ Tidak ada log yang bisa dihapus.');
  }
});

bot.callbackQuery("undo_last", async (ctx) => {
  const user = getUser(ctx.from.id, ctx.from.first_name);
  const deleted = deleteLastLog(user.id);
  
  if (deleted) {
    await ctx.answerCallbackQuery({ text: 'Log terakhir berhasil dibatalkan!', show_alert: true });
    // Ubah pesan sebelumnya agar tombol hilang
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n*⚠️ Pencatatan ini telah dibatalkan.*', { parse_mode: 'Markdown' });
  } else {
    await ctx.answerCallbackQuery({ text: 'Tidak ada log yang bisa dihapus.', show_alert: true });
  }
});

async function processInput(ctx, user, imageUrl, textInput) {
  const processingMsg = await ctx.reply('⏳ Sedang menganalisa input menggunakan AI...');
  try {
    const result = await analyzeInput(imageUrl, textInput);
    let replyText = '';
    const keyboard = new InlineKeyboard().text("❌ Batalkan Pencatatan", "undo_last");
    
    if (result.type === 'food') {
      const fat = result.fat || 0;
      const carbs = result.carbs || 0;
      const protein = result.protein || 0;
      
      logFood(user.id, result.item_name, result.calories, fat, carbs, protein);
      const stats = getTodayStats(user.id);
      const sisa = user.target_calories - stats.calories_in + stats.calories_out;
      
      replyText = `🍽️ *Makanan Terdeteksi!*\n\n` +
                  `🍲 Nama: *${result.item_name}*\n` +
                  `🔥 Kalori: +${result.calories} kcal\n` +
                  `🥑 Lemak: ${fat}g\n` +
                  `🍞 Karbohidrat: ${carbs}g\n` +
                  `🥩 Protein: ${protein}g\n\n` +
                  `✅ Berhasil dicatat.\n💡 Sisa kalori hari ini: *${sisa} kcal*`;
                  
      await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, replyText, { parse_mode: 'Markdown', reply_markup: keyboard });
    } else if (result.type === 'workout') {
      logWorkout(user.id, result.item_name, result.calories);
      const stats = getTodayStats(user.id);
      const sisa = user.target_calories - stats.calories_in + stats.calories_out;
      
      replyText = `🏃‍♂️ *Aktivitas Olahraga Terdeteksi!*\n\n` +
                  `Aktivitas: ${result.item_name}\n` +
                  `Kalori Terbakar: -${result.calories} kcal\n\n` +
                  `✅ Sisa kalori Anda bertambah menjadi: *${sisa} kcal*`;
                  
      await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, replyText, { parse_mode: 'Markdown', reply_markup: keyboard });
    } else {
      replyText = `🤔 Maaf, saya tidak bisa mengenali input tersebut. Coba perjelas lagi.`;
      await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, replyText, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error handling input:', error);
    await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, '❌ Terjadi kesalahan saat memproses menggunakan AI.');
  }
}

bot.on('message:photo', async (ctx) => {
  const user = getUser(ctx.from.id, ctx.from.first_name);
  if (user.onboarding_step !== 'completed') return ctx.reply('Selesaikan pendaftaran dulu (Ketik /start).');

  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const file = await ctx.api.getFile(photo.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
  
  await processInput(ctx, user, fileUrl, ctx.message.caption || '');
});

bot.on('message:text', async (ctx) => {
  let user = getUser(ctx.from.id, ctx.from.first_name);
  const text = ctx.message.text.trim();
  const lowerText = text.toLowerCase();

  switch (user.onboarding_step) {
    case 'ask_gender':
      if (lowerText === 'l' || lowerText === 'p') {
        updateUser(user.id, { gender: lowerText.toUpperCase(), onboarding_step: 'ask_age' });
        await ctx.reply("Berapa umur Anda (dalam tahun)? (Contoh: 25)");
      } else await ctx.reply("Mohon balas dengan huruf *L* untuk Laki-laki atau *P* untuk Perempuan.", { parse_mode: 'Markdown' });
      break;
      
    case 'ask_age':
      const age = parseInt(text);
      if (!isNaN(age) && age > 0) {
        updateUser(user.id, { age, onboarding_step: 'ask_weight' });
        await ctx.reply("Berapa berat badan Anda (dalam kg)? (Contoh: 70.5)");
      } else await ctx.reply("Mohon masukkan angka umur yang valid.");
      break;
      
    case 'ask_weight':
      const weight = parseFloat(text);
      if (!isNaN(weight) && weight > 0) {
        updateUser(user.id, { weight, onboarding_step: 'ask_height' });
        await ctx.reply("Berapa tinggi badan Anda (dalam cm)? (Contoh: 175)");
      } else await ctx.reply("Mohon masukkan angka berat yang valid.");
      break;
      
    case 'ask_height':
      const height = parseFloat(text);
      if (!isNaN(height) && height > 0) {
        updateUser(user.id, { height, onboarding_step: 'ask_activity' });
        await ctx.reply(
          "Seberapa sering Anda berolahraga dalam seminggu?\n" +
          "1: Jarang / Tidak pernah\n" +
          "2: 1-3 kali seminggu\n" +
          "3: 3-5 kali seminggu\n" +
          "4: Sangat aktif / Setiap hari\n\n" +
          "Ketik angka 1, 2, 3, atau 4."
        );
      } else await ctx.reply("Mohon masukkan angka tinggi badan yang valid.");
      break;

    case 'ask_activity':
      const activityMap = { '1': 1.2, '2': 1.375, '3': 1.55, '4': 1.725 };
      if (activityMap[text]) {
        const activity_level = activityMap[text];
        updateUser(user.id, { activity_level, onboarding_step: 'ask_target' });
        user = getUser(ctx.from.id, ctx.from.first_name);
        const { bmi, tdee } = calculateBMITDEE(user);
        
        await ctx.reply(
          `📊 Berdasarkan data Anda:\n` +
          `BMI: *${bmi}*\n` +
          `Estimasi Kalori Terbakar Harian (TDEE): *${tdee} kcal*\n\n` +
          `Berapa *Target Kalori Harian* Anda? (Contoh: 2000)`,
          { parse_mode: 'Markdown' }
        );
      } else await ctx.reply("Mohon ketik angka 1, 2, 3, atau 4.");
      break;

    case 'ask_target':
      const target = parseInt(text);
      if (!isNaN(target) && target > 0) {
        // Otomatis hitung target macro (Protein 30%, Carbs 35%, Fat 35%)
        const target_protein = Math.round((target * 0.3) / 4);
        const target_carbs = Math.round((target * 0.35) / 4);
        const target_fat = Math.round((target * 0.35) / 9);

        updateUser(user.id, { 
          target_calories: target, 
          target_protein,
          target_carbs,
          target_fat,
          onboarding_step: 'completed' 
        });

        await ctx.reply(
          "✅ Pendaftaran Selesai!\n\n" +
          "Target Makro Anda:\n" +
          `🥩 Protein: ${target_protein}g\n` +
          `🍞 Karbohidrat: ${target_carbs}g\n` +
          `🥑 Lemak: ${target_fat}g\n\n` +
          "Mulai lacak nutrisi Anda dengan mengirimkan *Foto Makanan* atau cukup *ketik teks* (misal: 'Makan nasi goreng 300 kalori').\n" +
          "Ketik /undo jika ingin menghapus log terakhir.",
          { parse_mode: 'Markdown' }
        );
      } else await ctx.reply("Mohon masukkan angka target kalori yang valid.");
      break;

    case 'completed':
    default:
      if (!text.startsWith('/')) {
        await processInput(ctx, user, null, text);
      }
      break;
  }
});

bot.catch((err) => {
  console.error(`Error while handling update ${err.ctx.update.update_id}:`);
  console.error(err.error);
});

console.log('🤖 Bot sedang berjalan...');
bot.start();

require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {});

const userSchema = new mongoose.Schema({
  userId: Number,
  chatId: Number,
  score: { type: Number, default: 0 },
  lastUsed: Date
});

const User = mongoose.model('User', userSchema);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Генерация случайного числа от -10 до 10
function getRandomNumber() {
  return Math.floor(Math.random() * 21) - 10; // 0-20 => -10-10
}

bot.command('dick', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('Эта команда работает только в групповых чатах!');
  }

  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    const user = await User.findOneAndUpdate(
      { userId, chatId },
      { $setOnInsert: { userId, chatId, score: 0 } },
      { new: true, upsert: true }
    );

    const now = new Date();
    const lastUsed = user.lastUsed || new Date(0);
    const diffHours = Math.abs(now - lastUsed) / 36e5;

    if (diffHours < 24) {
      const nextUse = new Date(lastUsed.getTime() + 24 * 60 * 60 * 1000);
      return ctx.reply(`Следующее использование будет доступно после: ${nextUse.toLocaleTimeString()}`);
    }

    const randomNumber = getRandomNumber();
    const newScore = user.score + randomNumber;
    
    await User.updateOne(
      { userId, chatId },
      { $set: { score: newScore, lastUsed: now } }
    );

    ctx.reply(
      `🎲 ${ctx.from.first_name}, твой член увеличисля на: ${randomNumber}\n` +
      `Его длина теперь: ${newScore}`
    );
  } catch (err) {
    console.error(err);
    ctx.reply('⚠️ Произошла ошибка при обработке запроса');
  }
});

bot.command('score', async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    const user = await User.findOne({ userId, chatId });
    const score = user ? user.score : 0;
    ctx.reply(`📊 ${ctx.from.first_name}, длина твоего члена: ${score}`);
  } catch (err) {
    console.error(err);
    ctx.reply('⚠️ Произошла ошибка при получении счета');
  }
});

// Новая команда для топ-игроков
bot.command('top', async (ctx) => {
    try {
      // Получаем топ-10 пользователей текущего чата
      const topUsers = await User.find({ chatId: ctx.chat.id })
        .sort({ score: -1 })
        .limit(10)
        .lean() // Конвертируем в простой JS-объект
        .exec();
  
      if (topUsers.length === 0) {
        return ctx.reply("😔 В этом чате пока нет участников рейтинга!");
      }
  
      // Собираем информацию о пользователях
      const topList = await Promise.all(
        topUsers.map(async (user, index) => {
          try {
            // Получаем информацию о пользователе из Telegram API
            const member = await ctx.telegram.getChatMember(ctx.chat.id, user.userId);
            const name = member.user.first_name || `Пользователь ${user.userId}`;
            return `${index + 1}. ${name}: ${user.score} см`;
          } catch (error) {
            console.error(`Ошибка получения данных пользователя ${user.userId}:`, error);
            return `${index + 1}. [Неизвестный пользователь]: ${user.score} баллов`;
          }
        })
      );
  
      // Формируем и отправляем сообщение
      const header = "🏆 Топ-10 игроков этого чата:\n\n";
      const message = header + topList.join("\n");
      
      await ctx.reply(message);
      
    } catch (error) {
      console.error("Ошибка в команде /top:", error);
      ctx.reply("⚠️ Произошла ошибка при формировании рейтинга. Попробуйте позже.");
    }
  });

bot.launch().then(() => console.log('Бот запущен'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
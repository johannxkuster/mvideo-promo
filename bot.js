import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);

const promoText = `
Приветствуем на борту «Скидколёта» от М.Видео. Здесь можно участвовать в розыгрыше билета в лето!

<b>Правила простые:</b>
1. Совершите покупку в любом магазине М.Видео на сумму от 5000₽ (пять тысячи рублей) в период распродажи White Friday (с 2 июня 2026 по 29 июня 2026)
2. Сохраните кассовый чек.
3. Нажмите кнопку «Зарегистрировать чек» и заполните данные чека.
4. Скачайте приложение партнёра <a href="https://12trip.onelink.me/dGRf/mvideo">OneTwoTrip</a>, зарегистрируйтесь с использованием номера телефона, который указали при регистрации чека, или авторизуйтесь в нём.
5. Ждите результатов розыгрыша в <a href="https://t.me/mvideoandeldorado">канале М.Видео</a>.

<b>Приз — сертификат на покупку билетов в онлайн-сервисе для путешествий OneTwoTrip на общую сумму 300 000 рублей!</b>

<b>К участию принимаются только чеки:</b>
— на сумму от 5000 ₽;
— с датой покупки с 02.06.2026 по 29.06.2026;
— из М.Видео;
— ранее не зарегистрированные в акции.

Нажимая кнопку «Зарегистрировать чек», вы принимаете <a href="https://disk.360.yandex.ru/i/1H4l-sNCUrOKFA">Правила акции</a> и даёте <a href="https://disk.360.yandex.ru/i/cprmrqCfXidNZg">Согласие на обработку персональных данных</a>.
`;

const webAppButton = Markup.inlineKeyboard([
  Markup.button.webApp('Зарегистрировать чек', process.env.WEBAPP_URL),
]);

bot.on('video', async (ctx) => {
  const fileId = ctx.message.video.file_id;

  console.log('VIDEO_FILE_ID:', fileId);

  await ctx.reply(
    [
      'Видео получил ✅',
      '',
      'file_id:',
      fileId,
    ].join('\n')
  );
});

bot.start(async (ctx) => {
  await ctx.reply(
    promoText,
    {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      link_preview_options: {
        is_disabled: true,
      },
      ...webAppButton,
    }
  );
});

bot.command('open', async (ctx) => {
  await ctx.reply(
    'Откройте мини-приложение, чтобы зарегистрировать чек.',
    {
      disable_web_page_preview: true,
      link_preview_options: {
        is_disabled: true,
      },
      ...webAppButton,
    }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply('Нажмите /start, чтобы открыть участие в розыгрыше.');
});

bot.catch((err) => {
  console.error('Bot error:', err);
});

bot.launch();

console.log('M.Video promo bot is running');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
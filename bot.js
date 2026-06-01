import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);

const promoText = `
Привет!

Участвуй в розыгрыше путешествия на Мальдивские острова от М.Видео.

Правила простые:

1. Соверши покупку в магазине М.Видео на сумму от 2 000 ₽ в период с 2 июня по 29 июня 2026 года.
2. Сохрани кассовый чек.
3. Нажми кнопку «Участвовать» и заполни данные чека.
4. Скачай приложение <a href="https://www.onetwotrip.com">ПАРТНЕРА</a>.
5. Жди результатов розыгрыша.

Главный приз — перелёт на Мальдивские острова и обратно.

Чем больше чеков ты зарегистрируешь, тем выше шанс на победу.

К участию принимаются только чеки:
— на сумму от 2 000 ₽;
— с датой покупки с 02.06.2026 по 29.06.2026;
— из магазинов М.Видео;
— ранее не зарегистрированные в акции.

Продолжая, ты принимаешь <a href="https://disk.yandex.ru/i/pravila-akcii-placeholder">Правила акции</a> и даёшь <a href="https://disk.yandex.ru/i/personal-data-placeholder">согласие на обработку персональных данных</a>.
`;

bot.start(async (ctx) => {
  await ctx.reply(
  promoText,
  {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    link_preview_options: {
      is_disabled: true,
    },
    ...Markup.inlineKeyboard([
      Markup.button.webApp('Участвовать', process.env.WEBAPP_URL),
    ]),
  }
);
});

bot.command('help', async (ctx) => {
  await ctx.reply('Нажми /start, чтобы открыть участие в розыгрыше.');
});

bot.catch((err) => {
  console.error('Bot error:', err);
});

bot.launch();

console.log('M.Video promo bot is running');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
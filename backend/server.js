import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fastify = Fastify({
  logger: true,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

await fastify.register(cors, {
  origin: true,
});

const SUBMISSIONS_FILE = path.join(process.cwd(), 'submissions.json');

async function readSubmissions() {
  try {
    const data = await fs.readFile(SUBMISSIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeSubmissions(submissions) {
  await fs.writeFile(
    SUBMISSIONS_FILE,
    JSON.stringify(submissions, null, 2),
    'utf-8'
  );
}

async function sendToGoogleSheets(submission) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

  if (!webhookUrl) {
    fastify.log.warn('GOOGLE_SHEETS_WEBHOOK_URL is not set');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(submission),
    });

    const text = await response.text();

    if (!response.ok) {
      fastify.log.error(
        {
          status: response.status,
          body: text,
        },
        'Google Sheets webhook error'
      );
      return;
    }

    fastify.log.info(
      {
        body: text,
      },
      'Submission sent to Google Sheets'
    );
  } catch (error) {
    fastify.log.error(error, 'Failed to send submission to Google Sheets');
  }
}

async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    fastify.log.warn('BOT_TOKEN is not set');
    return;
  }

  if (!chatId) {
    fastify.log.warn('chatId is empty');
    return;
  }

  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    link_preview_options: {
      is_disabled: true,
    },
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!response.ok) {
      fastify.log.error(result, 'Telegram sendMessage error');
      return;
    }

    fastify.log.info('Telegram message sent');
  } catch (error) {
    fastify.log.error(error, 'Failed to send Telegram message');
  }
}

function isDateInPromoRange(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const start = new Date('2026-06-02T00:00:00');
  const end = new Date('2026-06-29T23:59:59');

  return date >= start && date <= end;
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function calculateUserStats(submissions, telegramUserId) {
  if (!telegramUserId) {
    return {
      moderated: 0,
      passed: 0,
    };
  }

  const rejectedStatuses = [
    'duplicate',
    'amount_too_low',
    'date_out_of_range',
    'format_error',
    'wrong_store',
    'fns_invalid',
  ];

  const userSubmissions = submissions.filter((item) => {
    return String(item.telegramUserId || '') === String(telegramUserId || '');
  });

  return {
    moderated: userSubmissions.filter((item) => {
      return !rejectedStatuses.includes(item.status);
    }).length,

    passed: userSubmissions.filter((item) => {
      return item.status === 'fns_valid';
    }).length,
  };
}

fastify.get('/health', async () => {
  return {
    ok: true,
    service: 'mvideo-promo-backend',
  };
});

fastify.post('/api/submissions', async (request, reply) => {
  const body = request.body || {};
  const submissions = await readSubmissions();

  const submission = {
    id: crypto.randomUUID(),

    telegramUserId: body.telegramUser?.id || '',
    telegramUsername: body.telegramUser?.username || '',
    telegramFirstName: body.telegramUser?.first_name || '',
    telegramLastName: body.telegramUser?.last_name || '',

    firstName: String(body.firstName || '').trim(),
    lastName: String(body.lastName || '').trim(),
    phone: String(body.phone || '').trim(),

    receiptAmount: Number(body.receiptAmount),
    receiptDate: String(body.receiptDate || '').trim(),
    receiptTime: String(body.receiptTime || '').trim(),

    fn: normalizeDigits(body.fn),
    fd: normalizeDigits(body.fd),
    fp: normalizeDigits(body.fp),

    status: 'accepted',
    statusReason: '',

    createdAt: new Date().toISOString(),
  };

  if (!submission.firstName || !submission.lastName || !submission.phone) {
    submission.status = 'format_error';
    submission.statusReason = 'Не заполнены имя, фамилия или телефон.';
  } else if (!submission.receiptAmount || submission.receiptAmount < 5000) {
    submission.status = 'amount_too_low';
    submission.statusReason = 'Сумма чека меньше 5000 ₽.';
  } else if (!submission.receiptDate || !isDateInPromoRange(submission.receiptDate)) {
    submission.status = 'date_out_of_range';
    submission.statusReason = 'Дата покупки вне периода акции: 02.06.2026 — 29.06.2026.';
  } else if (!submission.fn || !submission.fd || !submission.fp) {
    submission.status = 'format_error';
    submission.statusReason = 'Не указаны ФН, ФД или ФП/ФПД.';
  } else {
    const duplicate = submissions.find((item) => {
      return (
        item.status === 'accepted' &&
        item.fn === submission.fn &&
        item.fd === submission.fd &&
        item.fp === submission.fp
      );
    });

    if (duplicate) {
      submission.status = 'duplicate';
      submission.statusReason = 'Этот чек уже был зарегистрирован.';
    }
  }

  submissions.push(submission);
  await writeSubmissions(submissions);
  await sendToGoogleSheets(submission);

  const messages = {
    accepted: 'Спасибо! Чек принят на предварительную проверку.',
    format_error: submission.statusReason,
    amount_too_low: 'Сумма чека должна быть от 5000 ₽.',
    date_out_of_range: 'Дата покупки должна быть с 02.06.2026 по 29.06.2026.',
    duplicate: 'Этот чек уже был зарегистрирован.',
    wrong_store: 'Этот чек не подходит для акции: чек не из М.Видео.',
    fns_invalid: 'Чек не прошёл проверку. Проверьте условия акции и попробуйте ещё раз.',
  };

  const isAccepted = submission.status === 'accepted';
  const stats = calculateUserStats(submissions, submission.telegramUserId);

  return reply.code(isAccepted ? 200 : 400).send({
    ok: isAccepted,
    status: submission.status,
    message: messages[submission.status] || submission.statusReason || 'Заявка обработана.',
    id: submission.id,
    stats,
  });
});

fastify.post('/api/my-checks', async (request, reply) => {
  const body = request.body || {};
  const telegramUserId = body.telegramUser?.id;

  if (!telegramUserId) {
    return reply.code(400).send({
      ok: false,
      message: 'Не удалось получить Telegram ID пользователя.',
      checks: [],
      stats: {
        moderated: 0,
        passed: 0,
      },
    });
  }

  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

  if (!webhookUrl) {
    return reply.code(500).send({
      ok: false,
      message: 'GOOGLE_SHEETS_WEBHOOK_URL is not set',
    });
  }

  try {
    const url = new URL(webhookUrl);
    url.searchParams.set('telegramUserId', String(telegramUserId));

    const response = await fetch(url.toString());
    const result = await response.json();

    if (!response.ok || !result.ok) {
      return reply.code(500).send({
        ok: false,
        message: result.message || 'Не удалось получить чеки из таблицы.',
        checks: [],
        stats: {
          moderated: 0,
          passed: 0,
        },
      });
    }

    return result;
  } catch (error) {
    fastify.log.error(error, 'Failed to load checks from Google Sheets');

    return reply.code(500).send({
      ok: false,
      message: 'Ошибка при загрузке чеков.',
      checks: [],
      stats: {
        moderated: 0,
        passed: 0,
      },
    });
  }
});

fastify.post('/api/finish', async (request, reply) => {
  const body = request.body || {};
  const telegramUserId = body.telegramUser?.id;

  await sendTelegramMessage(
    telegramUserId,
    [
      'Чек отправлен на проверку ✅',
      '',
      'Следите за анонсами в нашем Telegram-канале:',
      '@mvideoandeldorado',
      '',
      'Покупайте ещё и регистрируйте чеки — так вы повысите шансы на победу.',
    ].join('\n'),
    {
      inline_keyboard: [
        [
          {
            text: 'Зарегистрировать новый чек',
            web_app: {
              url: process.env.WEBAPP_URL,
            },
          },
        ],
      ],
    }
  );

  return {
    ok: true,
    message: 'Finish message sent',
  };
});

const port = Number(process.env.PORT || 3000);

fastify.listen({ port, host: '0.0.0.0' });
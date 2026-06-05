import { useMemo, useState } from 'react';
import './App.css';

function getTelegramUser() {
  const tg = window.Telegram?.WebApp;

  if (!tg) {
    return null;
  }

  tg.ready();
  tg.expand();

  return tg.initDataUnsafe?.user || null;
}

function getPartnerAppLink() {
  return 'https://12trip.onelink.me/dGRf/mvideo';
}

function normalizePhoneInput(value) {
  let digits = String(value || '').replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }

  if (digits.startsWith('9')) {
    digits = `7${digits}`;
  }

  if (!digits.startsWith('7')) {
    digits = `7${digits}`;
  }

  digits = digits.slice(0, 11);

  let result = '+7';
  const rest = digits.slice(1);

  if (rest.length > 0) {
    result += ` ${rest.slice(0, 3)}`;
  }

  if (rest.length > 3) {
    result += ` ${rest.slice(3, 6)}`;
  }

  if (rest.length > 6) {
    result += `-${rest.slice(6, 8)}`;
  }

  if (rest.length > 8) {
    result += `-${rest.slice(8, 10)}`;
  }

  return result;
}

function normalizeAmountInput(value) {
  let clean = String(value || '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');

  const parts = clean.split('.');

  if (parts.length > 2) {
    clean = `${parts[0]}.${parts.slice(1).join('')}`;
  }

  const [rubles, kopecks] = clean.split('.');

  if (kopecks !== undefined) {
    return `${rubles}.${kopecks.slice(0, 2)}`;
  }

  return rubles;
}

function onlyDigits(value, maxLength) {
  return String(value || '').replace(/\D/g, '').slice(0, maxLength);
}

function formatDateForView(value) {
  if (!value) {
    return '—';
  }

  const parts = String(value).split('-');

  if (parts.length !== 3) {
    return value;
  }

  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function getStatusLabel(status) {
  const labels = {
    accepted: 'На модерации',
    fns_pending: 'На модерации',
    manual_review: 'На ручной модерации',
    fns_valid: 'Прошёл модерацию',
    duplicate: 'Отклонено: дубль',
    amount_too_low: 'Отклонено: сумма меньше 5 000 ₽',
    date_out_of_range: 'Отклонено: дата вне акции',
    format_error: 'Отклонено: ошибка данных',
    wrong_store: 'Отклонено: чек не из М.Видео',
    fns_invalid: 'Отклонено: чек не прошёл проверку',
  };

  return labels[status] || status || '—';
}

function App() {
  const telegramUser = useMemo(() => getTelegramUser(), []);
  const partnerAppLink = useMemo(() => getPartnerAppLink(), []);

  const emptyForm = {
    firstName: '',
    lastName: '',
    phone: '',
    receiptAmount: '',
    receiptDate: '',
    fn: '',
    fd: '',
    fp: '',
  };

  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [screen, setScreen] = useState('form');
  const [invalidFields, setInvalidFields] = useState({});

  const [myChecks, setMyChecks] = useState([]);
  const [myStats, setMyStats] = useState({
    moderated: 0,
    passed: 0,
  });
  const [checksLoading, setChecksLoading] = useState(false);
  const [checksMessage, setChecksMessage] = useState('');

  function updateField(name, value) {
    setInvalidFields((prev) => ({
      ...prev,
      [name]: false,
    }));

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setMessage('');
    setInvalidFields({});
    setChecksMessage('');
    setScreen('form');
  }

  async function loadMyChecks() {
    setChecksLoading(true);
    setChecksMessage('Чеки загружаются, подождите...');

    try {
      const response = await fetch('/api/my-checks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          telegramUser,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setMyChecks([]);
        setMyStats({
          moderated: 0,
          passed: 0,
        });
        setChecksMessage(result.message || 'Не удалось загрузить ваши чеки.');
        return;
      }

      setMyChecks(result.checks || []);
      setMyStats(result.stats || {
        moderated: 0,
        passed: 0,
      });
      setChecksMessage('');
    } catch (error) {
      console.error(error);
      setMyChecks([]);
      setMyStats({
        moderated: 0,
        passed: 0,
      });
      setChecksMessage('Ошибка при загрузке чеков.');
    } finally {
      setChecksLoading(false);
    }
  }

  function openMyChecks() {
    setScreen('checks');
    loadMyChecks();
  }

  async function closeWebApp() {
    try {
      await fetch('/api/finish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          telegramUser,
        }),
      });
    } catch (error) {
      console.error(error);
    }

    const tg = window.Telegram?.WebApp;

    if (tg) {
      tg.close();
      return;
    }

    setMessage('Можно закрыть это окно и вернуться в Telegram.');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage('');

    const nextInvalidFields = {};

    if (!form.firstName) {
      nextInvalidFields.firstName = true;
    }

    if (!form.lastName) {
      nextInvalidFields.lastName = true;
    }

    if (!form.phone) {
      nextInvalidFields.phone = true;
    }

    const phoneDigits = form.phone.replace(/\D/g, '');

    if (form.phone && (phoneDigits.length !== 11 || !phoneDigits.startsWith('7'))) {
      nextInvalidFields.phone = true;
    }

    if (!form.receiptAmount) {
      nextInvalidFields.receiptAmount = true;
    }

    if (!form.receiptDate) {
      nextInvalidFields.receiptDate = true;
    }

    if (form.fn.length !== 16) {
      nextInvalidFields.fn = true;
    }

    if (form.fd.length < 4 || form.fd.length > 10) {
      nextInvalidFields.fd = true;
    }

    if (form.fp.length < 6 || form.fp.length > 10) {
      nextInvalidFields.fp = true;
    }

    if (Object.keys(nextInvalidFields).length > 0) {
      setInvalidFields(nextInvalidFields);
      setMessage('Заполнены не все поля.');
      return;
    }

    try {
      setMessage('Отправляем чек...');

      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          receiptTime: '',
          telegramUser,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.message || 'Не удалось отправить чек.');
        return;
      }

      setScreen('success');
      loadMyChecks();
    } catch (error) {
      console.error(error);
      setMessage('Ошибка соединения с сервером. Проверь, что backend запущен.');
    }
  }

  if (screen === 'checks') {
    return (
      <main className="page">
        <section className="card">
          <h1>Мои чеки</h1>

          {checksLoading && (
            <div className="loading-box">
              Чеки загружаются, подождите...
            </div>
          )}

          {checksMessage && !checksLoading && (
            <div className="message">
              {checksMessage}
            </div>
          )}

          <div className="stats-box">
            <div className="stats-title">Ваши чеки</div>
            <div>📝 Принято на модерацию: {myStats.moderated}</div>
            <div>✅ Прошли модерацию: {myStats.passed}</div>
          </div>

          <div className="checks-list">
            {!checksLoading && !checksMessage && myChecks.length === 0 && (
              <div className="message">У вас пока нет зарегистрированных чеков.</div>
            )}

            {!checksLoading && myChecks.map((check) => (
              <div className="check-card" key={check.id}>
                <div className="check-card-title">
                  Чек ФД: {check.fd || '—'}
                </div>
                <div>Сумма: {check.receiptAmount || '—'} ₽</div>
                <div>Дата: {formatDateForView(check.receiptDate)}</div>
                <div>Статус: {getStatusLabel(check.status)}</div>
                {check.statusReason && (
                  <div className="check-card-reason">
                    {check.statusReason}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="actions">
            <button type="button" onClick={resetForm}>
              Зарегистрировать новый чек
            </button>

            <button type="button" className="secondary-button" onClick={() => setScreen('form')}>
              Назад
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'success') {
    return (
      <main className="page">
        <section className="card success-card">
          <div className="success-icon">✓</div>

          <h1>Чек отправлен</h1>

          <p className="intro">
            Спасибо! Чек принят на проверку.
          </p>

          <div className="stats-box">
            <div className="stats-title">Ваши чеки</div>

            {checksLoading ? (
              <div>Чеки загружаются, подождите...</div>
            ) : (
              <>
                <div>📝 Принято на модерацию: {myStats.moderated}</div>
                <div>✅ Прошли модерацию: {myStats.passed}</div>
              </>
            )}
          </div>

          <div className="channel-box">
            <a href={partnerAppLink} target="_blank" rel="noreferrer">
              Скачайте
            </a>{' '}
            приложение партнёра — онлайн-сервиса для путешествий OneTwoTrip, чтобы выполнить условия акции, и зарегистрируйтесь в нём с номером телефона, который был указан при регистрации чека. Или авторизуйтесь в нём.
          </div>

          <div className="actions">
            <button type="button" className="secondary-button" onClick={resetForm}>
              Зарегистрировать ещё один чек
            </button>

            <button type="button" onClick={closeWebApp}>
              Завершить регистрацию
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Загрузите чек</h1>

        <p className="intro">
          Совершите покупку в М.Видео на сумму от 5000₽ (пяти тысяч рублей) в период распродажи White Friday с 02.06.2026 по 29.06.2026 и зарегистрируйте свой чек для участия в розыгрыше.
        </p>

        <button type="button" className="bubble-button" onClick={openMyChecks}>
          Мои чеки
        </button>

        <form onSubmit={handleSubmit} className="form">
          <div className="row">
            <label className={invalidFields.firstName ? 'invalid-label' : ''}>
              Имя
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
                placeholder="Иван"
              />
            </label>

            <label className={invalidFields.lastName ? 'invalid-label' : ''}>
              Фамилия
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => updateField('lastName', e.target.value)}
                placeholder="Иванов"
              />
            </label>
          </div>

          <label className={invalidFields.phone ? 'invalid-label' : ''}>
            Телефон
            <input
              type="tel"
              inputMode="tel"
              maxLength="16"
              value={form.phone}
              onChange={(e) => updateField('phone', normalizePhoneInput(e.target.value))}
              placeholder="+7 999 123-45-67"
            />
          </label>

          <div className="row">
            <label className={invalidFields.receiptAmount ? 'invalid-label' : ''}>
              Сумма чека, ₽
              <input
                type="text"
                inputMode="decimal"
                value={form.receiptAmount}
                onChange={(e) => updateField('receiptAmount', normalizeAmountInput(e.target.value))}
                placeholder="5000.00"
              />
            </label>

            <label className={invalidFields.receiptDate ? 'invalid-label' : ''}>
              Дата покупки
              <input
                type="date"
                value={form.receiptDate}
                onChange={(e) => updateField('receiptDate', e.target.value)}
              />
            </label>
          </div>

          <div className="hint">
            ФН, ФД и ФП/ФПД обычно находятся в нижней части чека.
          </div>

          <label className={invalidFields.fn ? 'invalid-label' : ''}>
            ФН
            <input
              type="text"
              inputMode="numeric"
              value={form.fn}
              onChange={(e) => updateField('fn', onlyDigits(e.target.value, 16))}
              placeholder="Например: 9999078900000000"
            />
          </label>

          <label className={invalidFields.fd ? 'invalid-label' : ''}>
            ФД
            <input
              type="text"
              inputMode="numeric"
              value={form.fd}
              onChange={(e) => updateField('fd', onlyDigits(e.target.value, 10))}
              placeholder="Например: 12345"
            />
          </label>

          <label className={invalidFields.fp ? 'invalid-label' : ''}>
            ФП / ФПД
            <input
              type="text"
              inputMode="numeric"
              value={form.fp}
              onChange={(e) => updateField('fp', onlyDigits(e.target.value, 10))}
              placeholder="Например: 1234567890"
            />
          </label>

          <button type="submit">Отправить чек</button>

          {message && <div className="message">{message}</div>}
        </form>
      </section>
    </main>
  );
}

export default App;

(() => {
  const $ = id => document.getElementById(id);
  const t = (ru, en) => globalThis.TgI18n?.t(ru, en) || ru;
  let data = null;
  let scope = 'recap';
  const date = key => new Intl.DateTimeFormat(globalThis.TgI18n?.lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
  const month = key => new Intl.DateTimeFormat(globalThis.TgI18n?.lang === 'en' ? 'en-US' : 'ru-RU', { month: 'long', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
  const number = value => new Intl.NumberFormat(globalThis.TgI18n?.lang === 'en' ? 'en-US' : 'ru-RU').format(value);
  const round = value => value < 10 ? t('до 10', 'under 10') : value < 100 ? t('десятки', 'tens') : value < 1000 ? t('сотни', 'hundreds') : value < 10000 ? t('тысячи', 'thousands') : t('десятки тысяч', 'tens of thousands');

  function stats(year) {
    const days = Object.entries(data.days).filter(([key]) => year === 'all' || key.startsWith(`${year}-`)).sort(([a], [b]) => a.localeCompare(b));
    const monthly = Array(12).fill(0), calendarMonths = new Map(), chats = {}, daily = [];
    let total = 0, own = 0, peak = { key: '', value: 0 }, streak = { length: 0, from: '', to: '' }, run = 0, runStart = '', previous = -2;
    for (const [key, records] of days) {
      let value = 0;
      for (const [id, pair] of Object.entries(records)) {
        const sum = pair[0] + pair[1]; value += sum; own += pair[0]; chats[id] = (chats[id] || 0) + sum;
      }
      total += value; monthly[Number(key.slice(5, 7)) - 1] += value;
      const monthKey = `${key.slice(0, 7)}-01`;
      calendarMonths.set(monthKey, (calendarMonths.get(monthKey) || 0) + value);
      if (value > peak.value) peak = { key, value };
      const day = Date.parse(`${key}T00:00:00Z`) / 86400000;
      run = day === previous + 1 ? run + 1 : 1;
      if (run === 1) runStart = key;
      if (run > streak.length) streak = { length: run, from: runStart, to: key };
      previous = day;
      daily.push(value);
    }
    const topMonth = monthly.indexOf(Math.max(...monthly));
    const topCalendarMonth = [...calendarMonths].sort((a, b) => b[1] - a[1])[0] || ['', 0];
    const topChats = Object.entries(chats).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { total, own, peak, streak, monthly: year === 'all' ? [...calendarMonths.values()] : monthly, topMonth: year === 'all' ? [...calendarMonths.keys()].indexOf(topCalendarMonth[0]) : topMonth, topMonthKey: topCalendarMonth[0], topChats, daily, activeDays: days.length, first: days[0]?.[0], last: days.at(-1)?.[0] };
  }

  function cards(year, s) {
    const hideNames = $('recap-hide-names').checked, hideCounts = $('recap-hide-counts').checked, hideDates = $('recap-hide-dates').checked;
    const n = value => hideCounts ? round(value) : number(value);
    const d = value => hideDates ? t('дата скрыта', 'date hidden') : date(value);
    const chatName = (id, index) => hideNames ? t(`Чат ${index + 1}`, `Chat ${index + 1}`) : data.chats[id] || t('Без названия', 'Untitled chat');
    return [
      { kicker: year === 'all' ? t('ВСЁ ВРЕМЯ В TELEGRAM', 'ALL TIME ON TELEGRAM') : t('ТВОЙ ГОД В TELEGRAM', 'YOUR TELEGRAM YEAR'), title: year === 'all' ? t('Всё время', 'All time') : String(year), big: n(s.total), unit: t('сообщений', 'messages'), detail: year === 'all' && !hideDates ? `${d(s.first)} — ${d(s.last)}` : t(`${n(s.activeDays)} активных дней`, `${n(s.activeDays)} active days`), accent: 'teal', bars: s.monthly },
      { kicker: t('САМЫЙ НАСЫЩЕННЫЙ МЕСЯЦ', 'BUSIEST MONTH'), title: hideDates ? t('Месяц скрыт', 'Month hidden') : year === 'all' ? new Intl.DateTimeFormat(globalThis.TgI18n?.lang === 'en' ? 'en-US' : 'ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${s.topMonthKey}T12:00:00Z`)) : month(`${year}-${String(s.topMonth + 1).padStart(2, '0')}-01`), big: n(s.monthly[s.topMonth]), unit: t('сообщений', 'messages'), detail: t('Вот когда общение набрало ход', 'This is when conversations took off'), accent: 'coral', bars: s.monthly },
      { kicker: t('РЕКОРДНЫЙ ДЕНЬ', 'RECORD DAY'), title: d(s.peak.key), big: n(s.peak.value), unit: t('сообщений за день', 'messages in one day'), detail: t('Твой пик активности', 'Your activity peak'), accent: 'gold', bars: s.daily },
      { kicker: t('СЕРИЯ ОБЩЕНИЯ', 'CONVERSATION STREAK'), title: t('Дни подряд', 'Days in a row'), big: n(s.streak.length), unit: t('дней с сообщениями', 'days with messages'), detail: hideDates ? t('Период скрыт', 'Period hidden') : `${d(s.streak.from)} — ${d(s.streak.to)}`, accent: 'teal', bars: s.daily },
      { kicker: t('САМЫЕ АКТИВНЫЕ ЧАТЫ', 'MOST ACTIVE CHATS'), title: t('Твоя тройка', 'Your top three'), big: s.topChats.length ? chatName(s.topChats[0][0], 0) : '—', unit: t('чат №1 по сообщениям', 'top chat by messages'), detail: s.topChats.map(([id, value], index) => `${index + 1}. ${chatName(id, index)} · ${n(value)}`).join('\n'), accent: 'coral', bars: s.topChats.map(([, value]) => value) },
      { kicker: t('ТВОЯ ДОЛЯ', 'YOUR SHARE'), title: t('Ты в диалогах', 'You in the conversation'), big: `${hideCounts ? Math.round(s.own / s.total * 10) * 10 : Math.round(s.own / s.total * 100)}%`, unit: t('сообщений от тебя', 'of messages from you'), detail: year === 'all' ? t(`${n(s.own)} твоих сообщений за всё время`, `${n(s.own)} messages from you overall`) : t(`${n(s.own)} твоих сообщений за год`, `${n(s.own)} messages from you this year`), accent: 'gold', bars: [s.own, s.total - s.own] },
    ];
  }

  function drawCard(card, year) {
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
    const c = canvas.getContext('2d');
    const colors = { teal: ['#d5e9e3', '#4aafb2'], coral: ['#f5d1c6', '#d77968'], gold: ['#f2dfb4', '#c5904b'] };
    const [light, strong] = colors[card.accent];
    const grad = c.createLinearGradient(0, 0, 1080, 1350); grad.addColorStop(0, '#fffaf1'); grad.addColorStop(.6, light); grad.addColorStop(1, '#f9e6d9'); c.fillStyle = grad; c.fillRect(0, 0, 1080, 1350);
    c.fillStyle = '#1d3036'; c.font = '700 28px Somic, Arial'; c.fillText('TELEGRAM · RECAP', 80, 105);
    c.fillStyle = strong; c.fillRect(80, 145, 920, 5);
    c.fillStyle = '#4b6266'; c.font = '700 27px Somic, Arial'; c.fillText(card.kicker, 80, 285);
    c.fillStyle = '#172b31'; c.font = '700 66px Somic, Arial'; wrap(c, card.title, 80, 390, 920, 78, 2);
    c.fillStyle = '#172b31'; let size = 154; do { c.font = `700 ${size}px Somic, Arial`; size -= 5; } while (c.measureText(card.big).width > 920 && size > 54);
    c.fillText(c.measureText(card.big).width > 920 ? `${card.big.slice(0, 24)}…` : card.big, 80, 690);
    c.fillStyle = '#3c595d'; c.font = '33px Somic, Arial'; c.fillText(card.unit, 85, 750);
    const values = card.bars.filter(v => v > 0); const sampled = values.length > 40 ? Array.from({ length: 40 }, (_, i) => Math.max(...values.slice(Math.floor(i * values.length / 40), Math.ceil((i + 1) * values.length / 40)))) : values;
    const max = Math.max(1, ...sampled); const gap = 7, width = (920 - gap * Math.max(0, sampled.length - 1)) / Math.max(1, sampled.length);
    sampled.forEach((value, i) => { c.fillStyle = strong; c.globalAlpha = .38 + .62 * value / max; c.fillRect(80 + i * (width + gap), 1000 - 170 * value / max, width, 170 * value / max); }); c.globalAlpha = 1;
    c.fillStyle = '#355155'; c.font = '28px Somic, Arial'; wrap(c, card.detail, 80, 1090, 920, 43, 4);
    c.fillStyle = '#627b7b'; c.font = '25px Somic, Arial'; c.fillText(`${year === 'all' ? t('ВСЁ ВРЕМЯ', 'ALL TIME') : year}  ·  TGACTIVITY`, 80, 1270);
    return canvas;
  }
  function wrap(c, text, x, y, maxWidth, height, maxLines) {
    let line = '', lines = 0;
    for (const word of text.replaceAll('\n', ' \n ').split(' ')) {
      if (word === '\n' || c.measureText(`${line} ${word}`).width > maxWidth) { if (line) c.fillText(line, x, y + height * lines++); line = ''; if (lines >= maxLines) break; }
      if (word !== '\n') line += `${line ? ' ' : ''}${word}`;
    }
    if (line && lines < maxLines) c.fillText(line, x, y + height * lines);
  }
  function save(card, year, index) {
    drawCard(card, year).toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `telegram-recap-${year === 'all' ? 'all-time' : year}-${index + 1}.png`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, 'image/png');
  }
  function render() {
    if (!data) return;
    const year = scope === 'alltime' ? 'all' : $('recap-year').value, root = $('recap-cards'); root.replaceChildren();
    $('recap-title').textContent = scope === 'alltime' ? t('За всё время', 'All time') : t('Итог года', 'Year in review');
    $('recap-eyebrow').textContent = scope === 'alltime' ? t('ВЕСЬ ЭКСПОРТ', 'FULL EXPORT') : t('ТВОЙ ГОД', 'YOUR YEAR');
    $('recap-year-wrap').hidden = scope === 'alltime';
    const s = stats(year);
    if (!s.total) return;
    cards(year, s).forEach((card, index) => {
      const article = document.createElement('article'); article.className = `recap-card recap-${card.accent}`;
      const kicker = document.createElement('span'); kicker.className = 'recap-kicker'; kicker.textContent = card.kicker;
      const title = document.createElement('h3'); title.textContent = card.title;
      const big = document.createElement('strong'); big.textContent = card.big;
      const unit = document.createElement('span'); unit.className = 'recap-unit'; unit.textContent = card.unit;
      const detail = document.createElement('p'); detail.textContent = card.detail;
      const bars = document.createElement('div'); bars.className = 'recap-mini-bars';
      const values = card.bars.length > 24 ? Array.from({ length: 24 }, (_, i) => Math.max(...card.bars.slice(Math.floor(i * card.bars.length / 24), Math.ceil((i + 1) * card.bars.length / 24)))) : card.bars;
      const max = Math.max(1, ...values);
      for (const value of values) { const bar = document.createElement('i'); bar.style.height = `${Math.max(5, value / max * 100)}%`; bars.append(bar); }
      const button = document.createElement('button'); button.type = 'button'; button.className = 'file-button'; button.textContent = t('Сохранить PNG', 'Save PNG'); button.addEventListener('click', () => save(card, year, index));
      article.append(kicker, title, big, unit, bars, detail, button); root.append(article);
    });
  }
  function open(view, scroll = true) {
    const recap = view === 'recap' || view === 'alltime';
    scope = view;
    $('recap-panel').hidden = !recap;
    $('dashboard-main').hidden = recap;
    $('recap-open').classList.toggle('is-active', view === 'recap');
    $('alltime-open').classList.toggle('is-active', view === 'alltime');
    $('dashboard-open').classList.toggle('is-active', !recap);
    document.body.classList.toggle('recap-mode', recap);
    if (recap) render();
    if (scroll) document.querySelector('.view-nav')?.scrollIntoView({ block: 'start' });
  }
  $('recap-open').addEventListener('click', () => open('recap'));
  $('alltime-open').addEventListener('click', () => open('alltime'));
  $('dashboard-open').addEventListener('click', () => open('dashboard'));
  $('recap-pdf').addEventListener('click', () => {
    document.body.classList.add('recap-print');
    globalThis.print?.();
  });
  globalThis.addEventListener?.('afterprint', () => document.body.classList.remove('recap-print'));
  for (const id of ['recap-year', 'recap-hide-names', 'recap-hide-counts', 'recap-hide-dates']) $(id).addEventListener('change', render);
  globalThis.TgRecap = {
    load(parsed) {
      data = parsed;
      const years = [...new Set(Object.keys(data.days).map(key => key.slice(0, 4)))].sort().reverse();
      $('recap-year').replaceChildren(...years.map(year => new Option(year, year)));
      $('recap-year').value = years[0];
      render();
    }, render, open,
  };
})();

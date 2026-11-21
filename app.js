(() => {
  const $ = id => document.getElementById(id);
  const i18n = globalThis.TgI18n || { lang: 'ru', t: ru => ru, setLanguage() {} };
  const tr = (ru, en) => i18n.t(ru, en);
  const count = value => new Intl.NumberFormat(i18n.lang === 'en' ? 'en-US' : 'ru-RU').format(value);
  const messageWord = value => i18n.lang === 'en' ? value === 1 ? 'message' : 'messages' : value % 10 === 1 && value % 100 !== 11 ? 'сообщение' : [2, 3, 4].includes(value % 10) && ![12, 13, 14].includes(value % 100) ? 'сообщения' : 'сообщений';
  const stopWords = new Set('это этот эта эти того тому там тут где когда как что кто кого кому меня тебе тебя нам вам они она оно его её ему их уже ещё тоже либо только чтобы просто очень который которая которые такой такая такие есть был была были быть для про при без под над или или если потом после перед через между потому поэтому иные также более менее сейчас сегодня завтра вчера здесь тогда туда сюда свой свои своё своим моя мой мои твой твоя твои наш наша ваши ваш одно одна один два три все всех всего весь сама сам самих самого самой либо вот даже ведь бы же ли не ни на за от до по из во со об ко то а и но да ну у о с к в мы вы он я ты мне мне нас вас им их ею ему при чем чем чем-то the and for with from this that have your you are was were will can not but they their all one two into about just more very then than when what who how why which where there here http https www com org ru'.split(/\s+/));
  const dayNo = key => Date.parse(`${key}T00:00:00Z`) / 86400000;
  const dayKey = no => new Date(no * 86400000).toISOString().slice(0, 10);
  const dateText = (key, options = { day: 'numeric', month: 'short', year: 'numeric' }) =>
    new Intl.DateTimeFormat(i18n.lang === 'en' ? 'en-US' : 'ru-RU', { timeZone: 'UTC', ...options }).format(new Date(`${key}T12:00:00Z`));
  const NS = 'http://www.w3.org/2000/svg';
  let data = null;
  let startDay = 0;
  let endDay = 0;
  let zoomDays = 90;
  let windowEnd = 0;
  let selectedPeak = null;
  let avatarUrl = null;
  const perChatViews = new Map();
  const perChatCards = new Map();
  let activeChatId = null;
  let recordRanges = {};
  let rankingTotals = {};
  let sourceFile = null;
  let wordCountsCache = null;
  let wordTimelineState = null;
  let replyCache = null;
  let stickerCache = null;
  let contextKey = '';
  let contextMessages = [];
  let contextPage = 0;
  let contextRequest = 0;

  function chatMatchesType(id) {
    const chosen = $('type-filter').value;
    const type = data?.chatTypes[id] || '';
    return chosen === 'all' || chosen === 'personal' && type === 'personal_chat' || chosen === 'bots' && type === 'bot_chat' || chosen === 'groups' && type.includes('group') || chosen === 'channels' && type.includes('channel');
  }
  function typeLabel() { return { all: tr('Все чаты', 'All chats'), personal: tr('Личные чаты', 'Personal chats'), groups: tr('Группы', 'Groups'), channels: tr('Каналы', 'Channels'), bots: tr('Боты', 'Bots') }[$('type-filter').value] || tr('Все чаты', 'All chats'); }

  const searchableChats = ['chat-filter', 'context-chat-filter', 'ranking-chat-filter', 'meme-chat-filter', 'word-chat-filter', 'reply-chat-filter', 'sticker-chat-filter'];
  function matchingChats(id, query) {
    const text = query.trim().toLocaleLowerCase('ru');
    return Object.entries(data?.chats || {}).filter(([chatId, name]) =>
      (id !== 'chat-filter' || chatMatchesType(chatId)) && name.toLocaleLowerCase('ru').includes(text))
      .sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }
  function filterChatChoices(id) {
    if (!data) return [];
    const select = $(id), chosen = select.value;
    const matches = matchingChats(id, $(`${id}-search`).value);
    const options = [new Option(tr('Все чаты', 'All chats'), 'all')];
    if (chosen !== 'all' && data.chats[chosen] && !matches.some(([chatId]) => chatId === chosen)) options.push(new Option(data.chats[chosen], chosen));
    for (const [chatId, name] of matches) options.push(new Option(name, chatId));
    if (!matches.length) { const empty = new Option(tr('Совпадений нет', 'No matches'), ''); empty.disabled = true; options.push(empty); }
    select.replaceChildren(...options);
    select.value = chosen;
    return matches;
  }
  function resetChatSearch(id) {
    $(`${id}-search`).value = '';
    filterChatChoices(id);
  }

  function messageWords(message, skipCommon = true) {
    const content = typeof message.text === 'string' ? message.text : Array.isArray(message.text)
      ? message.text.map(part => typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '').join(' ') : '';
    const words = content.toLocaleLowerCase('ru').replace(/(?:https?:\/\/|www\.)\S+/gu, ' ').replace(/(?:^|\s)\/[\p{L}\p{N}_]+/gu, ' ').match(/[\p{L}]{2,}/gu) || [];
    return skipCommon ? words.filter(word => word.length >= 3 && !stopWords.has(word)) : words;
  }

  async function readSource() { return JSON.parse(await sourceFile.text()); }

  function parseExport(raw) {
    const chats = raw?.chats?.list;
    if (!Array.isArray(chats)) throw new Error(tr('Не найден раздел chats.list. Нужен result.json из экспорта Telegram Desktop.', 'The chats.list section is missing. Choose a Telegram Desktop result.json export.'));
    const userId = raw?.personal_information?.user_id;
    const ownId = userId == null ? null : `user${userId}`;
    const parsed = {
      chats: {}, chatTypes: {}, days: {}, hours: {},
      ownId,
      profileName: [raw?.personal_information?.first_name, raw?.personal_information?.last_name].filter(Boolean).join(' '),
      profilePhoto: Array.isArray(raw?.profile_pictures) ? raw.profile_pictures[0]?.photo : null,
    };
    let messages = 0;
    for (const chat of chats) {
      if (!Array.isArray(chat.messages)) continue;
      const id = String(chat.id ?? chat.name ?? Object.keys(parsed.chats).length);
      parsed.chats[id] = chat.name || tr('Без названия', 'Untitled chat');
      parsed.chatTypes[id] = chat.type || '';
      for (const message of chat.messages) {
        if (message.type !== 'message' || !/^\d{4}-\d\d-\d\d/.test(message.date || '')) continue;
        const key = message.date.slice(0, 10);
        const record = parsed.days[key] ||= {};
        const pair = record[id] ||= [0, 0];
        const senderIndex = ownId && message.from_id === ownId ? 0 : 1;
        pair[senderIndex]++;
        const hour = Number(message.date.slice(11, 13));
        if (Number.isInteger(hour) && hour >= 0 && hour < 24) {
          const hours = (parsed.hours[key] ||= {})[id] ||= Array.from({ length: 24 }, () => [0, 0]);
          hours[hour][senderIndex]++;
        }
        messages++;
      }
    }
    if (!messages) throw new Error(tr('В экспорте нет сообщений с датами.', 'The export has no dated messages.'));
    parsed.ownKnown = !!ownId;
    return parsed;
  }

  function selectedBounds(view = { zoomDays, windowEnd }) {
    const first = Math.max(startDay, view.windowEnd - view.zoomDays + 1);
    return [first, view.windowEnd];
  }

  function spanRecords(first, last, selectedChat = 'all') {
    const daily = [], totals = {};
    let own = 0, other = 0, peak = { key: '', total: 0 };
    for (let day = first; day <= last; day++) {
      const key = dayKey(day), records = data.days[key] || {};
      let dayOwn = 0, dayOther = 0;
      for (const [id, pair] of Object.entries(records)) {
        if ((selectedChat !== 'all' && id !== selectedChat) || !chatMatchesType(id)) continue;
        dayOwn += pair[0]; dayOther += pair[1];
        const result = totals[id] ||= [0, 0];
        result[0] += pair[0]; result[1] += pair[1];
      }
      own += dayOwn; other += dayOther;
      const total = dayOwn + dayOther;
      if (total > peak.total) peak = { key, total };
      daily.push({ key, own: dayOwn, total });
    }
    return { daily, totals, own, other, peak };
  }

  function groupSeries(daily) {
    const step = $('step-filter').value;
    const groups = new Map();
    for (const point of daily) {
      let key = point.key;
      if (step === 'week') key = dayKey(dayNo(key) - ((new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7));
      if (step === 'month') key = `${key.slice(0, 7)}-01`;
      const item = groups.get(key) || { key, startKey: point.key, endKey: point.key, own: 0, total: 0 };
      item.own += point.own; item.total += point.total;
      item.endKey = point.key;
      groups.set(key, item);
    }
    return [...groups.values()];
  }

  function svgElement(svg, tag, attrs) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.appendChild(node);
    return node;
  }

  function linePath(points, yKey, baseline) {
    if (!points.length) return '';
    let d = `M ${points[0].x} ${points[0][yKey]}`;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], third = (b.x - a.x) / 3;
      d += ` C ${a.x + third} ${a[yKey]}, ${b.x - third} ${b[yKey]}, ${b.x} ${b[yKey]}`;
    }
    if (baseline != null) d += ` L ${points.at(-1).x} ${baseline} L ${points[0].x} ${baseline} Z`;
    return d;
  }

  function drawChart(svg, tooltip, series, commonCeiling = null, chatId = 'all', firstDay = null, lastDay = null) {
    svg.replaceChildren();
    const left = 40, right = 980, top = 20, bottom = 278;
    const max = Math.max(1, ...series.map(point => point.total));
    const ceiling = commonCeiling ?? Math.max(4, Math.ceil(max / 4) * 4);
    for (let index = 0; index <= 4; index++) {
      const lines = 4;
      const y = bottom - (bottom - top) * index / lines;
      svgElement(svg, 'line', { x1: left, x2: right, y1: y, y2: y, class: 'grid-line' });
      const label = svgElement(svg, 'text', { x: 31, y: y + 4, 'text-anchor': 'end', class: 'grid-label' });
      label.textContent = count(ceiling * index / lines);
    }
    if (firstDay !== null && lastDay !== null && lastDay - firstDay < 21) {
      const days = lastDay - firstDay + 1;
      for (let index = 0; index < days; index++) {
        const x = days === 1 ? (left + right) / 2 : left + (right - left) * index / (days - 1);
        svgElement(svg, 'line', { x1: x, x2: x, y1: top, y2: bottom, class: 'day-marker' });
        const label = svgElement(svg, 'text', { x, y: 307, 'text-anchor': 'middle', class: 'day-marker-label' });
        label.textContent = dateText(dayKey(firstDay + index), { day: '2-digit', month: '2-digit' });
      }
    }
    const points = series.map((item, index) => ({ ...item,
      x: series.length === 1 ? (left + right) / 2 : left + (right - left) * index / (series.length - 1),
      y: bottom - item.total / ceiling * (bottom - top),
      ownY: bottom - item.own / ceiling * (bottom - top),
    }));
    svgElement(svg, 'path', { d: linePath(points, 'y', bottom), class: 'area-path' });
    svgElement(svg, 'path', { d: linePath(points, 'y'), class: 'all-path' });
    svgElement(svg, 'path', { d: linePath(points, 'ownY'), class: 'own-path' });
    if (points.length === 1) svgElement(svg, 'circle', { cx: points[0].x, cy: points[0].y, r: 6, class: 'single-point' });
    const guide = svgElement(svg, 'line', { x1: 0, x2: 0, y1: top, y2: bottom, class: 'hover-guide', visibility: 'hidden' });
    const dot = svgElement(svg, 'circle', { cx: 0, cy: 0, r: 6, class: 'hover-dot', visibility: 'hidden' });
    const pointAt = event => {
      const rect = svg.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width * 1000;
      const index = points.length === 1 ? 0 : Math.max(0, Math.min(points.length - 1, Math.round((x - left) / (right - left) * (points.length - 1))));
      return { point: points[index], rect };
    };
    svg.onpointermove = event => {
      if (!points.length) return;
      const { point, rect } = pointAt(event);
      guide.setAttribute('x1', point.x); guide.setAttribute('x2', point.x); guide.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', point.x); dot.setAttribute('cy', point.y); dot.setAttribute('visibility', 'visible');
      tooltip.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = $('step-filter').value === 'month' ? dateText(point.key, { month: 'long', year: 'numeric' }) : dateText(point.key);
      const details = document.createElement('span');
      details.textContent = tr(`Всего ${count(point.total)} · твои ${count(point.own)} · остальные ${count(point.total - point.own)}`, `Total ${count(point.total)} · yours ${count(point.own)} · others ${count(point.total - point.own)}`);
      tooltip.append(title, details);
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(8, Math.min(rect.width - 235, point.x / 1000 * rect.width - 105))}px`;
      tooltip.style.top = `${Math.max(0, point.y / 320 * rect.height - 76)}px`;
    };
    svg.onpointerleave = () => {
      guide.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tooltip.hidden = true;
    };
    svg.onclick = event => {
      if (!points.length) return;
      const { point } = pointAt(event);
      selectedPeak = { start: point.startKey, end: point.endKey, chatId };
      renderPeakDetail();
    };
  }

  function renderRanking(totals) {
    const root = $('ranking'); root.replaceChildren();
    const chosen = $('ranking-chat-filter').value;
    const entries = Object.entries(totals).filter(([id]) => chosen === 'all' || id === chosen)
      .map(([id, pair]) => ({ id, total: pair[0] + pair[1] }))
      .sort((a, b) => b.total - a.total).slice(0, 10);
    if (!entries.length) { root.textContent = tr('В этом периоде сообщений нет.', 'No messages in this period.'); return; }
    const max = entries[0].total;
    entries.forEach((item, index) => {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'rank-row';
      const position = document.createElement('span'); position.className = 'rank-position'; position.textContent = String(index + 1).padStart(2, '0');
      const body = document.createElement('span'); body.className = 'rank-body';
      const name = document.createElement('span'); name.className = 'rank-name'; name.textContent = data.chats[item.id] || tr('Без названия', 'Untitled chat');
      const bar = document.createElement('span'); bar.className = 'rank-bar'; bar.style.width = `${item.total / max * 100}%`;
      body.append(name, bar);
      const value = document.createElement('strong'); value.textContent = count(item.total);
      row.append(position, body, value);
      row.title = tr('Показать чат на общем графике', 'Show this chat on the main chart');
      row.onclick = () => { $('mode-filter').value = 'one'; resetChatSearch('chat-filter'); $('chat-filter').value = item.id; render(); document.querySelector('.chart-panel').scrollIntoView({ behavior: 'smooth' }); };
      root.appendChild(row);
    });
  }

  async function buildWordCounts() {
    if (wordCountsCache) return wordCountsCache;
    const raw = await readSource();
    const result = {};
    for (const chat of raw.chats?.list || []) {
      const id = String(chat.id ?? chat.name ?? '');
      const counts = result[id] ||= {};
      for (const message of chat.messages || []) {
        if (message.type !== 'message') continue;
        for (const word of messageWords(message)) counts[word] = (counts[word] || 0) + 1;
      }
    }
    wordCountsCache = result;
    return result;
  }

  async function renderMemeDirectory() {
    const root = $('meme-results'); root.replaceChildren();
    const chat = $('meme-chat-filter').value;
    const limit = Number($('meme-limit').value) || 10;
    $('meme-status').textContent = tr('Считаем слова…', 'Counting words…');
    let wordCounts;
    try { wordCounts = await buildWordCounts(); }
    catch (error) { $('meme-status').textContent = tr(`Не удалось прочитать экспорт: ${error.message}`, `Could not read the export: ${error.message}`); return; }
    const totals = {};
    const sources = chat === 'all' ? Object.values(wordCounts) : [wordCounts[chat] || {}];
    for (const source of sources) for (const [word, value] of Object.entries(source)) totals[word] = (totals[word] || 0) + value;
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).slice(0, limit);
    if (!entries.length) { $('meme-status').textContent = tr('В этом чате нет текстовых сообщений с подходящими словами.', 'No matching words were found in this chat.'); return; }
    $('meme-status').textContent = tr(`Топ‑${entries.length}: ${chat === 'all' ? 'все чаты' : data.chats[chat] || 'чат'}. Считаются повторения слов за весь экспорт.`, `Top ${entries.length}: ${chat === 'all' ? 'all chats' : data.chats[chat] || 'chat'}. Repeated words are counted across the full export.`);
    const max = entries[0][1];
    entries.forEach(([word, value], index) => {
      const row = document.createElement('div'); row.className = 'meme-row';
      const rank = document.createElement('span'); rank.className = 'meme-rank'; rank.textContent = String(index + 1).padStart(2, '0');
      const label = document.createElement('strong'); label.textContent = word;
      const track = document.createElement('span'); track.className = 'meme-track';
      const fill = document.createElement('i'); fill.style.width = `${value / max * 100}%`; track.append(fill);
      const amount = document.createElement('span'); amount.className = 'meme-count'; amount.textContent = count(value);
      row.append(rank, label, track, amount); root.append(row);
    });
  }

  function clearMemeDirectory() {
    $('meme-results').replaceChildren();
    $('meme-status').textContent = tr('Нажми «Собрать слова», чтобы увидеть новый топ.', 'Click “Count words” to see a new ranking.');
  }

  async function renderWordTimeline() {
    const root = $('word-results'); root.replaceChildren();
    wordTimelineState = null;
    const word = $('word-query').value.trim().toLocaleLowerCase('ru');
    if (!/^[\p{L}]{2,}$/u.test(word)) { $('word-status').textContent = tr('Введи одно слово минимум из двух букв.', 'Enter one word with at least two letters.'); return; }
    const chosen = $('word-chat-filter').value;
    $('word-status').textContent = tr('Ищем слово в экспорте…', 'Searching the export…');
    let raw;
    try { raw = await readSource(); }
    catch (error) { $('word-status').textContent = tr(`Не удалось прочитать экспорт: ${error.message}`, `Could not read the export: ${error.message}`); return; }
    const days = {};
    for (const chat of raw.chats?.list || []) {
      const id = String(chat.id ?? chat.name ?? '');
      if (chosen !== 'all' && id !== chosen) continue;
      for (const message of chat.messages || []) {
        if (message.type !== 'message' || !message.date) continue;
        const hits = messageWords(message, false).filter(item => item === word).length;
        if (hits) days[message.date.slice(0, 10)] = (days[message.date.slice(0, 10)] || 0) + hits;
      }
    }
    const entries = Object.entries(days).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15);
    if (!entries.length) { $('word-status').textContent = tr(`Слово «${word}» не найдено.`, `“${word}” was not found.`); return; }
    const total = Object.values(days).reduce((sum, value) => sum + value, 0);
    wordTimelineState = { word, total, days: Object.keys(days).length };
    $('word-status').textContent = tr(`«${word}» встретилось ${count(total)} раз в ${count(Object.keys(days).length)} днях. Ниже — самые активные даты.`, `“${word}” appeared ${count(total)} times across ${count(Object.keys(days).length)} days. The busiest dates are below.`);
    const max = entries[0][1];
    for (const [key, value] of entries) {
      const row = document.createElement('div'); row.className = 'analysis-row';
      const label = document.createElement('strong'); label.textContent = dateText(key); row.dataset.date = key;
      const track = document.createElement('span'); track.className = 'analysis-track';
      const fill = document.createElement('i'); fill.style.width = `${value / max * 100}%`; track.append(fill);
      const amount = document.createElement('span'); amount.textContent = count(value);
      row.append(label, track, amount); root.append(row);
    }
  }

  function durationText(minutes) {
    if (!Number.isFinite(minutes)) return '—';
    const seconds = Math.round(minutes * 60);
    if (seconds < 60) return tr(`${seconds} сек`, `${seconds} sec`);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds % 86400 / 3600);
    const mins = Math.floor(seconds % 3600 / 60);
    const secs = seconds % 60;
    return [days ? tr(`${days} дн`, `${days} d`) : '', hours ? tr(`${hours} ч`, `${hours} h`) : '', mins || hours || days ? tr(`${mins} мин`, `${mins} min`) : '', secs ? tr(`${secs} сек`, `${secs} sec`) : ''].filter(Boolean).join(' ');
  }

  function medianDuration(values) {
    if (!values.length) return NaN;
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  async function renderReplyTimes() {
    const root = $('reply-results'); root.replaceChildren();
    $('reply-status').textContent = tr('Считаем интервалы между ответами…', 'Calculating reply gaps…');
    if (!replyCache) {
      let raw;
      try { raw = await readSource(); }
      catch (error) { $('reply-status').textContent = tr(`Не удалось прочитать экспорт: ${error.message}`, `Could not read the export: ${error.message}`); return; }
      const ownId = raw.personal_information?.user_id == null ? null : `user${raw.personal_information.user_id}`;
      const result = {};
      for (const chat of raw.chats?.list || []) {
        const id = String(chat.id ?? chat.name ?? '');
        const messages = (chat.messages || []).filter(message => message.type === 'message' && message.date).map(message => ({
          id: message.id,
          replyTo: message.reply_to_message_id,
          time: message.date_unixtime ? Number(message.date_unixtime) * 1000 : Date.parse(message.date),
          side: ownId && message.from_id === ownId ? 'own' : 'other',
        })).filter(item => Number.isFinite(item.time)).sort((a, b) => a.time - b.time);
        const byId = new Map(messages.filter(item => item.id != null).map(item => [String(item.id), item]));
        const makeBand = () => ({ total: 0, count: 0, values: [] });
        const makeSide = () => ({ all: makeBand(), instant: makeBand(), long: makeBand(), overDay: 0, overWeek: 0, excluded: 0 });
        const stats = result[id] = { own: makeSide(), other: makeSide(), direct: 0, inferred: 0 };
        let previous = null;
        const maxMinutes = chat.type === 'personal_chat' ? 43200 : 360;
        for (const item of messages) {
          const referenced = item.replyTo == null ? null : byId.get(String(item.replyTo));
          const base = referenced || (item.replyTo == null ? previous : null);
          if (base && item.side !== base.side) {
            const minutes = (item.time - base.time) / 60000;
            if (minutes > 0 && minutes <= (referenced ? 43200 : maxMinutes)) {
              const side = stats[item.side];
              side.all.total += minutes; side.all.count++; side.all.values.push(minutes);
              if (minutes > 1440) side.overDay++;
              if (minutes > 10080) side.overWeek++;
              stats[referenced ? 'direct' : 'inferred']++;
              const band = minutes <= 1 ? side.instant : minutes > 60 ? side.long : null;
              if (band) { band.total += minutes; band.count++; band.values.push(minutes); }
            } else if (minutes > 0) stats[item.side].excluded++;
          }
          previous = item;
        }
      }
      replyCache = result;
    }
    const chosen = $('reply-chat-filter').value;
    const sampleCount = stats => stats.own.all.count + stats.other.all.count;
    const entries = Object.entries(replyCache).filter(([id, stats]) => (chosen === 'all' || id === chosen) && sampleCount(stats) > 0)
      .sort((a, b) => sampleCount(b[1]) - sampleCount(a[1]));
    if (!entries.length) { $('reply-status').textContent = tr('Для выбранного чата нет подходящих пар ответов.', 'No matching reply pairs were found in this chat.'); return; }
    $('reply-status').textContent = tr(`Чатов с паузами: ${count(entries.length)}. В личных чатах учитываем до 30 дней, в остальных — до 6 часов. Без прямой ссылки на сообщение это оценка по смене отправителя.`, `Chats with reply gaps: ${count(entries.length)}. We include up to 30 days in personal chats and 6 hours elsewhere. Without a direct reply link, this is an estimate based on sender changes.`);
    for (const [id, stats] of entries) {
      const row = document.createElement('div'); row.className = 'reply-row';
      const name = document.createElement('strong'); name.textContent = data.chats[id] || tr('Без названия', 'Untitled chat');
      row.append(name);
      const evidence = document.createElement('small'); evidence.className = 'reply-evidence';
      evidence.textContent = tr(`По ссылке на сообщение: ${count(stats.direct)} · по смене отправителя: ${count(stats.inferred)}`, `Direct reply links: ${count(stats.direct)} · sender changes: ${count(stats.inferred)}`);
      for (const [side, heading] of [['own', tr('Твои ответы', 'Your replies')], ['other', tr('Ответы собеседника / других', 'Replies from others')]]) {
        const section = document.createElement('div'); section.className = 'reply-side';
        const sectionTitle = document.createElement('h3'); sectionTitle.textContent = heading;
        const metrics = document.createElement('div'); metrics.className = 'reply-metrics';
        for (const [key, label] of [['instant', tr('Быстрый ответ', 'Quick reply')], ['long', tr('Долгий ответ', 'Long reply')], ['all', tr('Все ответы', 'All replies')]]) {
          const samples = stats[side][key].count;
          const card = document.createElement('div'); card.className = 'reply-metric';
          const title = document.createElement('span'); title.textContent = key === 'all' ? tr('Типичная пауза', 'Typical gap') : label;
          const value = document.createElement('strong'); value.textContent = durationText(key === 'all' ? medianDuration(stats[side].all.values) : stats[side][key].total / samples);
          const hint = document.createElement('small'); hint.textContent = `${key === 'instant' ? tr('среднее до 1 минуты', 'mean under 1 minute') : key === 'long' ? tr('среднее больше 1 часа', 'mean over 1 hour') : tr(`среднее: ${durationText(stats[side].all.total / stats[side].all.count)}`, `mean: ${durationText(stats[side].all.total / stats[side].all.count)}`)} · ${count(samples)} ${messageWord(samples)}`;
          card.append(title, value, hint); metrics.append(card);
        }
        section.append(sectionTitle, metrics);
        const gaps = document.createElement('small'); gaps.className = 'reply-evidence';
        gaps.textContent = tr(`Паузы более дня: ${count(stats[side].overDay)} · более недели: ${count(stats[side].overWeek)} · длиннее лимита: ${count(stats[side].excluded)}`, `Gaps over a day: ${count(stats[side].overDay)} · over a week: ${count(stats[side].overWeek)} · beyond the limit: ${count(stats[side].excluded)}`);
        section.append(gaps); row.append(section);
      }
      row.append(evidence);
      root.append(row);
    }
  }

  async function renderStickers() {
    const root = $('sticker-results'); root.replaceChildren();
    $('sticker-summary').hidden = true;
    $('sticker-status').textContent = tr('Считаем стикеры в экспорте…', 'Counting stickers in the export…');
    if (!stickerCache) {
      let raw;
      try { raw = await readSource(); }
      catch (error) { $('sticker-status').textContent = tr(`Не удалось прочитать экспорт: ${error.message}`, `Could not read the export: ${error.message}`); return; }
      const ownId = raw.personal_information?.user_id == null ? null : `user${raw.personal_information.user_id}`;
      const counts = {};
      for (const chat of raw.chats?.list || []) {
        const id = String(chat.id ?? chat.name ?? '');
        const senders = counts[id] = {};
        for (const message of chat.messages || []) {
          if (message.type !== 'message' || message.media_type !== 'sticker') continue;
          const senderId = String(message.from_id || message.from || 'unknown');
          const entry = senders[senderId] ||= { name: senderId === ownId ? tr('Ты', 'You') : message.from || tr('Неизвестный отправитель', 'Unknown sender'), count: 0 };
          entry.count++;
        }
      }
      stickerCache = counts;
    }
    const chosen = $('sticker-chat-filter').value;
    const senders = {};
    for (const [id, people] of Object.entries(stickerCache)) {
      if (chosen !== 'all' && chosen !== id) continue;
      for (const [senderId, entry] of Object.entries(people)) {
        const target = senders[senderId] ||= { name: entry.name, count: 0 };
        target.count += entry.count;
      }
    }
    const entries = Object.values(senders).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'));
    const total = entries.reduce((sum, entry) => sum + entry.count, 0);
    if (!total) { $('sticker-status').textContent = tr('В выбранном чате стикеров в экспорте нет.', 'No stickers were found in this chat.'); return; }
    $('sticker-status').textContent = chosen === 'all' ? tr('Все чаты', 'All chats') : data.chats[chosen] || tr('Чат', 'Chat');
    $('sticker-summary').textContent = tr(`Всего стикеров: ${count(total)} · отправителей: ${count(entries.length)}`, `Stickers: ${count(total)} · senders: ${count(entries.length)}`);
    $('sticker-summary').hidden = false;
    const max = entries[0].count;
    for (const entry of entries.slice(0, 20)) {
      const row = document.createElement('div'); row.className = 'analysis-row sticker-row';
      const name = document.createElement('strong'); name.textContent = entry.name === 'Ты' || entry.name === 'You' ? tr('Ты', 'You') : entry.name;
      const track = document.createElement('span'); track.className = 'analysis-track';
      const fill = document.createElement('i'); fill.style.width = `${entry.count / max * 100}%`; track.append(fill);
      const amount = document.createElement('span'); amount.textContent = count(entry.count);
      row.append(name, track, amount); root.append(row);
    }
  }

  function renderPerChat(first, last, totals) {
    const root = $('chat-charts'); root.replaceChildren();
    perChatCards.clear();
    const entries = Object.keys(data.chats).filter(chatMatchesType).map(id => ({ id, total: (totals[id]?.[0] || 0) + (totals[id]?.[1] || 0) }))
      .sort((a, b) => b.total - a.total || (data.chats[a.id] || '').localeCompare(data.chats[b.id] || '', 'ru'));
    if (!entries.length) { root.textContent = tr('В этом периоде сообщений нет.', 'No messages in this period.'); return; }
    if (!activeChatId || !Object.hasOwn(data.chats, activeChatId)) activeChatId = entries[0].id;
    for (const entry of entries) {
      const card = document.createElement('section'); card.className = 'chat-chart-card';
      card.dataset.chatId = entry.id;
      if (entry.id === activeChatId) card.className += ' is-active';
      card.addEventListener('pointerdown', () => setActiveChat(entry.id));
      card.addEventListener('pointerenter', () => setActiveChat(entry.id));
      const header = document.createElement('div'); header.className = 'chat-chart-header';
      const title = document.createElement('h3'); title.textContent = data.chats[entry.id] || tr('Без названия', 'Untitled chat');
      const value = document.createElement('strong');
      header.append(title, value);
      const wrap = document.createElement('div'); wrap.className = 'chart-wrap';
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 1000 320'); svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', tr(`Активность: ${title.textContent}`, `Activity: ${title.textContent}`));
      const tooltip = document.createElement('div'); tooltip.className = 'tooltip'; tooltip.hidden = true;
      wrap.append(svg, tooltip);
      const footer = document.createElement('div'); footer.className = 'chart-footer';
      const from = document.createElement('span');
      const to = document.createElement('span');
      footer.append(from, to);
      const pan = document.createElement('div'); pan.className = 'timeline-scroll';
      pan.setAttribute('role', 'scrollbar'); pan.setAttribute('tabindex', '0'); pan.setAttribute('aria-label', tr(`Прокрутить график: ${title.textContent}`, `Scroll chart: ${title.textContent}`));
      const panContent = document.createElement('div'); panContent.className = 'timeline-scroll-content'; pan.append(panContent);
      pan.addEventListener('scroll', () => {
        const view = perChatViews.get(entry.id);
        const nextEnd = Math.min(endDay, startDay + Math.round(pan.scrollLeft / 8) + view.zoomDays - 1);
        if (nextEnd === view.windowEnd) return;
        view.windowEnd = nextEnd;
        setActiveChat(entry.id);
        drawPerChat(entry.id);
        updateZoomControls();
      });
      card.append(header, wrap, footer, pan); root.appendChild(card);
      if (!perChatViews.has(entry.id)) perChatViews.set(entry.id, { zoomDays, windowEnd });
      perChatCards.set(entry.id, { card, value, svg, tooltip, from, to, pan, panContent });
      drawPerChat(entry.id);
    }
  }

  function drawPerChat(id) {
    const refs = perChatCards.get(id), view = perChatViews.get(id);
    if (!refs || !view) return;
    const [first, last] = selectedBounds(view);
    const summary = spanRecords(first, last, id);
    const total = summary.own + summary.other;
    refs.value.textContent = `${count(total)} ${messageWord(total)}`;
    refs.from.textContent = dateText(dayKey(first));
    refs.to.textContent = dateText(dayKey(last));
    syncTimeline(refs.pan, refs.panContent, view);
    drawChart(refs.svg, refs.tooltip, groupSeries(summary.daily), null, id, first, last);
  }

  function setActiveChat(id) {
    if (!perChatCards.has(id) || activeChatId === id) return;
    perChatCards.get(activeChatId)?.card.classList.remove('is-active');
    activeChatId = id;
    perChatCards.get(id).card.classList.add('is-active');
    updateZoomControls();
  }

  function syncTimeline(scroll, content, view) {
    const remaining = Math.max(0, endDay - startDay - view.zoomDays + 1);
    content.style.width = `${(scroll.clientWidth || 1000) + remaining * 8}px`;
    const [first] = selectedBounds(view);
    const left = (first - startDay) * 8;
    if (Math.abs(scroll.scrollLeft - left) > 1) scroll.scrollLeft = left;
    scroll.setAttribute('aria-valuemin', '0');
    scroll.setAttribute('aria-valuemax', String(remaining));
    scroll.setAttribute('aria-valuenow', String(first - startDay));
  }

  function renderPeakDetail() {
    const root = $('peak-breakdown'); root.replaceChildren();
    syncContextSelection();
    if (!selectedPeak) {
      root.className = 'peak-breakdown peak-placeholder';
      $('peak-detail-title').textContent = tr('Что происходило в этот день?', 'What happened on this day?');
      $('peak-detail-caption').textContent = tr('Кликни по интересующему дню на графике выше — здесь появится подробная статистика.', 'Click a day on the chart to see the details here.');
      $('peak-detail-total').textContent = '—';
      root.textContent = tr('↑ Нажми на любое место графика. Покажем число сообщений и чаты, которые создали этот пик.', '↑ Click anywhere on the chart to see message counts and the chats behind this peak.');
      return;
    }
    root.className = 'peak-breakdown';
    const { start, end, chatId } = selectedPeak;
    const result = spanRecords(dayNo(start), dayNo(end), chatId);
    const total = result.own + result.other;
    $('peak-detail-title').textContent = start === end ? dateText(start, { day: 'numeric', month: 'long', year: 'numeric' }) : `${dateText(start)} — ${dateText(end)}`;
    $('peak-detail-caption').textContent = tr(`${count(result.own)} твоих · ${count(result.other)} сообщений других участников`, `${count(result.own)} yours · ${count(result.other)} from others`);
    $('peak-detail-total').textContent = `${count(total)} ${messageWord(total)}`;
    const entries = Object.entries(result.totals).map(([id, pair]) => ({ id, total: pair[0] + pair[1] })).sort((a, b) => b.total - a.total).slice(0, 8);
    if (!entries.length) { root.textContent = tr('В этот период сообщений не было.', 'There were no messages in this period.'); return; }
    const max = entries[0].total;
    for (const entry of entries) {
      const row = document.createElement('div'); row.className = 'peak-row';
      const name = document.createElement('span'); name.textContent = data.chats[entry.id] || tr('Без названия', 'Untitled chat');
      const track = document.createElement('span'); track.className = 'peak-track';
      const fill = document.createElement('i'); fill.style.width = `${entry.total / max * 100}%`; track.append(fill);
      const value = document.createElement('strong'); value.textContent = count(entry.total);
      row.append(name, track, value); root.appendChild(row);
    }
  }

  function syncContextSelection() {
    const key = selectedPeak ? `${selectedPeak.start}|${selectedPeak.end}|${selectedPeak.chatId}` : '';
    if (key === contextKey) return;
    contextKey = key;
    contextRequest++;
    contextMessages = [];
    contextPage = 0;
    $('context-results').replaceChildren();
    $('context-pages').hidden = true;
    $('context-run').disabled = !selectedPeak;
    resetChatSearch('context-chat-filter');
    $('context-chat-filter').value = selectedPeak && data.chats[selectedPeak.chatId] ? selectedPeak.chatId : 'all';
    $('context-period').textContent = selectedPeak
      ? `${selectedPeak.start === selectedPeak.end ? dateText(selectedPeak.start) : `${dateText(selectedPeak.start)} — ${dateText(selectedPeak.end)}`} · ${selectedPeak.chatId === 'all' ? tr('все чаты', 'all chats') : data.chats[selectedPeak.chatId] || tr('все чаты', 'all chats')}`
      : tr('Выбери день на графике или в календаре либо открой серию.', 'Choose a day on the chart or calendar, or open a streak.');
    $('context-status').textContent = selectedPeak ? tr('Нажми «Показать сообщения», чтобы прочитать переписку за этот период.', 'Click “Show messages” to read messages from this period.') : tr('Тексты сообщений загружаются только по кнопке.', 'Message text loads only when you click the button.');
  }

  function messageBody(message) {
    if (typeof message.text === 'string' && message.text.trim()) return message.text;
    if (Array.isArray(message.text)) {
      const text = message.text.map(part => typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '').join('');
      if (text.trim()) return text;
    }
    return message.media_type ? `[${message.media_type}]` : tr('[Сообщение без текста]', '[Message without text]');
  }

  function renderContextPage() {
    const root = $('context-results'); root.replaceChildren();
    const pageSize = 40;
    const totalPages = Math.ceil(contextMessages.length / pageSize);
    const start = contextPage * pageSize;
    for (const item of contextMessages.slice(start, start + pageSize)) {
      const row = document.createElement('article'); row.className = `context-message ${item.own ? 'is-own' : 'is-other'}`;
      const heading = document.createElement('div'); heading.className = 'context-message-heading';
      const displaySender = item.sender === 'Ты' || item.sender === 'You' ? tr('Ты', 'You') : item.sender;
      const sender = document.createElement('strong'); sender.textContent = $('context-chat-filter').value === 'all' ? `${item.chat} · ${displaySender}` : displaySender;
      const stamp = document.createElement('time'); stamp.textContent = `${dateText(item.date.slice(0, 10))} · ${item.date.slice(11, 16)}`;
      heading.append(sender, stamp);
      const body = document.createElement('p'); body.textContent = item.text === '[Сообщение без текста]' || item.text === '[Message without text]' ? tr('[Сообщение без текста]', '[Message without text]') : item.text;
      row.append(heading, body); root.append(row);
    }
    $('context-pages').hidden = totalPages <= 1;
    $('context-prev').disabled = contextPage === 0;
    $('context-next').disabled = contextPage >= totalPages - 1;
    $('context-page-label').textContent = `${contextPage + 1} / ${totalPages}`;
  }

  async function showContext() {
    if (!selectedPeak || !sourceFile) return;
    const request = ++contextRequest;
    const { start, end } = selectedPeak;
    const chosen = $('context-chat-filter').value;
    $('context-run').disabled = true;
    $('context-status').textContent = tr('Читаем выбранный период из экспорта…', 'Reading the selected period from the export…');
    let raw;
    try { raw = await readSource(); }
    catch (error) {
      if (request === contextRequest) { $('context-status').textContent = tr(`Не удалось прочитать экспорт: ${error.message}`, `Could not read the export: ${error.message}`); $('context-run').disabled = false; }
      return;
    }
    if (request !== contextRequest) return;
    const ownId = raw.personal_information?.user_id == null ? null : `user${raw.personal_information.user_id}`;
    const found = [];
    let matching = 0;
    for (const chat of raw.chats?.list || []) {
      const id = String(chat.id ?? chat.name ?? '');
      if (chosen === 'all' ? !chatMatchesType(id) : id !== chosen) continue;
      const messages = (chat.messages || []).filter(message => message.type === 'message' && message.date).sort((a, b) => a.date.localeCompare(b.date));
      const first = messages.findIndex(message => message.date.slice(0, 10) >= start && message.date.slice(0, 10) <= end);
      if (first < 0) continue;
      let last = first;
      while (last + 1 < messages.length && messages[last + 1].date.slice(0, 10) <= end) last++;
      matching += last - first + 1;
      for (let index = first; index <= last; index++) {
        const message = messages[index];
        found.push({ date: message.date, chat: chat.name || tr('Без названия', 'Untitled chat'), sender: message.from || (message.from_id === ownId ? tr('Ты', 'You') : chat.name || tr('Собеседник', 'Other person')), own: !!ownId && message.from_id === ownId, text: messageBody(message) });
      }
    }
    if (request !== contextRequest) return;
    contextMessages = found.sort((a, b) => a.date.localeCompare(b.date));
    contextPage = 0;
    $('context-run').disabled = false;
    $('context-status').textContent = matching ? tr(`${count(matching)} ${messageWord(matching)} за выбранный период.`, `${count(matching)} ${messageWord(matching)} in the selected period.`) : tr('В выбранном периоде сообщений нет.', 'No messages in the selected period.');
    renderContextPage();
  }

  function renderCalendar(selectedChat) {
    const year = Number($('calendar-year').value);
    const first = dayNo(`${year}-01-01`);
    const last = dayNo(`${year}-12-31`);
    const offset = (new Date(`${year}-01-01T00:00:00Z`).getUTCDay() + 6) % 7;
    const values = [];
    for (let day = first; day <= last; day++) {
      const records = data.days[dayKey(day)] || {};
      const value = selectedChat === 'all'
        ? Object.entries(records).reduce((sum, [id, pair]) => sum + (chatMatchesType(id) ? pair[0] + pair[1] : 0), 0)
        : chatMatchesType(selectedChat) ? (records[selectedChat]?.[0] || 0) + (records[selectedChat]?.[1] || 0) : 0;
      values.push(value);
    }
    const max = Math.max(1, ...values);
    const root = $('calendar'); root.replaceChildren();
    const months = document.createElement('div'); months.className = 'calendar-months';
    const monthNames = i18n.lang === 'en' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    for (let month = 0; month < 12; month++) {
      const label = document.createElement('span'); label.textContent = monthNames[month];
      const monthDay = Math.round(Date.UTC(year, month, 1) / 86400000) - first;
      label.style.gridColumn = String(Math.floor((offset + monthDay) / 7) + 1);
      months.append(label);
    }
    const body = document.createElement('div'); body.className = 'calendar-body';
    const weekdays = document.createElement('div'); weekdays.className = 'calendar-weekdays';
    for (const label of i18n.lang === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']) {
      const day = document.createElement('span'); day.textContent = label; weekdays.append(day);
    }
    const cells = document.createElement('div'); cells.className = 'calendar-cells';
    for (let n = 0; n < offset; n++) {
      const blank = document.createElement('span'); blank.className = 'calendar-blank'; cells.append(blank);
    }
    values.forEach((value, index) => {
      const day = first + index, key = dayKey(day);
      const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'calendar-cell';
      cell.dataset.level = value === 0 ? '0' : String(Math.max(1, Math.ceil(4 * Math.log1p(value) / Math.log1p(max))));
      cell.title = `${dateText(key)} · ${count(value)} ${messageWord(value)}`;
      cell.setAttribute('aria-label', cell.title);
      cell.disabled = day < startDay || day > endDay;
      cell.onclick = () => {
        zoomDays = Math.min(14, endDay - startDay + 1);
        windowEnd = Math.max(startDay + zoomDays - 1, Math.min(endDay, day + Math.floor(zoomDays / 2)));
        $('mode-filter').value = 'one';
        resetChatSearch('chat-filter');
        $('chat-filter').value = selectedChat;
        selectedPeak = { start: key, end: key, chatId: selectedChat };
        render();
        document.querySelector('.chart-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      cells.append(cell);
    });
    body.append(weekdays, cells); root.append(months, body);
  }

  function renderHours(first, last, selectedChat) {
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (let day = first; day <= last; day++) {
      const key = dayKey(day), records = data.hours[key] || {};
      const weekday = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
      for (const [id, hours] of Object.entries(records)) {
        if ((selectedChat !== 'all' && id !== selectedChat) || !chatMatchesType(id)) continue;
        for (let hour = 0; hour < 24; hour++) matrix[weekday][hour] += data.ownKnown ? hours[hour]?.[0] || 0 : (hours[hour]?.[0] || 0) + (hours[hour]?.[1] || 0);
      }
    }
    const ranked = matrix.flat().filter(value => value > 0).sort((a, b) => a - b);
    const max = ranked.at(-1) || 0;
    const min = ranked[0] || 0;
    const quantile = fraction => ranked[Math.floor((ranked.length - 1) * fraction)] || 0;
    const thresholds = [quantile(.25), quantile(.5), quantile(.75), quantile(.9)];
    const highlights = matrix.flatMap((row, day) => row.map((value, hour) => ({ day, hour, value })))
      .filter(item => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 3);
    const highlightKeys = new Set(highlights.map(item => `${item.day}:${item.hour}`));
    const labels = $('hour-labels'); labels.replaceChildren();
    const corner = document.createElement('span'); labels.append(corner);
    for (let hour = 0; hour < 24; hour++) {
      const label = document.createElement('span'); label.textContent = hour % 3 === 0 ? `${String(hour).padStart(2, '0')}:00` : '';
      labels.append(label);
    }
    const root = $('hours-grid'); root.replaceChildren();
    const weekdays = i18n.lang === 'en' ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] : ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    matrix.forEach((row, day) => {
      const line = document.createElement('div'); line.className = 'hour-row';
      const name = document.createElement('span'); name.className = 'hour-day'; name.textContent = weekdays[day]; line.append(name);
      row.forEach((value, hour) => {
        const cell = document.createElement('span'); cell.className = 'hour-cell';
        const level = !value ? 0 : max === min ? 2 : value >= thresholds[3] ? 4 : value >= thresholds[2] ? 3 : value >= thresholds[1] ? 2 : 1;
        cell.dataset.level = String(level);
        if (highlightKeys.has(`${day}:${hour}`)) cell.className += ' is-hotspot';
        cell.title = `${weekdays[day]}, ${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00 · ${count(value)} ${messageWord(value)}`;
        line.append(cell);
      });
      root.append(line);
    });
    $('hourly-peak').textContent = max ? `${data.ownKnown ? tr('Твои сообщения', 'Your messages') : tr('Все сообщения', 'All messages')} · ${count(matrix.flat().reduce((sum, value) => sum + value, 0))}` : tr('В выбранном периоде сообщений нет', 'No messages in the selected period');
    const highlightsRoot = $('hours-highlights'); highlightsRoot.replaceChildren();
    for (const [index, item] of highlights.entries()) {
      const chip = document.createElement('span'); chip.className = 'hour-highlight';
      chip.textContent = `${index + 1}. ${weekdays[item.day]}, ${String(item.hour).padStart(2, '0')}:00 · ${count(item.value)}`;
      highlightsRoot.append(chip);
    }
  }

  function renderRecords(daily, peak) {
    let current = 0, currentStart = '', longest = 0, longestStart = '', longestEnd = '';
    let gap = 0, gapStart = '', longestGap = 0, longestGapStart = '', longestGapEnd = '';
    for (const point of daily) {
      if (point.total > 0) {
        current++;
        if (current === 1) currentStart = point.key;
        if (current > longest) { longest = current; longestStart = currentStart; longestEnd = point.key; }
        gap = 0;
      } else {
        current = 0;
        if (!gap) gapStart = point.key;
        gap++;
        if (gap > longestGap) { longestGap = gap; longestGapStart = gapStart; longestGapEnd = point.key; }
      }
    }
    const formatRange = (from, to) => !from ? tr('Нет данных', 'No data') : from === to ? dateText(from) : `${dateText(from)} — ${dateText(to)}`;
    const endingStart = current ? dayKey(endDay - current + 1) : '';
    const form = i18n.lang === 'en' ? longest === 1 ? 'day' : 'days' : longest % 10 === 1 && longest % 100 !== 11 ? 'день' : [2, 3, 4].includes(longest % 10) && ![12, 13, 14].includes(longest % 100) ? 'дня' : 'дней';
    $('longest-streak').textContent = `${count(longest)} ${form}`;
    $('longest-streak-range').textContent = formatRange(longestStart, longestEnd);
    $('ending-streak').textContent = tr(`${count(current)} дн.`, `${count(current)} d`);
    $('ending-streak-range').textContent = current ? formatRange(endingStart, dayKey(endDay)) : tr('В конце экспорта серии не было', 'No streak at the end of the export');
    $('longest-gap').textContent = tr(`${count(longestGap)} дн.`, `${count(longestGap)} d`);
    $('longest-gap-range').textContent = longestGap ? formatRange(longestGapStart, longestGapEnd) : tr('Паузы не было', 'No gap');
    $('record-day').textContent = peak.key ? `${dateText(peak.key, { day: 'numeric', month: 'short' })} · ${count(peak.total)}` : tr('Нет сообщений', 'No messages');
    recordRanges = {
      streak: { start: longestStart, end: longestEnd },
      ending: { start: endingStart, end: dayKey(endDay) },
      gap: { start: longestGapStart, end: longestGapEnd },
    };
    $('show-ending-streak').disabled = !current;
    $('show-gap').disabled = !longestGap;
    $('show-streak').disabled = !longest;
  }

  function focusRange(from, to, chatId = 'all') {
    if (!from || !to) return;
    const full = endDay - startDay + 1;
    zoomDays = Math.min(full, Math.max(7, dayNo(to) - dayNo(from) + 7));
    windowEnd = Math.max(startDay + zoomDays - 1, Math.min(endDay, dayNo(to) + 3));
    $('mode-filter').value = 'one';
    resetChatSearch('chat-filter');
    $('chat-filter').value = chatId;
    selectedPeak = { start: from, end: to, chatId };
    render();
    document.querySelector('.chart-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderChatStreaks() {
    const dates = {};
    for (const [key, records] of Object.entries(data.days)) {
      const day = dayNo(key);
      for (const id of Object.keys(records)) (dates[id] ||= []).push(day);
    }
    const rows = Object.entries(dates).map(([id, days]) => {
      days.sort((a, b) => a - b);
      let run = 0, runStart = 0, longest = 0, longestStart = 0, longestEnd = 0, previous = null;
      for (const day of days) {
        if (day === previous) continue;
        run = day === previous + 1 ? run + 1 : 1;
        if (run === 1) runStart = day;
        if (run > longest) { longest = run; longestStart = runStart; longestEnd = day; }
        previous = day;
      }
      return { id, longest, longestStart, longestEnd, current: previous === endDay ? run : 0 };
    }).sort((a, b) => b.longest - a.longest || b.current - a.current || (data.chats[a.id] || '').localeCompare(data.chats[b.id] || '', 'ru'));
    const root = $('chat-streaks'); root.replaceChildren();
    for (const item of rows) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'chat-streak-row';
      row.dataset.chatId = item.id;
      const flame = document.createElement('span'); flame.className = 'streak-flame'; flame.textContent = '🔥';
      const body = document.createElement('span'); body.className = 'streak-body';
      const name = document.createElement('strong'); name.textContent = data.chats[item.id] || tr('Без названия', 'Untitled chat');
      const dates = document.createElement('small'); dates.textContent = item.longestStart === item.longestEnd ? dateText(dayKey(item.longestStart)) : `${dateText(dayKey(item.longestStart))} — ${dateText(dayKey(item.longestEnd))}`;
      body.append(name, dates);
      const days = document.createElement('span'); days.className = 'streak-days'; days.textContent = tr(`${count(item.longest)} дн.`, `${count(item.longest)} d`);
      const current = document.createElement('span'); current.className = 'streak-current'; current.textContent = item.current ? tr(`К концу экспорта: ${count(item.current)} дн.`, `At the end: ${count(item.current)} d`) : tr('Открыть на графике', 'Open on chart');
      row.append(flame, body, days, current);
      row.onclick = () => focusRange(dayKey(item.longestStart), dayKey(item.longestEnd), item.id);
      root.append(row);
    }
  }

  function updateZoomControls() {
    const multi = $('mode-filter').value === 'per-chat';
    const view = multi ? perChatViews.get(activeChatId) : { zoomDays, windowEnd };
    if (!view) return;
    const [first, last] = selectedBounds(view);
    $('window-label').textContent = `${dateText(dayKey(first))} — ${dateText(dayKey(last))}`;
    $('date-from').min = dayKey(startDay); $('date-from').max = dayKey(endDay); $('date-from').value = dayKey(first);
    $('date-to').min = dayKey(startDay); $('date-to').max = dayKey(endDay); $('date-to').value = dayKey(last);
    $('footer-period').textContent = `${tr('Период', 'Period')}: ${dateText(dayKey(first))} — ${dateText(dayKey(last))} · ${multi ? data.chats[activeChatId] || tr('чат', 'chat') : $('chat-filter').value === 'all' ? typeLabel() : data.chats[$('chat-filter').value] || tr('чат', 'chat')}`;
    $('zoom-label').textContent = view.zoomDays >= endDay - startDay + 1 ? tr('Всё время', 'All time') : tr(`${view.zoomDays} дн.`, `${view.zoomDays} days`);
    $('zoom-out').disabled = view.zoomDays >= endDay - startDay + 1;
    $('zoom-in').disabled = view.zoomDays <= 1;
    $('active-chart-label').hidden = !multi;
    $('apply-all-chats').hidden = !multi;
    $('active-chart-label').textContent = multi ? tr(`Выбран: ${data.chats[activeChatId] || 'чат'}`, `Selected: ${data.chats[activeChatId] || 'chat'}`) : '';
  }

  function render() {
    if (!data) return;
    const [first, last] = selectedBounds();
    const mode = $('mode-filter').value;
    const selected = mode === 'one' ? $('chat-filter').value : 'all';
    $('chart-context').textContent = mode === 'per-chat' ? tr(`Графики: ${typeLabel()}`, `Charts: ${typeLabel()}`) : selected === 'all' ? typeLabel() : data.chats[selected] || tr('Чат', 'Chat');
    $('record-context').textContent = tr(`${typeLabel()} за весь период экспорта.`, `${typeLabel()} across the full export.`);
    const summary = spanRecords(first, last, selected);
    const allSummary = spanRecords(startDay, endDay);
    const allPeak = allSummary.peak;
    $('total-count').textContent = count(allSummary.own + allSummary.other);
    $('own-count').textContent = data.ownKnown ? count(allSummary.own) : '—';
    $('own-share').textContent = data.ownKnown && allSummary.own + allSummary.other ? tr(`${Math.round(100 * allSummary.own / (allSummary.own + allSummary.other))}% всех сообщений`, `${Math.round(100 * allSummary.own / (allSummary.own + allSummary.other))}% of all messages`) : data.ownKnown ? tr('Нет сообщений', 'No messages') : tr('Автор экспорта не указан', 'Export owner unknown');
    $('peak-count').textContent = count(allPeak.total);
    $('peak-date').textContent = allPeak.key ? dateText(allPeak.key) : tr('Нет сообщений', 'No messages');
    $('chat-count').textContent = count(Object.keys(allSummary.totals).length);
    $('date-span').textContent = `${dateText(dayKey(startDay), { month: 'short', year: 'numeric' })} — ${dateText(dayKey(endDay), { month: 'short', year: 'numeric' })}`;
    $('period-own').textContent = data.ownKnown ? count(summary.own) : '—';
    $('period-other').textContent = count(summary.other);
    $('period-peak').textContent = summary.peak.total ? `${dateText(summary.peak.key)} · ${count(summary.peak.total)}` : tr('Нет сообщений', 'No messages');
    $('axis-start').textContent = dateText(dayKey(first));
    $('axis-end').textContent = dateText(dayKey(last));
    syncTimeline($('chart-pan'), $('chart-pan-content'), { zoomDays, windowEnd });
    $('chat-filter-label').hidden = mode !== 'one';
    $('single-chart').hidden = mode !== 'one';
    $('chat-charts').hidden = mode !== 'per-chat';
    if (mode === 'one') drawChart($('chart'), $('tooltip'), groupSeries(summary.daily), null, selected, first, last);
    else renderPerChat(first, last, summary.totals);
    updateZoomControls();
    rankingTotals = selected === 'all' ? summary.totals : spanRecords(first, last).totals;
    renderRanking(rankingTotals);
    renderPeakDetail();
    renderCalendar(selected);
    renderHours(first, last, selected);
    renderRecords(allSummary.daily, allPeak);
  }

  function changeZoom(direction, anchor = 0.5, targetChatId = null) {
    const full = endDay - startDay + 1;
    const multi = $('mode-filter').value === 'per-chat';
    const id = targetChatId || activeChatId;
    const view = multi ? perChatViews.get(id) : { zoomDays, windowEnd };
    if (!view) return;
    const [first] = selectedBounds(view);
    const focalDay = first + anchor * (view.zoomDays - 1);
    const next = direction < 0 ? Math.max(1, Math.floor(view.zoomDays / 1.25)) : Math.min(full, Math.ceil(view.zoomDays * 1.25));
    if (next === view.zoomDays) return;
    view.zoomDays = next;
    view.windowEnd = Math.max(startDay + next - 1, Math.min(endDay, Math.round(focalDay + (1 - anchor) * (next - 1))));
    if (multi) { drawPerChat(id); updateZoomControls(); }
    else { zoomDays = view.zoomDays; windowEnd = view.windowEnd; render(); }
  }

  function pointerAnchor(event) {
    const wrap = event.target.closest?.('.chart-wrap');
    if (!wrap) return null;
    const rect = wrap.querySelector('svg').getBoundingClientRect();
    const left = 0.04, right = 0.98;
    return {
      anchor: Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width - left) / (right - left))),
      chatId: wrap.closest('.chat-chart-card')?.dataset.chatId || null,
    };
  }

  async function loadExport(file, files = []) {
    try {
      const parsed = parseExport(JSON.parse(await file.text()));
      const keys = Object.keys(parsed.days).sort();
      data = parsed; startDay = dayNo(keys[0]); endDay = dayNo(keys.at(-1));
      sourceFile = file; wordCountsCache = null; wordTimelineState = null; replyCache = null; stickerCache = null;
      zoomDays = Math.min(90, endDay - startDay + 1); windowEnd = endDay;
      perChatViews.clear(); perChatCards.clear(); activeChatId = null;
      selectedPeak = null;
      for (const id of searchableChats) $(`${id}-search`).value = '';
      contextKey = ''; contextRequest++; contextMessages = []; contextPage = 0;
      $('context-results').replaceChildren(); $('context-pages').hidden = true; $('context-run').disabled = true;
      $('context-status').textContent = tr('Тексты сообщений загружаются только по кнопке.', 'Message text loads only when you click the button.');
      $('context-period').textContent = tr('Выбери день на графике или в календаре либо открой серию.', 'Choose a day on the chart or calendar, or open a streak.');
      $('streak-search').value = '';
      for (const id of searchableChats) $(id).replaceChildren(new Option(tr('Все чаты', 'All chats'), 'all'));
      for (const [id, name] of Object.entries(data.chats).sort((a, b) => a[1].localeCompare(b[1], 'ru'))) {
        $('chat-filter').add(new Option(name, id));
        $('ranking-chat-filter').add(new Option(name, id));
        $('meme-chat-filter').add(new Option(name, id));
        $('word-chat-filter').add(new Option(name, id));
        $('reply-chat-filter').add(new Option(name, id));
        $('sticker-chat-filter').add(new Option(name, id));
        $('context-chat-filter').add(new Option(name, id));
      }
      $('type-filter').value = 'all';
      $('ranking-chat-filter').value = 'all';
      $('meme-chat-filter').value = 'all';
      $('meme-results').replaceChildren();
      $('meme-status').textContent = tr('Выбери чат и нажми «Собрать слова».', 'Choose a chat and click “Count words”.');
      $('word-results').replaceChildren(); $('word-status').textContent = tr('Введи слово и нажми кнопку.', 'Enter a word and click the button.');
      $('reply-results').replaceChildren(); $('reply-status').textContent = tr('Расчёт запускается только по кнопке.', 'Calculation starts when you click the button.');
      $('sticker-results').replaceChildren(); $('sticker-status').textContent = tr('Выбери чат и нажми кнопку.', 'Choose a chat and click the button.'); $('sticker-summary').hidden = true;
      const years = $('calendar-year'); years.replaceChildren();
      for (let year = Number(keys[0].slice(0, 4)); year <= Number(keys.at(-1).slice(0, 4)); year++) years.add(new Option(String(year), String(year)));
      years.value = keys.at(-1).slice(0, 4);
      $('mode-filter').value = 'one';
      if ($('source-label')) $('source-label').textContent = file.name;
      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
      avatarUrl = null;
      const firstName = parsed.profileName.split(' ').filter(Boolean);
      $('avatar-initials').textContent = firstName.map(word => word[0]).slice(0, 2).join('').toUpperCase() || 'TG';
      const base = file.webkitRelativePath?.slice(0, -file.name.length) || '';
      const wanted = base + String(parsed.profilePhoto || '').replace(/\\/g, '/');
      const photo = files.find(item => item.webkitRelativePath === wanted);
      if (photo) { avatarUrl = URL.createObjectURL(photo); $('avatar-image').src = avatarUrl; $('avatar-image').hidden = false; $('avatar-initials').hidden = true; }
      else { $('avatar-image').removeAttribute('src'); $('avatar-image').hidden = true; $('avatar-initials').hidden = false; }
      $('start-screen').hidden = true; $('dashboard').hidden = false; $('load-error').hidden = true;
      render();
      renderChatStreaks();
      globalThis.TgRecap?.load(data);
      globalThis.TgRecap?.open('dashboard', false);
    } catch (error) {
      $('load-error').textContent = tr(`Не удалось открыть экспорт: ${error.message}`, `Could not open the export: ${error.message}`);
      $('load-error').hidden = false;
    }
  }
  function changeLanguage() {
    i18n.setLanguage($('language-filter').value);
    if (!data) return;
    const memeOpen = $('meme-results').children.length > 0;
    const replyOpen = $('reply-results').children.length > 0;
    const stickerOpen = $('sticker-results').children.length > 0;
    for (const id of searchableChats) resetChatSearch(id);
    render();
    renderChatStreaks();
    if (memeOpen) renderMemeDirectory();
    else $('meme-status').textContent = tr('Выбери чат и нажми «Собрать слова».', 'Choose a chat and click “Count words”.');
    if (replyOpen) renderReplyTimes();
    else $('reply-status').textContent = tr('Расчёт запускается только по кнопке.', 'Calculation starts when you click the button.');
    if (stickerOpen) renderStickers();
    else $('sticker-status').textContent = tr('Выбери чат и нажми кнопку.', 'Choose a chat and click the button.');
    if (wordTimelineState) {
      const { word, total, days } = wordTimelineState;
      $('word-status').textContent = tr(`«${word}» встретилось ${count(total)} раз в ${count(days)} днях. Ниже — самые активные даты.`, `“${word}” appeared ${count(total)} times across ${count(days)} days. The busiest dates are below.`);
      for (const row of $('word-results').children) row.children[0].textContent = dateText(row.dataset.date);
    } else $('word-status').textContent = tr('Введи слово и нажми кнопку.', 'Enter a word and click the button.');
    if (selectedPeak) {
      $('context-period').textContent = `${selectedPeak.start === selectedPeak.end ? dateText(selectedPeak.start) : `${dateText(selectedPeak.start)} — ${dateText(selectedPeak.end)}`} · ${$('context-chat-filter').value === 'all' ? tr('все чаты', 'all chats') : data.chats[$('context-chat-filter').value] || tr('чат', 'chat')}`;
      $('context-status').textContent = contextMessages.length ? tr(`${count(contextMessages.length)} ${messageWord(contextMessages.length)} за выбранный период.`, `${count(contextMessages.length)} ${messageWord(contextMessages.length)} in the selected period.`) : tr('Нажми «Показать сообщения», чтобы прочитать переписку за этот период.', 'Click “Show messages” to read messages from this period.');
      if (contextMessages.length) renderContextPage();
    } else $('context-status').textContent = tr('Тексты сообщений загружаются только по кнопке.', 'Message text loads only when you click the button.');
    globalThis.TgRecap?.render();
  }
  $('language-filter').addEventListener('change', changeLanguage);
  $('demo-open').addEventListener('click', async () => {
    const names = ['Мира', 'Космический клуб', 'Робот-помощник'];
    const chats = names.map((name, index) => ({ id: index + 1, name, type: index === 1 ? 'private_group' : index === 2 ? 'bot_chat' : 'personal_chat', messages: [] }));
    const beginning = Date.UTC(2025, 0, 1), ending = Date.UTC(2026, 10, 21);
    for (let timestamp = beginning; timestamp <= ending; timestamp += 86400000) {
      const day = new Date(timestamp), iso = day.toISOString().slice(0, 10);
      const ordinal = Math.round((timestamp - beginning) / 86400000);
      for (let index = 0; index < chats.length; index++) {
        const amount = (ordinal * 13 + index * 19) % 11 < 2 ? 0 : 1 + (ordinal * (index + 3) + index * 7) % 7;
        for (let i = 0; i < amount; i++) chats[index].messages.push({ type: 'message', date: `${iso}T${String(8 + i).padStart(2, '0')}:00:00`, from_id: i % 2 ? 'user100' : `user${index + 101}`, text: 'Привет! Как дела?' });
      }
    }
    const raw = { personal_information: { user_id: 100, first_name: 'Алекс' }, chats: { list: chats } };
    await loadExport({ name: 'demo-result.json', text: async () => JSON.stringify(raw) });
    globalThis.TgRecap?.open('recap');
    $('recap-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('file-input').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (file) await loadExport(file);
    event.target.value = '';
  });
  $('folder-input').addEventListener('change', async event => {
    const files = [...(event.target.files || [])];
    const file = files.find(item => item.webkitRelativePath?.endsWith('/result.json'));
    if (file) await loadExport(file, files);
    else { $('load-error').textContent = tr('В выбранной папке не найден result.json.', 'No result.json was found in the selected folder.'); $('load-error').hidden = false; }
    event.target.value = '';
  });
  for (const id of searchableChats) {
    const search = $(`${id}-search`), select = $(id);
    search.addEventListener('input', () => filterChatChoices(id));
    search.addEventListener('keydown', event => {
      if (event.key === 'Escape') { search.value = ''; filterChatChoices(id); return; }
      if (event.key !== 'Enter' || !search.value.trim()) return;
      const first = matchingChats(id, search.value)[0];
      if (!first) return;
      event.preventDefault();
      select.value = first[0];
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  for (const id of ['mode-filter', 'step-filter']) $(id).addEventListener('change', render);
  $('chat-filter').addEventListener('change', () => {
    const id = $('chat-filter').value;
    resetChatSearch('ranking-chat-filter');
    resetChatSearch('meme-chat-filter');
    $('ranking-chat-filter').value = id;
    $('meme-chat-filter').value = id;
    clearMemeDirectory();
    render();
  });
  $('ranking-chat-filter').addEventListener('change', () => renderRanking(rankingTotals));
  $('meme-run').addEventListener('click', renderMemeDirectory);
  $('meme-chat-filter').addEventListener('change', clearMemeDirectory);
  $('meme-limit').addEventListener('change', clearMemeDirectory);
  $('word-run').addEventListener('click', renderWordTimeline);
  $('reply-run').addEventListener('click', renderReplyTimes);
  $('sticker-run').addEventListener('click', renderStickers);
  $('context-run').addEventListener('click', showContext);
  $('context-chat-filter').addEventListener('change', () => {
    contextRequest++; contextMessages = []; contextPage = 0;
    $('context-results').replaceChildren(); $('context-pages').hidden = true;
    $('context-run').disabled = !selectedPeak;
    $('context-status').textContent = tr('Нажми «Показать сообщения» для выбранного чата.', 'Click “Show messages” for the selected chat.');
    if (selectedPeak) $('context-period').textContent = `${selectedPeak.start === selectedPeak.end ? dateText(selectedPeak.start) : `${dateText(selectedPeak.start)} — ${dateText(selectedPeak.end)}`} · ${$('context-chat-filter').value === 'all' ? tr('все чаты', 'all chats') : data.chats[$('context-chat-filter').value] || tr('чат', 'chat')}`;
  });
  $('context-prev').addEventListener('click', () => { if (contextPage > 0) { contextPage--; renderContextPage(); } });
  $('context-next').addEventListener('click', () => { if ((contextPage + 1) * 40 < contextMessages.length) { contextPage++; renderContextPage(); } });
  $('sticker-chat-filter').addEventListener('change', () => { if (stickerCache) renderStickers(); });
  $('type-filter').addEventListener('change', () => {
    $('chat-filter-search').value = '';
    $('chat-filter').replaceChildren(new Option(tr('Все чаты', 'All chats'), 'all'));
    for (const [id, name] of Object.entries(data.chats).sort((a, b) => a[1].localeCompare(b[1], 'ru'))) if (chatMatchesType(id)) $('chat-filter').add(new Option(name, id));
    $('chat-filter').value = 'all';
    perChatViews.clear(); activeChatId = null;
    render();
  });
  $('calendar-year').addEventListener('change', () => renderCalendar($('mode-filter').value === 'one' ? $('chat-filter').value : 'all'));
  $('streak-search').addEventListener('input', event => {
    const query = event.target.value.trim().toLocaleLowerCase('ru');
    for (const row of $('chat-streaks').children) row.hidden = !String(data.chats[row.dataset.chatId] || '').toLocaleLowerCase('ru').includes(query);
  });
  $('show-streak').addEventListener('click', () => focusRange(recordRanges.streak?.start, recordRanges.streak?.end));
  $('show-ending-streak').addEventListener('click', () => focusRange(recordRanges.ending?.start, recordRanges.ending?.end));
  $('show-gap').addEventListener('click', () => focusRange(recordRanges.gap?.start, recordRanges.gap?.end));
  $('zoom-in').addEventListener('click', () => changeZoom(-1));
  $('zoom-out').addEventListener('click', () => changeZoom(1));
  $('chart-pan').addEventListener('scroll', event => {
    const nextEnd = Math.min(endDay, startDay + Math.round(event.target.scrollLeft / 8) + zoomDays - 1);
    if (nextEnd === windowEnd) return;
    windowEnd = nextEnd;
    render();
  });
  $('apply-dates').addEventListener('click', () => {
    const from = dayNo($('date-from').value), to = dayNo($('date-to').value);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || from < startDay || to > endDay) { $('load-error').textContent = tr('Выбери корректный период внутри экспорта.', 'Choose a valid period within the export.'); $('load-error').hidden = false; return; }
    $('load-error').hidden = true;
    if ($('mode-filter').value === 'per-chat') {
      const view = perChatViews.get(activeChatId); if (!view) return;
      view.zoomDays = to - from + 1; view.windowEnd = to; drawPerChat(activeChatId); updateZoomControls();
    } else { zoomDays = to - from + 1; windowEnd = to; render(); }
  });
  $('apply-all-chats').addEventListener('click', () => {
    if ($('mode-filter').value !== 'per-chat') return;
    const source = perChatViews.get(activeChatId);
    if (!source) return;
    for (const id of perChatCards.keys()) {
      if (id === activeChatId) continue;
      perChatViews.set(id, { zoomDays: source.zoomDays, windowEnd: source.windowEnd });
      drawPerChat(id);
    }
    updateZoomControls();
  });
  const chartPanel = document.querySelector('.chart-panel');
  chartPanel.addEventListener('wheel', event => {
    if (!data) return;
    const target = pointerAnchor(event);
    if (!target) return;
    event.preventDefault();
    if (target.chatId) setActiveChat(target.chatId);
    changeZoom(event.deltaY < 0 ? -1 : 1, target.anchor, target.chatId);
  }, { passive: false });
  chartPanel.addEventListener('dblclick', event => {
    if (!data) return;
    const target = pointerAnchor(event);
    if (!target) return;
    event.preventDefault();
    if (target.chatId) setActiveChat(target.chatId);
    changeZoom(-1, target.anchor, target.chatId);
  });
})();

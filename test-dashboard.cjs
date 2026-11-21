const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.value = '';
    this.hidden = false;
    this.style = {};
    this.dataset = {};
    this.scrollLeft = 0;
    this.clientWidth = 1000;
    this.className = '';
    this.classList = {
      add: name => { this.className += ` ${name}`; },
      remove: name => { this.className = this.className.split(' ').filter(part => part !== name).join(' '); },
      toggle: (name, force) => { this.classList[force ? 'add' : 'remove'](name); },
    };
  }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  dispatchEvent(event) { this.listeners[event.type]?.(event); return true; }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); return item; }
  replaceChildren(...items) { this.children = items; }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  add(option) { this.children.push(option); }
  scrollIntoView() {}
  getBoundingClientRect() { return { left: 0, width: 1000, height: 320 }; }
}

const elements = new Map();
const get = id => {
  if (!elements.has(id)) elements.set(id, new Element());
  return elements.get(id);
};
get('mode-filter').value = 'one';
get('chat-filter').value = 'all';
get('step-filter').value = 'day';
get('start-screen').hidden = false;
get('dashboard').hidden = true;
const chartPanel = new Element();
const staticHeading = { nodeValue: 'Выберите экспорт Telegram' };
const document = {
  body: new Element('body'),
  getElementById: id => id === 'source-label' ? null : get(id),
  querySelector: () => chartPanel,
  querySelectorAll: () => [],
  createTreeWalker: () => ({ currentNode: null, nextNode() { if (this.currentNode) return false; this.currentNode = staticHeading; return true; } }),
  documentElement: { lang: 'ru' },
  createElement: tag => new Element(tag),
  createElementNS: (_, tag) => new Element(tag),
};
const Option = class { constructor(text, value) { this.text = text; this.value = value; } };
const URL = { createObjectURL: () => 'blob:test-photo', revokeObjectURL: () => {} };
const Event = class { constructor(type) { this.type = type; } };
const sandbox = vm.createContext({ document, Option, Event, NodeFilter: { SHOW_TEXT: 4 }, Intl, Date, console, URL });
vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), sandbox);
assert.equal(staticHeading.nodeValue, 'Выбери экспорт Telegram');
get('recap-hide-names').checked = true;
vm.runInContext(fs.readFileSync('recap.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('app.js', 'utf8'), sandbox);

const fixture = {
  personal_information: { user_id: 1, first_name: 'Тест', last_name: 'Пользователь' },
  profile_pictures: [{ photo: 'profile_pictures/photo_1.jpg' }],
  chats: { list: [
    { id: 10, name: 'Бот', type: 'bot_chat', messages: [
      { id: 1, type: 'message', date: '2026-01-01T10:00:00', from_id: 'user1', text: 'мем мем привет /start https://example.com' },
      { id: 2, reply_to_message_id: 1, type: 'message', date: '2026-01-01T10:01:00', from_id: 'user10', text: [{ type: 'plain', text: 'мем привет' }] },
      { type: 'message', date: '2026-01-01T12:00:00', from_id: 'user1' },
      { type: 'message', date: '2026-01-01T14:00:00', from_id: 'user10' },
    ] },
    { id: 11, name: 'Личный чат', type: 'personal_chat', messages: [
      { type: 'message', date: '2026-04-10T10:00:00', from_id: 'user1' },
      { type: 'message', date: '2026-04-10T10:01:00', from_id: 'user11' },
    ] },
    { id: 12, name: 'Группа', type: 'private_group', messages: [
      { type: 'message', date: '2026-04-10T10:00:00', from_id: 'user1' },
      { type: 'message', date: '2026-04-10T10:01:00', from_id: 'user12' },
      { type: 'message', date: '2026-04-11T11:00:00', from_id: 'user1' },
      { type: 'service', date: '2026-04-10T10:02:00' },
    ] },
    { id: 13, name: 'Канал', type: 'public_channel', messages: [
      { type: 'message', date: '2026-04-10T10:00:00', from_id: 'channel13' },
    ] },
  ] },
};

(async () => {
  let readCount = 0;
  const target = { files: [{ name: 'result.json', text: async () => { readCount++; return JSON.stringify(fixture); } }], value: '' };
  await get('file-input').listeners.change({ target });
  assert.equal(readCount, 1);
  assert.equal(get('dashboard').hidden, false);
  assert.equal(get('start-screen').hidden, true);
  assert.equal(get('total-count').textContent, '10');
  assert.equal(get('own-count').textContent, '5');
  assert.equal(get('chat-count').textContent, '4');
  assert.equal(get('recap-cards').children.length, 6);
  assert.equal(get('recap-panel').hidden, true);
  get('recap-open').listeners.click();
  assert.equal(get('recap-panel').hidden, false);
  assert.equal(get('dashboard-main').hidden, true);
  let printCount = 0;
  sandbox.print = () => { printCount++; };
  get('recap-pdf').listeners.click();
  assert.equal(printCount, 1);
  assert.ok(document.body.className.includes('recap-print'));
  get('dashboard-open').listeners.click();
  assert.equal(get('dashboard-main').hidden, false);
  assert.equal(get('recap-cards').children[4].children[2].textContent, 'Чат 1');
  get('recap-hide-names').checked = false;
  get('recap-hide-names').listeners.change();
  assert.equal(get('recap-cards').children[4].children[2].textContent, 'Бот');
  assert.equal(get('ranking-chat-filter').children.length, 5);
  get('chat-filter-search').value = 'Личный';
  get('chat-filter-search').listeners.input();
  assert.equal(get('chat-filter').children.length, 2);
  get('chat-filter-search').listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(get('chat-filter').value, '11');
  get('chat-filter').value = '11';
  get('chat-filter').listeners.change();
  assert.equal(get('chart-context').textContent, 'Личный чат');
  assert.equal(get('ranking-chat-filter').value, '11');
  assert.equal(get('meme-chat-filter').value, '11');
  assert.match(get('footer-period').textContent, /Личный чат/);
  get('chat-filter').value = 'all';
  get('chat-filter').listeners.change();
  assert.equal(get('meme-chat-filter').children.length, 5);
  get('meme-chat-filter').value = '10';
  get('meme-limit').value = '5';
  await get('meme-run').listeners.click();
  assert.equal(readCount, 2);
  assert.equal(get('meme-results').children.length, 2);
  assert.equal(get('meme-results').children[0].children[1].textContent, 'мем');
  assert.equal(get('meme-results').children[0].children[3].textContent, '3');
  get('meme-chat-filter').value = '13';
  get('meme-chat-filter').listeners.change();
  assert.equal(get('meme-results').children.length, 0);
  get('word-chat-filter').value = '10';
  get('word-query').value = 'мем';
  await get('word-run').listeners.click();
  assert.equal(readCount, 3);
  assert.equal(get('word-results').children.length, 1);
  assert.equal(get('word-results').children[0].children[2].textContent, '3');
  get('reply-chat-filter').value = '10';
  await get('reply-run').listeners.click();
  assert.equal(readCount, 4);
  assert.equal(get('reply-results').children.length, 1);
  const botReply = get('reply-results').children[0];
  const ownReplyMetrics = botReply.children[1].children[1].children;
  const otherReplyMetrics = botReply.children[2].children[1].children;
  assert.equal(ownReplyMetrics.length, 3);
  assert.equal(otherReplyMetrics.length, 3);
  assert.equal(ownReplyMetrics[0].children[1].textContent, '—');
  assert.equal(ownReplyMetrics[1].children[1].textContent, '1 ч 59 мин');
  assert.match(otherReplyMetrics[0].children[1].textContent, /1 мин/);
  assert.match(otherReplyMetrics[1].children[1].textContent, /2 ч/);
  assert.equal(otherReplyMetrics[2].children[1].textContent, '1 ч 0 мин 30 сек');
  get('reply-chat-filter').value = '12';
  await get('reply-run').listeners.click();
  assert.equal(get('reply-results').children.length, 1);
  assert.equal(get('reply-results').children[0].children[1].children[1].children[2].children[1].textContent, '—');
  get('type-filter').value = 'personal';
  get('type-filter').listeners.change();
  assert.equal(get('chat-filter').children.length, 2);
  assert.equal(get('chat-count').textContent, '1');
  get('type-filter').value = 'channels';
  get('type-filter').listeners.change();
  assert.equal(get('chat-count').textContent, '1');
  get('type-filter').value = 'all';
  get('type-filter').listeners.change();
  const initialZoom = get('zoom-label').textContent;
  get('ranking-chat-filter').value = '11';
  get('ranking-chat-filter').listeners.change();
  assert.equal(get('ranking').children.length, 1);
  assert.equal(get('zoom-label').textContent, initialZoom);
  get('ranking-chat-filter').value = 'all';
  get('ranking-chat-filter').listeners.change();
  assert.ok(get('chart').children.some(child => child.tag === 'path'));
  assert.equal(get('avatar-initials').textContent, 'ТП');
  assert.equal(get('hours-grid').children.length, 7);
  assert.notEqual(get('hours-grid').children[4].children[11].dataset.level, '0');
  assert.equal(get('hours-highlights').children.length, 2);
  assert.equal(get('calendar').children[1].children[1].children.length, 368); // 365 days plus weekday offset.
  assert.equal(get('longest-streak').textContent, '2 дня');
  assert.equal(get('chat-streaks').children.length, 4);
  get('streak-search').listeners.input({ target: { value: 'Личный' } });
  assert.equal(get('chat-streaks').children.filter(row => !row.hidden).length, 1);
  get('streak-search').listeners.input({ target: { value: '' } });
  assert.match(get('longest-gap-range').textContent, /—/);
  get('chart').onclick({ clientX: 980 });
  assert.equal(get('peak-detail-total').textContent, '1 сообщение');
  assert.equal(get('peak-breakdown').children.length, 1);
  get('mode-filter').value = 'per-chat';
  get('mode-filter').listeners.change();
  assert.equal(get('chat-charts').children.length, 4); // Includes chats without activity in the visible window.
  assert.ok(get('chat-charts').children.every(card => card.children[1].children[0].viewBox === '0 0 1000 320'));
  const groupAxisLabels = get('chat-charts').children[0].children[1].children[0].children.filter(item => item.tag === 'text' && item.class === 'grid-label');
  assert.equal(groupAxisLabels.at(-1).textContent, '4');
  assert.equal(get('zoom-label').textContent, '90 дн.');
  const cards = get('chat-charts').children;
  const chartChildren = cards.map(card => card.children[1].children[0].children);
  get('zoom-out').listeners.click();
  assert.equal(get('chat-charts').children.length, 4);
  assert.equal(get('zoom-label').textContent, 'Всё время');
  assert.notEqual(cards[0].children[1].children[0].children, chartChildren[0]);
  assert.equal(cards[1].children[1].children[0].children, chartChildren[1]);
  get('zoom-in').listeners.click();
  assert.equal(get('chat-charts').children.length, 4);
  assert.equal(get('zoom-label').textContent, '80 дн.');
  const unchangedSecond = cards[1].children[1].children[0].children;
  cards[0].children[3].scrollLeft = 0;
  cards[0].children[3].listeners.scroll();
  assert.equal(cards[1].children[1].children[0].children, unchangedSecond);
  const wrap = {
    querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, width: 1000 }) }),
    classList: { contains: () => false },
    closest: () => cards[1],
  };
  const firstChartBefore = cards[0].children[1].children[0].children;
  const secondChartBefore = cards[1].children[1].children[0].children;
  let prevented = false;
  chartPanel.listeners.wheel({
    target: { closest: () => wrap }, clientX: 500, deltaY: -1,
    preventDefault: () => { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(get('zoom-label').textContent, '72 дн.');
  assert.equal(cards[0].children[1].children[0].children, firstChartBefore);
  assert.notEqual(cards[1].children[1].children[0].children, secondChartBefore);
  assert.equal(get('apply-all-chats').hidden, false);
  get('apply-all-chats').listeners.click();
  assert.notEqual(cards[0].children[1].children[0].children, firstChartBefore);
  assert.equal(cards[0].children[2].children[0].textContent, cards[1].children[2].children[0].textContent);
  get('calendar').children[1].children[1].children[102].onclick();
  assert.equal(get('zoom-label').textContent, '14 дн.');
  assert.ok(get('chart').children.some(item => item.class === 'day-marker'));
  get('context-chat-filter').value = 'all';
  await get('context-run').listeners.click();
  assert.ok(get('context-results').children.length > 0);
  assert.ok(get('context-results').children.every(row => !row.className.includes('is-outside')));
  get('context-chat-filter').value = '10';
  get('context-chat-filter').listeners.change();
  await get('context-run').listeners.click();
  assert.equal(get('context-results').children.length, 0);
  assert.match(get('context-status').textContent, /сообщений нет/);
  get('chart-pan').scrollLeft = 0;
  get('chart-pan').listeners.scroll({ target: get('chart-pan') });
  assert.match(get('axis-start').textContent, /янв/);
  get('show-streak').listeners.click();
  assert.equal(get('mode-filter').value, 'one');
  assert.equal(get('zoom-label').textContent, '8 дн.');
  assert.equal(get('context-run').disabled, false);
  get('context-chat-filter').value = '12';
  await get('context-run').listeners.click();
  assert.equal(get('context-results').children.length, 3);
  assert.match(get('context-status').textContent, /сообщения/);
  get('context-chat-filter').value = '11';
  get('context-chat-filter').listeners.change();
  assert.equal(get('context-results').children.length, 0);
  get('chat-streaks').children[0].onclick();
  assert.equal(get('chat-filter').value, '12');
  const stickerFixture = JSON.parse(JSON.stringify(fixture));
  stickerFixture.chats.list[1].messages.push(
    { type: 'message', date: '2026-04-10T12:00:00', media_type: 'sticker', from_id: 'user11', from: 'Собеседник' },
    { type: 'message', date: '2026-04-10T12:01:00', media_type: 'sticker', from_id: 'user11', from: 'Собеседник' },
    { type: 'message', date: '2026-04-10T12:02:00', media_type: 'sticker', from_id: 'user1', from: 'Тест' },
  );
  stickerFixture.chats.list[0].messages.push({ type: 'message', date: '2026-01-01T15:00:00', media_type: 'sticker', from_id: 'user1' });
  await get('file-input').listeners.change({ target: { files: [{ name: 'result.json', text: async () => JSON.stringify(stickerFixture) }], value: '' } });
  get('sticker-chat-filter').value = 'all';
  await get('sticker-run').listeners.click();
  assert.match(get('sticker-summary').textContent, /Всего стикеров: 4/);
  get('sticker-chat-filter').value = '11';
  await get('sticker-chat-filter').listeners.change();
  assert.match(get('sticker-summary').textContent, /Всего стикеров: 3/);
  assert.equal(get('sticker-results').children[0].children[0].textContent, 'Собеседник');
  assert.equal(get('sticker-results').children[0].children[2].textContent, '2');
  const replyFixture = { personal_information: { user_id: 1 }, chats: { list: [{ id: 99, name: 'Reply test', type: 'personal_chat', messages: [
    { id: 1, type: 'message', date: '2026-01-01T10:00:00', from_id: 'user1' },
    { id: 2, type: 'message', date: '2026-01-01T10:01:00', from_id: 'user99' },
    { id: 3, type: 'message', date: '2026-01-01T10:02:00', from_id: 'user99' },
    { id: 4, reply_to_message_id: 2, type: 'message', date: '2026-01-01T10:03:00', from_id: 'user1' },
    { id: 5, type: 'message', date: '2026-01-01T20:00:00', from_id: 'user1' },
    { id: 6, type: 'message', date: '2026-01-01T20:01:00', from_id: 'user99' },
  ] }, { id: 100, name: 'Long waits', type: 'personal_chat', messages: [
    { id: 1, type: 'message', date: '2026-01-01T10:00:00', from_id: 'user1' },
    { id: 2, type: 'message', date: '2026-01-09T10:00:00', from_id: 'user100' },
    { id: 3, type: 'message', date: '2026-01-09T10:01:00', from_id: 'user1' },
    { id: 4, type: 'message', date: '2026-01-10T10:00:00', from_id: 'user1' },
    { id: 5, type: 'message', date: '2026-01-19T10:00:00', from_id: 'user100' },
  ] }] } };
  await get('file-input').listeners.change({ target: { files: [{ name: 'result.json', text: async () => JSON.stringify(replyFixture) }], value: '' } });
  get('reply-chat-filter').value = '99';
  await get('reply-run').listeners.click();
  const replyRow = get('reply-results').children[0];
  assert.equal(replyRow.children[1].children[1].children[2].children[1].textContent, '2 мин');
  assert.equal(replyRow.children[2].children[1].children[2].children[1].textContent, '1 мин');
  assert.match(replyRow.children[3].textContent, /По ссылке на сообщение: 1 · по смене отправителя: 2/);
  get('reply-chat-filter').value = '100';
  await get('reply-run').listeners.click();
  const longWaitRow = get('reply-results').children[0];
  assert.equal(longWaitRow.children[1].children[1].children[2].children[1].textContent, '1 мин');
  assert.equal(longWaitRow.children[2].children[1].children[2].children[1].textContent, '8 дн 12 ч 0 мин');
  assert.match(longWaitRow.children[2].children[2].textContent, /более недели: 2/);
  const json = { name: 'result.json', webkitRelativePath: 'Export/result.json', text: async () => JSON.stringify(fixture) };
  const photo = { name: 'photo_1.jpg', webkitRelativePath: 'Export/profile_pictures/photo_1.jpg' };
  await get('folder-input').listeners.change({ target: { files: [json, photo], value: '' } });
  assert.equal(get('avatar-image').src, 'blob:test-photo');
  assert.equal(get('avatar-image').hidden, false);
  get('language-filter').value = 'en';
  get('language-filter').listeners.change();
  assert.equal(staticHeading.nodeValue, 'Choose a Telegram export');
  assert.equal(get('chat-filter').children[0].text, 'All chats');
  assert.match(get('record-context').textContent, /full export/);
  assert.match(get('footer-period').textContent, /^Period:/);
  get('reply-chat-filter').value = '10';
  await get('reply-run').listeners.click();
  assert.equal(get('reply-results').children[0].children[1].children[0].textContent, 'Your replies');
  get('language-filter').value = 'ru';
  get('language-filter').listeners.change();
  assert.equal(staticHeading.nodeValue, 'Выбери экспорт Telegram');
  assert.equal(get('chat-filter').children[0].text, 'Все чаты');
  assert.equal(get('reply-results').children[0].children[1].children[0].textContent, 'Твои ответы');
  await get('demo-open').listeners.click();
  assert.equal(get('recap-year').children.length, 2);
  assert.equal(get('recap-cards').children.length, 6);
  assert.equal(get('recap-panel').hidden, false);
  assert.equal(get('avatar-initials').textContent, 'А');
  const boundaryFixture = { personal_information: { user_id: 1 }, chats: { list: [{ id: 1, name: 'Тест', type: 'personal_chat', messages: ['2025-12-31', '2026-01-01', '2026-01-02'].map(date => ({ type: 'message', date: `${date}T12:00:00`, from_id: 'user1' })) }] } };
  await get('file-input').listeners.change({ target: { files: [{ name: 'result.json', text: async () => JSON.stringify(boundaryFixture) }], value: '' } });
  get('recap-open').listeners.click();
  assert.equal(get('recap-year').value, '2026');
  assert.equal(get('recap-cards').children[3].children[2].textContent, '2');
  get('alltime-open').listeners.click();
  assert.equal(get('recap-year-wrap').hidden, true);
  assert.equal(get('recap-cards').children[3].children[2].textContent, '3');
  assert.equal(get('recap-cards').children[0].children[2].textContent, '3');
  assert.equal(get('recap-title').textContent, 'За всё время');
  assert.ok(get('recap-cards').children[1].children[1].textContent.includes('2026'));
  get('language-filter').value = 'en';
  get('language-filter').listeners.change();
  assert.equal(get('recap-title').textContent, 'All time');
  get('language-filter').value = 'ru';
  get('language-filter').listeners.change();
  get('recap-open').listeners.click();
  get('recap-year').value = '2025';
  get('recap-year').listeners.change();
  assert.equal(get('recap-cards').children[0].children[2].textContent, '1');
  const exportPath = 'DataExport_2026-11-21/result.json';
  if (fs.existsSync(exportPath)) {
    const realJson = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    const realFile = { name: 'result.json', webkitRelativePath: 'DataExport_2026-11-21/result.json', text: async () => JSON.stringify(realJson) };
    const realPhoto = { name: 'photo_1.jpg', webkitRelativePath: `DataExport_2026-11-21/${realJson.profile_pictures[0].photo}` };
    await get('folder-input').listeners.change({ target: { files: [realFile, realPhoto], value: '' } });
    assert.equal(get('total-count').textContent.replace(/\s/g, ''), '1791');
    assert.equal(get('avatar-image').hidden, false);
    get('type-filter').value = 'personal';
    get('type-filter').listeners.change();
    assert.equal(get('chat-count').textContent, '0');
    get('type-filter').value = 'all';
    get('type-filter').listeners.change();
    await get('meme-run').listeners.click();
    assert.ok(get('meme-results').children.length > 0);
    assert.ok(get('meme-results').children.length <= 10);
    get('reply-chat-filter').value = 'all';
    await get('reply-run').listeners.click();
    assert.ok(get('reply-results').children.length > 0);
    get('mode-filter').value = 'per-chat';
    get('mode-filter').listeners.change();
    const realCards = get('chat-charts').children;
    assert.equal(realCards.length, 47);
    for (const card of realCards) {
      const total = Number(card.children[0].children[1].textContent.replace(/\D/g, ''));
      const labels = card.children[1].children[0].children.filter(item => item.tag === 'text' && item.class === 'grid-label');
      const axisTop = Number(labels.at(-1).textContent.replace(/\D/g, ''));
      assert.ok(axisTop <= Math.max(4, total + 3));
    }
    const otherGraph = realCards[1].children[1].children[0].children;
    get('zoom-in').listeners.click();
    assert.equal(realCards[1].children[1].children[0].children, otherGraph);
  }
  console.log('Dashboard smoke test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

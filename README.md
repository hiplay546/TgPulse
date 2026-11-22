![Главный экран TgPulse](assets/TgPulseMain.png)

# TgPulse — бета

TgPulse — локальное приложение для анализа активности в Telegram. Программа отображает графики, статистику чатов и сводки по экспорту данных. Для запуска достаточно открыть `index.html` в браузере; установка и сервер не требуются.

## Обработка данных

Файл `result.json` обрабатывается в браузере на устройстве пользователя. Приложение не использует сервер, сетевые запросы, внешние скрипты и сервисы аналитики. Исходные данные не передаются третьим лицам. Тексты сообщений отображаются только по запросу пользователя; изображения и PDF сохраняются локально.

## Скачать и запустить

1. На странице репозитория нажмите зелёную кнопку **Code → Download ZIP** и распакуйте архив в удобную папку. Установка не требуется.
2. Откройте файл `index.html` из распакованной папки двойным щелчком.
3. В **Telegram Desktop** перейдите в **Настройки → Продвинутые настройки → Экспорт данных**. Отметьте **Информация об аккаунте**, **Список контактов** и **Личные чаты**. Для ускорения экспорта отключите фотографии и другие медиафайлы.
4. **ВАЖНО: в самом низу окна экспорта выберите машиночитаемый формат JSON.** Дождитесь завершения экспорта.
5. На странице TgPulse нажмите **«Выбрать папку экспорта»** и укажите папку с `result.json`. При выборе папки приложение также загрузит аватар. Если открыть только `result.json`, аватар не будет доступен.

Для ознакомления без экспорта нажмите **«Посмотреть демо на вымышленных данных»**.

## Что есть в бете

- График активности по всем чатам или по каждому чату, масштабирование, выбор дат и поиск чатов.
- Календарь, пики, серии, ритм переписки, популярные слова, стикеры и примерное время ответа.
- Вкладки **«Итог года»** с выбором года и **«За всё время»** по всему экспорту.
- Карточки итогов в PNG или PDF с возможностью скрыть имена чатов, даты и точные числа.
- Русский и английский интерфейс.

## Скриншот

![Полный обзор интерфейса TgPulse](assets/FullTgPulse.png)

Подсчёт времени ответа является приблизительным: без явной ссылки «Ответить» программа не всегда может отличить ответ от начала нового разговора. Тексты сообщений отображаются после нажатия **«Показать сообщения»**. При повторном открытии страницы экспорт необходимо выбрать снова.

## Приватность и лицензия

Экспорт переписок обрабатывается локально. Перед публикацией карточек рекомендуется проверить, какие сведения на них видны.

Проект находится в **бета-версии**. При разработке использовался ИИ **OpenAI Codex** для помощи с кодом, интерфейсом и документацией.

Код проекта распространяется по [Apache License 2.0](LICENSE). Авторы и лицензии сторонней иконки и шрифта указаны в [ATTRIBUTION.md](ATTRIBUTION.md).

---

## English

**TgPulse beta** is a local application for analyzing Telegram activity. To get started, select **Code → Download ZIP**, extract the archive, and open `index.html`. No installation is required. In Telegram Desktop, export **Account information**, **Contacts list**, and **Personal chats**. **At the bottom of the export dialog, select machine-readable JSON.** Then select the export folder in TgPulse. A fictional demo is also available.

**Data processing:** TgPulse reads `result.json` in the user's browser. The application has no server, network requests, analytics, or external scripts. Exported data is not transmitted to third parties.

Explore charts, chat streaks, words, stickers, and yearly or all-time recap cards. Save cards as PNG or PDF, with optional privacy controls. Reply times are estimates. The interface supports Russian and English.

The project was developed with assistance from **OpenAI Codex** for code, interface text, and documentation. Licensed under [Apache License 2.0](LICENSE); third-party credits are in [ATTRIBUTION.md](ATTRIBUTION.md).

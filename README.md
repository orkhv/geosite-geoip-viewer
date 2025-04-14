[# GeoSite-GeoIP Viewer

Веб-приложение для просмотра данных GeoSite и GeoIP.

## Настройка GitHub Pages

1. Перейдите в настройки вашего репозитория (Settings)
2. В разделе "Pages":
   - Выберите "GitHub Actions" как источник
   - Ветка: `main`
   - Папка: `/ (root)`

3. Настройте GitHub Actions:
   - Перейдите во вкладку "Actions"
   - Включите workflows, если они отключены
   - Запустите workflow "Update Data" вручную для первого обновления данных

## Обновление данных

Данные обновляются автоматически каждый день в полночь через GitHub Actions. Также можно запустить обновление вручную:

1. Перейдите во вкладку "Actions"
2. Выберите workflow "Update Data"
3. Нажмите "Run workflow"

## Локальная разработка

1. Клонируйте репозиторий:
```bash
git clone https://github.com/your-username/geosite-geoip-viewer.git
cd geosite-geoip-viewer
```

2. Установите зависимости:
```bash
npm install
```

3. Запустите обновление данных:
```bash
npm run update
```

4. Откройте `index.html` в браузере ](https://orkhv.github.io/geosite-geoip-viewer/)

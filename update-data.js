const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const MAX_ATTEMPTS = 5;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadFile(url, filename) {
  const dest = path.join(DATA_DIR, filename);
  const temp = `${dest}.tmp`;
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'geosite-geoip-viewer' },
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status}`);
      }

      const data = Buffer.from(await response.arrayBuffer());
      if (data.length === 0) {
        throw new Error(`Empty response for ${url}`);
      }

      fs.writeFileSync(temp, data);
      fs.renameSync(temp, dest);
      return;
    } catch (error) {
      lastError = error;
      fs.rmSync(temp, { force: true });

      if (attempt < MAX_ATTEMPTS) {
        const delay = attempt * 2000;
        console.warn(
          `${filename}: попытка ${attempt} не удалась (${error.code || error.message}), повтор через ${delay} мс`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

async function updateData() {
  try {
    console.log('Начинаем обновление данных...');

    await downloadFile(
      'https://raw.githubusercontent.com/orkhv/geosite-geoip-updater/main/geosite.json',
      'geosite.json'
    );
    console.log('geosite.json обновлен');

    await downloadFile(
      'https://raw.githubusercontent.com/orkhv/geosite-geoip-updater/main/geoip.json',
      'geoip.json'
    );
    console.log('geoip.json обновлен');

    const timestamp = {
      lastUpdate: new Date().toISOString()
    };
    fs.writeFileSync(
      path.join(DATA_DIR, 'timestamp.json'),
      JSON.stringify(timestamp, null, 2)
    );

    console.log('Данные успешно обновлены');
  } catch (error) {
    console.error('Ошибка при обновлении данных:', error);
    process.exit(1);
  }
}

updateData();

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, 'data');

// Создаем директорию для данных, если её нет
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Функция для загрузки файла
function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(path.join(DATA_DIR, filename));
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(path.join(DATA_DIR, filename), () => {});
      reject(err);
    });
  });
}

// Загружаем файлы
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
    
    // Добавляем timestamp последнего обновления
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
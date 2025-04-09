let categories = [];
let filteredCategories = [];
let selectedCategory = null;
let currentMode = "geosite";
let searchTimeout = null;

const modeSelect = document.getElementById("modeSelect");
const loadingIndicator = document.getElementById("loading");
const searchInput = document.getElementById("search");
const searchInfo = document.querySelector(".search-info");
const categoryInfo = document.getElementById("categoryInfo");

// Показываем/скрываем индикатор загрузки
function setLoading(isLoading) {
  loadingIndicator.style.display = isLoading ? "block" : "none";
}

// Получение данных из кэша
function getCachedData(mode) {
  const cached = localStorage.getItem(`geosite-geoip-${mode}`);
  if (cached) {
    try {
      const data = JSON.parse(cached);
      const timestamp = data.timestamp;
      // Проверяем, не устарели ли данные (24 часа)
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        return data.categories;
      }
    } catch (e) {
      console.error('Ошибка при чтении кэша:', e);
    }
  }
  return null;
}

// Сохранение данных в кэш
function cacheData(mode, data) {
  try {
    localStorage.setItem(`geosite-geoip-${mode}`, JSON.stringify({
      categories: data,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.error('Ошибка при сохранении в кэш:', e);
  }
}

// Обработка переключения режима
modeSelect.addEventListener("change", () => {
  currentMode = modeSelect.value;
  loadData();
});

// Улучшенный поиск
searchInput.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  
  // Очищаем предыдущий таймаут
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  // Устанавливаем новый таймаут для отложенного поиска
  searchTimeout = setTimeout(() => {
    if (query.length === 0) {
      filteredCategories = categories;
      searchInfo.textContent = "";
    } else {
      // Ищем по категориям и содержимому
      filteredCategories = categories.map(category => {
        const matchingEntries = category.entries.filter(entry => 
          entry.toLowerCase().includes(query)
        );
        return {
          ...category,
          matchingEntries
        };
      }).filter(category => 
        category.category.toLowerCase().includes(query) || 
        category.matchingEntries.length > 0
      );
      
      // Показываем количество найденных результатов
      const totalMatches = filteredCategories.reduce((sum, cat) => 
        sum + cat.matchingEntries.length, 0
      );
      searchInfo.textContent = `Найдено: ${filteredCategories.length} категорий, ${totalMatches} записей`;
    }
    
    renderCategories();
  }, 300);
});

// Загрузка данных
function loadData() {
  setLoading(true);
  
  fetch(`data/${currentMode}.json`)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      categories = data;
      filteredCategories = categories;
      document.getElementById("categoryTitle").textContent = "Выберите категорию";
      document.getElementById("domainList").innerHTML = "";
      categoryInfo.textContent = "";
      renderCategories();
    })
    .catch((error) => {
      console.error('Error loading data:', error);
      document.getElementById("categoryTitle").textContent = "Ошибка загрузки данных";
      document.getElementById("domainList").innerHTML = `<li>Не удалось загрузить данные: ${error.message}</li>`;
      categoryInfo.textContent = "";
    })
    .finally(() => {
      setLoading(false);
    });
}

// Отображение категорий
function renderCategories() {
  const list = document.getElementById("categoryList");
  list.innerHTML = "";

  filteredCategories.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.category;
    if (selectedCategory && selectedCategory.category === item.category) {
      li.classList.add("active");
    }
    li.onclick = () => showCategory(item);
    list.appendChild(li);
  });
}

// Копирование в буфер обмена
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    // Визуальная обратная связь будет добавлена через CSS
  });
}

// Отображение категории
function showCategory(item) {
  selectedCategory = item;
  document.getElementById("categoryTitle").textContent = `Категория: ${item.category}`;
  categoryInfo.textContent = `Записей: ${item.entries.length}`;
  
  const list = document.getElementById("domainList");
  list.innerHTML = "";

  const entriesToShow = item.matchingEntries || item.entries;
  
  entriesToShow.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry;
    li.onclick = () => {
      copyToClipboard(entry);
      li.classList.add("copied");
      setTimeout(() => li.classList.remove("copied"), 1000);
    };
    list.appendChild(li);
  });
  
  // Обновляем активную категорию в списке
  renderCategories();
}

// Загружаем данные при старте
loadData();

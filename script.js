let categories = [];
let filteredCategories = [];
let selectedCategory = null;
let currentMode = "geosite";
let searchTimeout = null;

const modeSelect = document.getElementById("modeSelect");
const loadingIndicator = document.getElementById("loading");
const searchInput = document.getElementById("search");
const searchInContent = document.getElementById("searchInContent");
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
searchInput.addEventListener("input", () => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  searchTimeout = setTimeout(performSearch, 300);
});

searchInContent.addEventListener("change", performSearch);

function performSearch() {
  const query = searchInput.value.toLowerCase().trim();
  
  if (query.length === 0) {
    filteredCategories = categories;
    searchInfo.textContent = "";
  } else {
    if (searchInContent.checked) {
      // Поиск по содержимому
      filteredCategories = categories.filter(category => {
        // Проверяем, есть ли совпадения в записях
        return category.entries.some(entry => 
          entry.toLowerCase().includes(query)
        );
      });

      // Подсчитываем общее количество записей, содержащих запрос
      const totalMatches = filteredCategories.reduce((sum, cat) => {
        return sum + cat.entries.filter(entry => 
          entry.toLowerCase().includes(query)
        ).length;
      }, 0);
      
      searchInfo.textContent = filteredCategories.length > 0
        ? `Найдено: ${filteredCategories.length} категорий, ${totalMatches} записей`
        : "Ничего не найдено";
    } else {
      // Поиск только по названиям категорий
      filteredCategories = categories.filter(category => 
        category.category.toLowerCase().includes(query)
      );
      
      searchInfo.textContent = filteredCategories.length > 0
        ? `Найдено: ${filteredCategories.length} категорий`
        : "Ничего не найдено";
    }
  }
  
  renderCategories();
  
  // Если выбрана категория, обновляем её отображение
  if (selectedCategory) {
    showCategory(selectedCategory);
  }
}

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
  
  const list = document.getElementById("domainList");
  list.innerHTML = "";

  // Проверяем, есть ли данные в категории
  if (!item.entries || item.entries.length === 0) {
    categoryInfo.textContent = "Нет записей";
    return;
  }

  categoryInfo.textContent = `Записей: ${item.entries.length}`;
  
  // Всегда показываем все записи категории, без фильтрации
  const entries = [...item.entries];
  
  // Сортируем записи по алфавиту
  entries.sort((a, b) => a.localeCompare(b));

  // Создаем и добавляем элементы списка
  entries.forEach((entry) => {
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

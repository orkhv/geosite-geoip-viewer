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
  const query = e.target.value.toLowerCase().trim();
  
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  searchTimeout = setTimeout(() => {
    if (query.length === 0) {
      filteredCategories = categories;
      searchInfo.textContent = "";
    } else {
      // Сначала ищем точные совпадения в названиях категорий
      const exactCategoryMatches = categories.filter(category => 
        category.category.toLowerCase() === query
      );

      // Затем ищем частичные совпадения в названиях категорий
      const partialCategoryMatches = categories.filter(category => 
        category.category.toLowerCase().includes(query) &&
        !exactCategoryMatches.includes(category)
      );

      // И только потом ищем в содержимом, если нет совпадений в названиях
      const contentMatches = categories.filter(category => {
        // Пропускаем категории, которые уже найдены
        if (exactCategoryMatches.includes(category) || partialCategoryMatches.includes(category)) {
          return false;
        }
        // Ищем в содержимом только если нет совпадений в названиях
        if (exactCategoryMatches.length === 0 && partialCategoryMatches.length === 0) {
          const matchingEntries = category.entries.filter(entry => 
            entry.toLowerCase().includes(query)
          );
          if (matchingEntries.length > 0) {
            category.matchingEntries = matchingEntries;
            return true;
          }
        }
        return false;
      });

      // Объединяем результаты в порядке приоритета
      filteredCategories = [
        ...exactCategoryMatches,
        ...partialCategoryMatches,
        ...contentMatches
      ];

      // Показываем информацию о результатах поиска
      const totalMatches = filteredCategories.reduce((sum, cat) => 
        sum + (cat.matchingEntries ? cat.matchingEntries.length : cat.entries.length), 0
      );
      
      if (filteredCategories.length === 0) {
        searchInfo.textContent = "Ничего не найдено";
      } else {
        searchInfo.textContent = `Найдено: ${filteredCategories.length} категорий, ${totalMatches} записей`;
        if (contentMatches.length > 0 && (exactCategoryMatches.length > 0 || partialCategoryMatches.length > 0)) {
          searchInfo.textContent += ` (включая ${contentMatches.length} категорий с совпадениями в содержимом)`;
        }
      }
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
  
  const list = document.getElementById("domainList");
  list.innerHTML = "";

  // Проверяем, есть ли данные в категории
  if (!item.entries || item.entries.length === 0) {
    categoryInfo.textContent = "Нет записей";
    return;
  }

  categoryInfo.textContent = `Записей: ${item.entries.length}`;
  
  // Определяем, какие записи показывать
  let entriesToShow = [];
  
  if (searchInput.value.trim() !== "") {
    // Если есть поисковый запрос, показываем только совпадающие записи
    const query = searchInput.value.toLowerCase().trim();
    entriesToShow = item.entries.filter(entry => 
      entry.toLowerCase().includes(query)
    );
  } else {
    // Если поиска нет, показываем все записи
    entriesToShow = item.entries;
  }

  // Сортируем записи по алфавиту
  entriesToShow.sort((a, b) => a.localeCompare(b));

  // Создаем и добавляем элементы списка
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

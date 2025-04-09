
let categories = [];
let filteredCategories = [];
let selectedCategory = null;
let currentMode = "geosite";

const modeSelect = document.getElementById("modeSelect");

modeSelect.addEventListener("change", () => {
  currentMode = modeSelect.value;
  loadData();
});

document.getElementById("search").addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  filteredCategories = categories.filter((item) =>
    item.category.toLowerCase().includes(query)
  );
  renderCategories();
});

function loadData() {
  fetch(`${currentMode}.json`)
    .then((res) => res.json())
    .then((data) => {
      categories = data;
      filteredCategories = categories;
      document.getElementById("categoryTitle").textContent = "Выберите категорию";
      document.getElementById("domainList").innerHTML = "";
      renderCategories();
    });
}

function renderCategories() {
  const list = document.getElementById("categoryList");
  list.innerHTML = "";

  filteredCategories.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.category;
    li.onclick = () => showCategory(item);
    list.appendChild(li);
  });
}

function showCategory(item) {
  selectedCategory = item;
  document.getElementById("categoryTitle").textContent = `Категория: ${item.category}`;
  const list = document.getElementById("domainList");
  list.innerHTML = "";

  item.entries.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry;
    list.appendChild(li);
  });
}

loadData();

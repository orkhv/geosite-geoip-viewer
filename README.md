<div align="center">

# 🌍 GeoSite / GeoIP Viewer

**Просмотр и поиск по geosite и geoip правилам для Xray прямо в браузере**

[![Открыть сайт](https://img.shields.io/badge/%D0%BE%D1%82%D0%BA%D1%80%D1%8B%D1%82%D1%8C-orkhv.github.io-2ea44f?style=for-the-badge&logo=github)](https://orkhv.github.io/geosite-geoip-viewer/)

[![Build and deploy](https://github.com/orkhv/geosite-geoip-viewer/actions/workflows/deploy.yml/badge.svg)](https://github.com/orkhv/geosite-geoip-viewer/actions/workflows/deploy.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)
![Zero deps](https://img.shields.io/badge/dependencies-0-blue)
![Updated](https://img.shields.io/badge/%D0%BE%D0%B1%D0%BD%D0%BE%D0%B2%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5-%D0%B5%D0%B6%D0%B5%D0%B4%D0%BD%D0%B5%D0%B2%D0%BD%D0%BE-orange)

</div>

---

## ✨ Возможности

- 🔀 **Четыре источника данных** — переключаются одним селектором
- 🔎 **Умный поиск в содержимом**
  - домен: `www.youtube.com` → найдёт `domain:youtube.com`, подходящие `keyword:` и `regexp:`
  - IP: `8.8.8.8` или `2001:4860:4860::8888` → все CIDR, куда адрес попадает
  - ASN: `1.1.1.1` → найдёт `AS13335` (Cloudflare)
- ⚡ **Быстро даже на огромных наборах** — категория на 800 000+ записей открывается за доли секунды
- 🔗 **Ссылки на категории** — `#xray-full/geoip/us` открывает сразу нужное
- 📋 **Клик по записи — копия в буфер**, клик по `geosite:name` — копия готового правила
- 🌙 Тёмная тема и мобильная вёрстка

## 📦 Источники

| Источник | GeoSite | GeoIP | Откуда |
| --- | --- | --- | --- |
| **Xray Lite** ⭐ | `geosite.dat` | `geoip-lite.dat` | [XTLS/Xray-rules-dat](https://github.com/XTLS/Xray-rules-dat) — идут в ядро по умолчанию |
| **Xray Full** | `geosite-expand.dat` | `geoip-full.dat` | [XTLS/Xray-rules-dat](https://github.com/XTLS/Xray-rules-dat) — расширенные списки + все страны |
| **Loyalsoldier** | `geosite.dat` | `geoip.dat` | [Loyalsoldier/v2ray-rules-dat](https://github.com/Loyalsoldier/v2ray-rules-dat) |
| **Medium1992** | `geosite.dat` | `geoip.dat` + `asn.dat` | [Medium1992/geo-dat](https://github.com/Medium1992/geo-dat) — сборка из MetaCubeX/meta-rules-dat, плюс все автономные системы |

## 🕒 Расписание

| Время (UTC) | Зачем |
| --- | --- |
| 19:30 | после сборки Xray-rules-dat (18:00) |
| 23:30 | после сборки Loyalsoldier (~22:00) |
| 07:30 | запасной прогон, если релизы задержались |

Плюс сборка при каждом пуше в `main` и ручной запуск.

---

<div align="center">
<sub>Написано нейросетями, работает с божей помощью 🙏</sub>
</div>

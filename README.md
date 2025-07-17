# Shopify-Bulk-Orders


This repository contains the custom **Bulk Order Page** built for a Shopify Plus store. It enables wholesale or B2B customers to quickly search, view, and add multiple products to their cart with quantity controls — designed for speed, simplicity, and efficiency.

---

## Features

- 🔍 **Live Product Search** with debounce
- 📦 **Bulk Add to Cart** with quantity stepper
- 🧾 **Cart Summary Sidebar** (live-updating with subtotal and item counts)
- 🟢 **Only Available Products Shown First**
- 🚫 **Excluded Tag Filtering** (e.g. `pharmacist-only`)
- ⚡ **Infinite Scroll + Load More** via paginated Shopify API
- 🏷️ **Sold Out Products Disabled** with "Sold Out" badge

---

## 🚀 How It Works

1. On page load, it fetches the first **5 pages of products** (`250 x 5`) from the `all` collection.
2. Displays **first 20 in-stock products**, sorted by availability.
3. Continues fetching additional pages in the background.
4. Customers can:
   - Adjust quantities
   - Add items to cart
   - View/update cart summary instantly
5. If a product is sold out, the **Add to Cart** button is disabled and replaced with a **"Sold Out"** indicator.

---

## 🧠 Tech Stack

- HTML / CSS / JavaScript
- Shopify Storefront Product API (`/products.json`)
- Shopify Ajax Cart API (`/cart/add.js`, `/cart/change.js`)
- Shopify Liquid (to restrict page to tagged users)

---

## ✉️ Future Enhancements

✅ Show SKU and Vendor in product row

🛠️ Add tiered pricing display (if metafields are used)

🔐 **B2B Access Control** — only customers with the `wholesale_customer` tag can access this page

🔒 Handle login + auto-tag request form (pending approval)

🪄 **"Pay Later" Workflow Support** for customers with credit terms

📤 Export order summary to CSV before checkout


## 👨‍💻 Developer Notes
You can test locally by using Shopify theme custom page and uploading the HTML/CSS/JS

Shopify doesn’t support server-side pagination, so we fetch and filter using /products.json with limit and page

## 📬 Questions?
For help or suggestions, reach out to [Your Name or Team].

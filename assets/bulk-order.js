  document.addEventListener("DOMContentLoaded", function () {

    window.storeCredits = {{ customer.store_credit_account.balance | default: 0 | money_without_currency | remove: ',' }};
  window.storeCurrency = "{{ shop.currency }}";

    
    const EXCLUDED_TAGS = ["pharmacist-only","wegovy"];
    const PRODUCTS_PER_PAGE = 250;
    const UI_BATCH_SIZE = 20;

    let allProducts = [];
    let filteredProducts = [];
    let localCart = [];
    let visibleCount = UI_BATCH_SIZE;
    let currentPage = 1;
    let maxPages = 1000;
    let isLoading = false;
    let currentSearchTerm = "";
    let userIsInteracting = false;

    // DOM elements
    const loadingIndicator = document.getElementById("loading");
    const loadingCart = document.getElementById("loading_cart");
    const loadMoreContainer = document.getElementById("load-more-container");
    const loadMoreBtn = document.getElementById("load-more");
    const productsTable = document.getElementById("products-table");
    const cartItemsContainer = document.getElementById("cart-items");
    const cartSubtotalEl = document.getElementById("cart-subtotal");
    const toastContainer = document.getElementById("toast");
    const searchInput = document.getElementById("search-input");

    // Utility: format money (fallback)
    if (!window.Shopify) window.Shopify = {};
    if (!Shopify.formatMoney) {
      Shopify.formatMoney = function (cents) {
        return `$${(parseInt(cents, 10) / 100).toFixed(2)}`;
      };
    }

    // Fetch all products with pagination, filtering excluded tags
    async function fetchAllProducts() {
      loadingIndicator.style.display = "block";
      allProducts = [];
      currentPage = 1;

      while (currentPage <= maxPages) {
        try {
          const res = await fetch(
            `/collections/all/products.json?limit=${PRODUCTS_PER_PAGE}&page=${currentPage}`
          );
          if (!res.ok) break;

          const data = await res.json();
          if (!data.products || data.products.length === 0) break;

          // Filter excluded tags
          const filteredBatch = data.products.filter(
            (p) =>
              !p.tags.some((tag) =>
                EXCLUDED_TAGS.includes(tag.toLowerCase().trim())
              )
          );

          allProducts = allProducts.concat(filteredBatch);
          //break; // ✅ stop after 1 page only

           if (data.products.length < PRODUCTS_PER_PAGE) break;
           currentPage++;
        } catch (error) {
          console.error("Error fetching products page", currentPage, error);
          break;
        }
      }

      loadingIndicator.style.display = "none";
    }

    async function fetchFirstPage() {
      loadingIndicator.style.display = "block";
      const combinedProducts = [];
    
      try {
        for (let page = 1; page <= 5; page++) {
          const res = await fetch(`/collections/all/products.json?limit=${PRODUCTS_PER_PAGE}&page=${page}&sort_by=best-selling`);
          const data = await res.json();
    
          if (!data.products || data.products.length === 0) break;
    
          const filtered = data.products.filter(
            (p) =>
              !p.tags.some((tag) =>
                EXCLUDED_TAGS.includes(tag.toLowerCase().trim())
              )
          );
    
          combinedProducts.push(...filtered);
    
          if (data.products.length < PRODUCTS_PER_PAGE) break;
        }
    
        // Store all for search/filter later
        allProducts = combinedProducts;
    
        // Sort: In-stock first, then sold out
        allProducts.sort((a, b) => {
          const aAvailable = a.variants?.[0]?.available;
          const bAvailable = b.variants?.[0]?.available;
          if (aAvailable === bAvailable) return 0;
          return aAvailable ? -1 : 1;
        });
    
        // First 20 available only
        const availableProducts = allProducts.filter(
          (p) => p.variants?.[0]?.available
        );
    
        filteredProducts = [...allProducts]; // use for full browsing + load more
    
        renderTable(availableProducts.slice(0, UI_BATCH_SIZE));
        toggleLoadMore();
      } catch (err) {
        console.error("Error fetching first 5 pages:", err);
      } finally {
        loadingIndicator.style.display = "none";
      }
    }


    async function fetchRemainingPages() {
      let page = 6;
    
      while (page <= maxPages) {
        try {
          const res = await fetch(`/collections/all/products.json?limit=${PRODUCTS_PER_PAGE}&page=${page}`);
          const data = await res.json();
    
          if (!data.products || data.products.length === 0) break;
    
          const filtered = data.products.filter(
            (p) =>
              !p.tags.some((tag) =>
                EXCLUDED_TAGS.includes(tag.toLowerCase().trim())
              )
          );
    
          allProducts = allProducts.concat(filtered);

          if (!userIsInteracting) {
        // Update filteredProducts only if user NOT interacting
          // If user is actively searching while more pages are loading
          if (currentSearchTerm.length > 1) {
            filteredProducts = allProducts.filter((p) =>
              p.title.toLowerCase().includes(currentSearchTerm)
            );
        } else {
          filteredProducts = [...allProducts];
        }
            renderTable(filteredProducts.slice(0, visibleCount));
            toggleLoadMore();
          }
    
          if (data.products.length < PRODUCTS_PER_PAGE) break;
          page++;
          //console.log('page: '+page);
        } catch (err) {
          console.error("Error in background product loading (page", page, "):", err);
          break;
        }
      }
    }



    // Render products table (up to visibleCount)
    function renderTable(products) {
      if (products.length === 0) {
        productsTable.innerHTML = `<p>No products found.</p>`;
        loadMoreContainer.style.display = "none";
        return;
      }

      // Sort: In-stock first, sold-out last
      products.sort((a, b) => {
        const aAvailable = a.variants?.[0]?.available;
        const bAvailable = b.variants?.[0]?.available;
    
        if (aAvailable === bAvailable) return 0;
        if (aAvailable) return -1; // a is available, b is not → a first
        return 1; // b is available, a is not → b first
      });

      // Table HTML for desktop
      let html = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 1rem;">
          <thead>
            <tr style="border-bottom: 2px solid #ccc;">
              <th style="text-align: left; padding: 12px;">Image</th>
              <th style="text-align: left; padding: 12px;">Title</th>
              <th style="padding: 12px;">Price</th>
              <th style="padding: 12px;">Quantity</th>
              <th style="padding: 12px;">Action</th>
            </tr>
          </thead>
          <tbody>
      `;

      // Cards HTML for mobile
      let cardsHTML = `<div class="mobile-product-cards" style="display: flex; flex-direction: column; gap: 16px;">`;

      for (const product of products) {
        const variant = product.variants?.[0];
        const available = variant?.available;
        const isSoldOut = !available;
        const image = product.images?.[0]?.src || "";
        const price = variant ? Shopify.formatMoney(parseFloat(variant.price) * 100) : "N/A";


        // If no variants, disable qty & add button
        const disableControls = !variant;

        // For table
       html += `
        <tr data-variant-id="${variant?.id || ""}" data-title="${product.title}" data-price="${variant?.price || 0}">
          <td style="padding: 10px;">
            ${
              image
                ? `<img src="${image}" alt="${product.title}" style="width: 60px; height: auto;" />`
                : `<span style="color: #888;">No Image</span>`
            }
          </td>
          <td style="padding: 10px;">${product.title}</td>
          <td style="text-align: center; padding: 10px;">${price}</td>
          <td style="text-align: center; padding: 10px;">
            ${
              isSoldOut
                ? `<span style="color: red; font-weight: bold;">Sold Out</span>`
                : `
              <div style="display: flex; justify-content: center; align-items: center; gap: 4px;">
                <button class="qty-minus" style="width: 30px; height: 30px;">-</button>
                <input type="number" min="0" value="" placeholder="0" class="qty" style="width: 50px; text-align: center;" />
                <button class="qty-plus" style="width: 30px; height: 30px;">+</button>
              </div>
              `
            }
          </td>
          <td style="text-align: center; padding: 10px;">
            ${
              isSoldOut
                ? `<button disabled style="padding: 8px 16px; background: #ccc; color: #888; border: none; border-radius: 6px; cursor: not-allowed;">Sold Out</button>`
                : `<button class="add-to-cart" style="padding: 8px 16px; background: #ee2737; color: white; border: none; border-radius: 6px; cursor: pointer;">Add</button>`
            }
          </td>
        </tr>
      `;

      // For mobile cards
      cardsHTML += `
        <div class="product-card" data-variant-id="${variant?.id || ""}" data-title="${product.title}" data-price="${variant?.price || 0}" style="border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #fff;">
          <div style="display: flex; gap: 12px; align-items: center;">
            <div style="flex-shrink: 0;">
              ${
                image
                  ? `<img src="${image}" alt="${product.title}" style="width: 80px; height: auto; border-radius: 4px;" />`
                  : `<span style="color: #888;">No Image</span>`
              }
            </div>
            <div style="flex-grow: 1;">
              <h4 style="margin: 0 0 6px 0;">${product.title}</h4>
              <div style="font-weight: bold; margin-bottom: 8px;">${price}</div>
              ${
                isSoldOut
                  ? `<div style="color: red; font-weight: bold;">Sold Out</div>`
                  : `
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                  <button class="qty-minus" style="width: 28px; height: 28px;">-</button>
                  <input type="number" min="0" value="" placeholder="0" class="qty" style="width: 48px; text-align: center; border: 1px solid #ccc; border-radius: 4px;" />
                  <button class="qty-plus" style="width: 28px; height: 28px;">+</button>
                </div>
                `
              }
              <button class="add-to-cart" style="padding: 8px 20px; background: #ee2737; color: white; border: none; border-radius: 6px; cursor: pointer; width: 100%;">Add</button>
            </div>
          </div>
        </div>
      `;
      }

      html += "</tbody></table>";
      cardsHTML += "</div>";

      // Inject both, and use CSS to show/hide based on screen size
      productsTable.innerHTML = `
        <div class="desktop-product-table">${html}</div>
        <div class="mobile-product-cards-container">${cardsHTML}</div>
      `;

      attachEvents();
    }

    // Attach qty buttons and add-to-cart click handlers
    function attachEvents() {
      document.querySelectorAll(".qty-plus").forEach((btn) => {
        btn.onclick = () => {
          userIsInteracting = true;
          const input = btn.parentElement.querySelector(".qty");
          input.value = Math.max(0, parseInt(input.value || "0") + 1);
        };
      });

      document.querySelectorAll(".qty-minus").forEach((btn) => {
        btn.onclick = () => {
          userIsInteracting = true;
          const input = btn.parentElement.querySelector(".qty");
          input.value = Math.max(0, parseInt(input.value || "0") - 1);
        };
      });

      document.querySelectorAll(".qty").forEach((btn) => {
        btn.onclick = () => {
          userIsInteracting = true;
        };
      });

      document.querySelectorAll(".add-to-cart").forEach((btn) => {
        btn.onclick = async () => {
          const row = btn.closest("tr") || btn.closest(".product-card");
          const variantId = row.getAttribute("data-variant-id");
          const title = row.getAttribute("data-title");
          const price = parseInt(row.getAttribute("data-price"));
          const qtyInput = row.querySelector(".qty");
          const qty = parseInt(qtyInput.value);

          if (!variantId) {
            showToast("This product has no purchasable variants.", "error");
            return;
          }
          if (isNaN(qty) || qty < 1) {
            showToast("Please enter a quantity before adding.", "error");
            return;
          }

          // 🔄 Add spinner to button
          const originalBtnText = btn.innerHTML;
          btn.innerHTML = `<span class="spinner" style="
            display: inline-block;
            width: 16px;
            height: 16px;
            margin:0;
            border: 2px solid #f3f3f3;
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
          "></span>`;
          btn.disabled = true;
          loadingCart.style.display = "block";

          try {
            //console.log("Adding to cart:", { variantId, qty });
          
            const response = await fetch("/cart/add.js", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: variantId, quantity: qty }),
            });
          
            const resData = await response.json(); // get the response body
                        
          
            if (!response.ok) {
              throw new Error("Failed to add to cart");
            }

            try {
              const qty = resData.quantity
              //updateCartSummary(variantId, title, price, qty);
              await syncCartWithShopify();
              showToast(`${title} added to cart!`, "success");
              qtyInput.value = 0;
              userIsInteracting = false;
              // ✅ Scroll to cart summary after add
              // const cartSection = document.getElementById("cart-summary");
              // const header = document.getElementById("shopify-section-header");
              // const headerHeight = header ? header.offsetHeight : 0;
              // const cartTop = cartSection.getBoundingClientRect().top + window.scrollY - headerHeight;
              // window.scrollTo({ top: cartTop, behavior: "smooth" });
              btn.innerText = "Added!";
            } catch (err) {
              console.error("updateCartSummary error:", err);
              showToast("Cart updated, but summary failed.", "error");
            }

            qtyInput.value = 0;
          } catch (error) {
            showToast("Failed to add to cart. Please try again.", "error");
          } finally {
            loadingCart.style.display = "none";

          // Reset button after delay
          setTimeout(() => {
            btn.innerText = originalBtnText;
            btn.disabled = false;
          }, 2000);
          }
        };
      });
    }

    // Update cart data and render summary
    function updateCartSummary(variantId, title, price, qty) {

      if (!variantId || !title || !price || !qty) {
    console.warn("Missing data in updateCartSummary:", { variantId, title, price, qty });
    return;
  }
      
      const existing = localCart.find((item) => item.variantId === variantId);
      if (existing) {
        existing.qty += qty;
      } else {
        const imgEl = document.querySelector(`tr[data-variant-id="${variantId}"] img`) ||  document.querySelector(`.product-card[data-variant-id="${variantId}"] img`);
        const image = imgEl ? imgEl.src : "";
        localCart.push({ variantId, title, price, qty, image });
      }
      renderCartSummary();
    }

    async function updateShopifyCart(variantId, newQty, oldqty) {
      console.log("Updating cart:", { variantId, newQty });
      try {
        const cartRes = await fetch("/cart.js");
        const cart = await cartRes.json();

        loadingCart.style.display = "block";
    
        const item = cart.items.find((i) => i.variant_id == variantId);
        if (!item) {
          console.error("❌ Line item not found for variant ID:", variantId);
          return;
        }

        const ititle = item.title;
    
        console.log("🛒 Updating line item:", {
          variantId,
          key: item.key,
          quantity: newQty,
          title: item.title,
        });
    
        const changeRes = await fetch("/cart/change.js", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: item.key,        // 🔥 Shopify expects the `line_item.key` here
            quantity: newQty,    // ✅ Must be integer >= 0
          }),
        });
    
        const result = await changeRes.json();
    
        if (!changeRes.ok) {
          console.error("❌ Shopify /cart/change.js failed:", result);
    
          // Extract stock limit from error message
          let availableQtyMessage = `Requested quantity not available for "${ititle}".`;
          const match = result?.description?.match(/maximum.*?(\d+)/i);
          if (match && match[1]) {
            availableQtyMessage = `Only ${match[1]} of "${ititle}" available in stock.`;
          }
    
          showToast(availableQtyMessage, "error");
          loadingCart.style.display = "none";
          await syncCartWithShopify(ititle); // pass title here
          throw new Error("Update failed");
        }

        loadingCart.style.display = "none";
        showToast("Cart updated successfully");
    
        console.log("✅ Cart updated successfully:", result);
      } catch (err) {
        
          showToast("Cart Update failed", "error");
        console.error("💥 Cart change error:", err);
        loadingCart.style.display = "none";
        syncCartWithShopify();
      }
    }

    
    async function removeFromShopifyCart(variantId) {
      try {
        const res = await fetch("/cart.js");
        const cart = await res.json();

        loadingCart.style.display = "block";
    
        // Find correct line item key by matching variantId
        const lineItem = cart.items.find((item) => item.variant_id == variantId);
        if (!lineItem) throw new Error("Line item not found");
    
        const changeRes = await fetch("/cart/change.js", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: lineItem.key, // key is required here, not variant_id
            quantity: 0,
          }),
        });
    
        if (!changeRes.ok) throw new Error("Cart change failed");

        loadingCart.style.display = "none";
         //showToast("Cart updated successfully");
      } catch (err) {
        console.error("Cart change error:", err);
      }
    }

    async function syncCartWithShopify(productTitle = "") {
      try {
        const res = await fetch("/cart.js");
        const data = await res.json();
    
        localCart = data.items.map((item) => ({
          variantId: item.variant_id,
          title: item.title,
          price: item.price / 100, // convert cents to dollars
          qty: item.quantity,
          image: item.image, // can be null
        }));
    
        renderCartSummary();
      } catch (err) {
        console.error("Failed to fetch Shopify cart:", err);const fallbackMsg = productTitle
      ? `Couldn't update cart for "${productTitle}". Please refresh the page.`
      : `Failed to sync cart. Please refresh.`;

    showToast(fallbackMsg, "error");
      }
    }


    // Render cart summary UI
    function renderCartSummary() {
      cartItemsContainer.innerHTML = "";
      let subtotal = 0;

      localCart.forEach((item, idx) => {

        //console.log('item ' +item.title);
        //console.log('price ' +item.price);
        const lineTotal = item.qty * item.price;
        const lineprice = item.price;
        subtotal += lineTotal;

        const itemDiv = document.createElement("div");
        itemDiv.style.marginBottom = "12px";

        if (item.image) {
          const img = document.createElement("img");
          img.src = item.image || "";
          img.alt = item.title;
          img.style.width = "50px";
          img.style.height = "auto";
          itemDiv.appendChild(img);
        }

        const title = document.createElement("strong");
        title.innerText = item.title;

        const wrapper = document.createElement("div");
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.gap = "8px";
        wrapper.style.marginTop = "4px";

        const minusBtn = document.createElement("button");
        minusBtn.textContent = "-";
        minusBtn.style.cssText = "width: 24px; height: 24px; cursor: pointer;";
        minusBtn.onclick = async () => {
          if (item.qty > 1) {
            const oldqty = item.qty
            item.qty--;
            await updateShopifyCart(item.variantId, item.qty);
            renderCartSummary();
          } else {
            await removeFromShopifyCart(item.variantId,0);
            localCart.splice(idx, 1);
            renderCartSummary();
          }
        };

        const qtyDisplay = document.createElement("span");
        qtyDisplay.textContent = item.qty;
        qtyDisplay.style.minWidth = "20px";
        qtyDisplay.style.textAlign = "center";

        const plusBtn = document.createElement("button");
        plusBtn.textContent = "+";
        plusBtn.style.cssText = "width: 24px; height: 24px; cursor: pointer;";
        plusBtn.onclick = async () => {
          const oldqty = item.qty
          item.qty++;
          await updateShopifyCart(item.variantId, item.qty, oldqty);
          renderCartSummary();
        };

        const subtotalText = document.createElement("span");
        subtotalText.innerText = `Price: $`+lineprice;
        subtotalText.style.flex = "1";

        const removeBtn = document.createElement("button");
        removeBtn.innerText = "×";
        removeBtn.style.cssText =
          "background: none; border: none; color: red; font-weight: bold; cursor: pointer;";
        removeBtn.onclick = async () => {
          await removeFromShopifyCart(item.variantId, 0);
          localCart.splice(idx, 1);
          renderCartSummary();
          showToast(`${item.title} removed from cart.`, "success");
        };

        wrapper.appendChild(minusBtn);
        wrapper.appendChild(qtyDisplay);
        wrapper.appendChild(plusBtn);
        wrapper.appendChild(subtotalText);
        wrapper.appendChild(removeBtn);

        itemDiv.appendChild(title);
        itemDiv.appendChild(wrapper);

        cartItemsContainer.appendChild(itemDiv);
      });

      const totalQty = localCart.reduce((sum, item) => sum + item.qty, 0);
      cartSubtotalEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span><strong>Total Items:</strong></span>
          <span>${totalQty}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span><strong>Subtotal:</strong></span>
          <span>$${subtotal.toFixed(2)}</span>
        </div>
      `;

        // Show store credits info
        const creditsContainer = document.getElementById("store-credits");
        if (window.storeCredits !== undefined) {
          const credits = parseFloat(window.storeCredits);
          const remaining = credits - subtotal;
          const currency = window.storeCurrency || "$";
      
          creditsContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-top: 8px;">
              <span><strong>Store Credits Available:</strong></span>
              <span>${currency}${credits.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 4px; color: ${remaining < 0 ? "red" : "green"};">
              <span><strong>Remaining Credits after Purchase:</strong></span>
              <span>${currency}${remaining.toFixed(2)}</span>
            </div>
          `;
        }
    }




    // Show toast notifications
    function showToast(message, type = "success") {
      const toastMsg = document.createElement("div");
      toastMsg.style.cssText = `
        background: ${type === "success" ? "#4caf50" : "#ff0031"};
        color: white;
        padding: 12px 16px;
        margin-top: 10px;
        border-radius: 6px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        font-size: 14px;
        animation: fadein 0.3s ease, fadeout 0.3s ease 2.7s;
        max-width: 300px;
      `;
      toastMsg.innerText = message;
      toastContainer.appendChild(toastMsg);

      setTimeout(() => {
        toastMsg.style.opacity = "0";
        setTimeout(() => toastContainer.removeChild(toastMsg), 300);
      }, 3000);
    }

    // Filter products by search term (case insensitive), reset pagination
    function filterProductsBySearch(term) {
      currentSearchTerm = term.toLowerCase().trim();
      visibleCount = UI_BATCH_SIZE;

      if (currentSearchTerm.length > 1) {
        filteredProducts = allProducts.filter((p) =>
          p.title.toLowerCase().includes(currentSearchTerm)
        );
      } else {
        filteredProducts = [...allProducts];
      }

      renderTable(filteredProducts.slice(0, visibleCount));
      toggleLoadMore();
    }

    // Load more button click handler
    loadMoreBtn.addEventListener("click", () => {
      userIsInteracting = false;
      const spinner = document.getElementById("load-more-spinner");
      loadMoreBtn.innerText="Loading..."
      // Show mini spinner
      spinner.style.display = "block";
  
      // Add a small delay to simulate realistic load time (optional)
      setTimeout(() => {
        visibleCount += UI_BATCH_SIZE;
        renderTable(filteredProducts.slice(0, visibleCount));
        toggleLoadMore();

        loadMoreBtn.innerText="Load More Products"
        // Hide spinner
        spinner.style.display = "none";
      }, 400); // optional slight delay for UX
    });

    // Show or hide Load More button depending on products left
    function toggleLoadMore() {
      if (visibleCount < filteredProducts.length) {
        loadMoreContainer.style.display = "block";
      } else {
        loadMoreContainer.style.display = "none";
      }
    }

    // Debounced search input handler
    let searchTimeout = null;
    searchInput.addEventListener("input", (e) => {      
      userIsInteracting = true;
      clearTimeout(searchTimeout);
      const val = e.target.value.trim();
      searchTimeout = setTimeout(() => {
        filterProductsBySearch(val);
        userIsInteracting = false;  // reset after search done
      }, 400);
    });

    // Initial load all products, then show first batch
    async function init() {
      await fetchFirstPage();
      //await fetchAllProducts();
      renderTable(filteredProducts.slice(0, UI_BATCH_SIZE));
      toggleLoadMore();
      await syncCartWithShopify(); // <-- fetch real cart and display it
      fetchRemainingPages();
    }

    init();
  });

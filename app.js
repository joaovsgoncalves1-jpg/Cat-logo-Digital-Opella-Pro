        // ------------------------------------------------------------
        // SEÇÃO 1: CONSTANTES E CONFIGURAÇÕES GLOBAIS
        // ------------------------------------------------------------
        const WHATSAPP_NUMBER = "5584996887483";
        const MIN_ORDER = 150.00;
        const IMG_DEFAULT = "https://cdn-icons-png.flaticon.com/512/883/883407.png";
        const FEATURED_PREORDER_ID = "7891058005993";
        const FEATURED_PREORDER_CATEGORY = "Novalgina";

        // ------------------------------------------------------------
        // SEÇÃO 2: FUNÇÕES AUXILIARES (GLOBALMENTE DISPONÍVEIS)
        // ------------------------------------------------------------
        function getCardStyle(cat) {
            const styles = {
                'Dorflex': 'card-dorflex', 'Enterogermina': 'card-entero', 'Allegra': 'card-allegra', 
                'Novalgina': 'card-novalgina', 'Anador': 'card-anador', 'Targifor': 'card-targifor', 
                'Moura': 'card-moura', 'Oscal': 'card-oscal', 'Dulco': 'card-dulco', 
                'Bisolvon': 'card-bisolvon', 'Fenergan': 'card-fenergan'
            };
            return styles[cat] || 'bg-white';
        }

        function getTextStyle(cat) {
            const styles = {
                'Dorflex': 'text-dorflex', 'Enterogermina': 'text-entero', 'Allegra': 'text-allegra', 
                'Novalgina': 'text-novalgina', 'Anador': 'text-anador', 'Targifor': 'text-targifor', 
                'Moura': 'text-moura', 'Oscal': 'text-oscal', 'Dulco': 'text-dulco', 
                'Bisolvon': 'text-bisolvon', 'Fenergan': 'text-fenergan'
            };
            return styles[cat] || 'text-gray-800';
        }

        function getBadgeStyle(cat) {
            const styles = {
                'Dorflex': 'btn-dorflex-active', 'Enterogermina': 'btn-enterogermina-active', 'Allegra': 'btn-allegra-active', 
                'Novalgina': 'btn-novalgina-active', 'Anador': 'btn-anador-active', 'Targifor': 'btn-targifor-active', 
                'Moura': 'btn-moura-active', 'Oscal': 'btn-oscal-active', 'Dulco': 'btn-dulco-active', 
                'Bisolvon': 'btn-bisolvon-active', 'Fenergan': 'btn-fenergan-active'
            };
            return styles[cat] || 'bg-gray-800 text-white';
        }

        function getPrice(p, qty) {
            if (!p || !p.tiers) return 0; // Proteção contra produto indefinido
            const tier = [...p.tiers].reverse().find(t => qty >= t.q);
            return tier ? tier.p : p.tiers[0].p;
        }

        function getNextTierHint(p, qty) {
            if (!p || !p.tiers || qty <= 0) return null;
            
            for (let i = 0; i < p.tiers.length; i++) {
                if (qty < p.tiers[i].q) {
                    const falta = p.tiers[i].q - qty;
                    const economia = ((p.tiers[Math.max(0, i-1)].p - p.tiers[i].p) * p.tiers[i].q).toFixed(2);
                    return {
                        falta: falta,
                        tierQty: p.tiers[i].q,
                        desconto: p.tiers[i].d,
                        economia: economia
                    };
                }
            }
            return null;
        }

        const productData = window.PRODUCT_DATA;
        if (!productData) {
            console.error('Dados de produtos não carregados. Verifique products.js.');
        }
        const imgMap = productData?.imgMap || {};
        const rawProducts = productData?.rawProducts || [];
        const products = rawProducts.map((p) => {
            let img = imgMap[p.name] || (p.image || IMG_DEFAULT);
            // Fallback para novos itens Anador sem imagem específica no mapa
            if (p.cat === 'Anador' && img === IMG_DEFAULT) {
                img = 'https://promofarma.vtexassets.com/arquivos/ids/168106/7896886410834.jpg?v=637952133732100000';
            }
            return {
                id: p.id,
                cat: p.cat,
                name: p.name,
                image: img,
                base: p.base,
                tiers: p.tiers,
                fraction: p.fraction,
                isCampaign: p.isCampaign || false // Propaga a flag de campanha
            };
        });

        // Mapa de produtos por ID para busca O(1) em vez de O(n)
        const productsMap = {};
        products.forEach(p => { productsMap[p.id] = p; });

        // ------------------------------------------------------------
        // SEÇÃO 4: VARIÁVEIS DE ESTADO E FUNÇÕES PRINCIPAIS
        // ------------------------------------------------------------
        
        let cart = {}; 
        let currentCategory = 'all';
        let currentCalcProduct = null;
        let chartInstance = null;
        let calcMode = 'box'; 
        let orderHistory = JSON.parse(localStorage.getItem('opella_history')) || [];
        let favorites = JSON.parse(localStorage.getItem('opella_favorites')) || [];
        const LAST_CNPJ_KEY = 'opella_last_cnpj';
        const NETWORK_ORDERS_KEY = 'opella_network_orders';
        let networkOrders = JSON.parse(localStorage.getItem(NETWORK_ORDERS_KEY)) || [];
        
        // === FAVORITOS ===
        function toggleFavorite(id) {
            const idx = favorites.indexOf(id);
            if (idx > -1) {
                favorites.splice(idx, 1);
            } else {
                favorites.push(id);
            }
            localStorage.setItem('opella_favorites', JSON.stringify(favorites));
            
            // Se estivermos na categoria favoritos ou campanha, re-renderizar
            if (currentCategory === 'favorites' || currentCategory === 'campaign') {
                render();
            } else {
                render(); // Render normal para atualizar o ícone
            }
        }
        
        function isFavorite(id) {
            return favorites.includes(id);
        }
        
        // === QUICK REORDER ===
        function getLastOrder() {
            return orderHistory.length > 0 ? orderHistory[0] : null;
        }
        
        function quickReorder() {
            const lastOrder = getLastOrder();
            if (lastOrder && lastOrder.cartSnapshot) {
                cart = JSON.parse(JSON.stringify(lastOrder.cartSnapshot));
                saveCart();
                render();
                // Feedback visual
                const bar = document.getElementById('quick-reorder-bar');
                if (bar) {
                    bar.innerHTML = '<i class="fas fa-check text-green-600"></i> <span class="text-green-700 font-bold text-xs">Pedido restaurado!</span>';
                    setTimeout(() => updateQuickReorderBar(), 2000);
                }
            }
        }
        
        function updateQuickReorderBar() {
            const container = document.getElementById('quick-reorder-container');
            if (!container) return;
            
            const lastOrder = getLastOrder();
            if (lastOrder) {
                container.innerHTML = `
                    <div id="quick-reorder-bar" class="quick-reorder-bar" onclick="quickReorder()">
                        <div class="w-9 h-9 bg-green-500 rounded-full flex items-center justify-center text-white">
                            <i class="fas fa-redo text-sm"></i>
                        </div>
                        <div class="flex-1">
                            <p class="text-[11px] font-bold text-green-800">Repetir Último Pedido</p>
                            <p class="text-[9px] text-green-600">${lastOrder.itemsCount} itens • R$ ${lastOrder.total.toFixed(2).replace('.',',')} • ${lastOrder.date.split(',')[0]}</p>
                        </div>
                        <i class="fas fa-chevron-right text-green-400 text-sm"></i>
                    </div>
                `;
            } else {
                container.innerHTML = '';
            }
        }

        window.onload = function() {
            // --- CORREÇÃO DE SEGURANÇA: SANITIZAÇÃO DO CARRINHO ---
            const savedCart = localStorage.getItem('opella_cart');
            if (savedCart) {
                try {
                    let loadedCart = JSON.parse(savedCart);
                    cart = {};
                    Object.keys(loadedCart).forEach(id => {
                        // Verifica se o ID existe na lista atual de produtos
                        if (products.some(p => p.id === id)) {
                            cart[id] = loadedCart[id];
                        }
                    });
                } catch(e) {
                    cart = {}; 
                }
            }
            // ------------------------------------------------------
            render();
            updateHistoryList();
            updateQuickReorderBar(); // Inicializa Quick Reorder
            
            // --- Lazy loading para imagens ---
            if ('IntersectionObserver' in window) {
                const imgObserver = new IntersectionObserver((entries, observer) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const img = entry.target;
                            img.src = img.dataset.src;
                            img.classList.add('loaded');
                            observer.unobserve(img);
                        }
                    });
                }, { rootMargin: '100px' });
                
                window.imgObserver = imgObserver;
            }
            
            const slider = document.getElementById('category-scroll');
            let isDown = false;
            let startX;
            let scrollLeft;

            slider.addEventListener('mousedown', (e) => {
                isDown = true;
                slider.classList.add('active');
                startX = e.pageX - slider.offsetLeft;
                scrollLeft = slider.scrollLeft;
            });
            slider.addEventListener('mouseleave', () => {
                isDown = false;
                slider.classList.remove('active');
            });
            slider.addEventListener('mouseup', () => {
                isDown = false;
                slider.classList.remove('active');
            });
            slider.addEventListener('mousemove', (e) => {
                if(!isDown) return;
                e.preventDefault();
                const x = e.pageX - slider.offsetLeft;
                const walk = (x - startX) * 2; 
                slider.scrollLeft = scrollLeft - walk;
            });
        };

        function setCategory(cat) {
            currentCategory = cat;
            document.querySelectorAll('.cat-btn').forEach(btn => {
                btn.classList.remove(
                    'btn-dorflex-active', 'btn-enterogermina-active', 'btn-allegra-active', 
                    'btn-novalgina-active', 'btn-anador-active', 'btn-targifor-active', 
                    'btn-moura-active', 'btn-oscal-active', 'btn-dulco-active', 
                    'btn-bisolvon-active', 'btn-fenergan-active', 'btn-favorites-active', 'cat-btn-all-active', 'btn-campaign-active'
                );
            });

            const activeBtn = document.getElementById(cat === 'favorites' ? 'btn-favorites' : (cat === 'campaign' ? 'btn-campaign' : 'btn-' + cat));
            if(activeBtn) {
                if(cat === 'all') activeBtn.classList.add('cat-btn-all-active');
                else if (cat === 'favorites') activeBtn.classList.add('btn-favorites-active');
                else if (cat === 'campaign') activeBtn.classList.add('btn-campaign-active');
                else {
                    const activeClass = `btn-${cat.toLowerCase()}-active`;
                    activeBtn.classList.add(activeClass);
                }
            }
            render();
        }

        function openFeaturedPreOrder() {
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = '';

            setCategory(FEATURED_PREORDER_CATEGORY);

            setTimeout(() => {
                const target = document.getElementById('product-' + FEATURED_PREORDER_ID);
                if (!target) return;

                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.classList.add('highlight-product');
                setTimeout(() => target.classList.remove('highlight-product'), 3000);
            }, 80);
        }
        function render() {
            const container = document.getElementById('product-list');
            const searchInput = document.getElementById('search-input');
            const search = searchInput ? searchInput.value.toLowerCase() : "";
            
            // Se houver busca, ignoramos a categoria atual (comportamento padrão)
            // Se não houver busca, usamos a categoria selecionada (incluindo 'favorites' ou 'campaign')
            const effectiveCategory = (search.length > 0) ? 'all' : currentCategory;
            
            container.innerHTML = '';

            const filtered = products.filter(p => {
                const matchesSearch = p.name.toLowerCase().includes(search) || p.id.includes(search);
                
                let matchesCat = false;
                if (effectiveCategory === 'all') {
                    matchesCat = true;
                } else if (effectiveCategory === 'favorites') {
                    matchesCat = isFavorite(p.id);
                } else if (effectiveCategory === 'campaign') {
                    // Exibe APENAS os itens marcados como Campanha
                    matchesCat = p.isCampaign === true;
                } else {
                    matchesCat = p.cat === effectiveCategory;
                }

                return matchesSearch && matchesCat;
            });
            
            // Ordenação: Itens de campanha primeiro APENAS quando em 'campaign'
            // Quando em 'all', mantém a ordem original do array products (sequencial por marca)
            if (effectiveCategory === 'campaign') {
                 filtered.sort((a, b) => (b.isCampaign === true ? 1 : 0) - (a.isCampaign === true ? 1 : 0));
            }

            if(filtered.length === 0) {
                let msg = "Nada encontrado.";
                if (currentCategory === 'favorites' && search.length === 0) {
                    msg = "Você ainda não tem favoritos.";
                } else if (currentCategory === 'campaign' && search.length === 0) {
                    msg = "Nenhum produto da campanha encontrado.";
                }
                container.innerHTML = `<div class="text-center text-gray-400 mt-10"><i class="fas fa-box-open text-4xl mb-2"></i><p>${msg}</p></div>`; return;
            }

            let lastCat = '';

            filtered.forEach(p => {
                // Show category header if showing ALL, FAVORITES or CAMPAIGN (since they can be mixed)
                if((effectiveCategory === 'all' || effectiveCategory === 'favorites' || effectiveCategory === 'campaign') && p.cat !== lastCat) {
                    lastCat = p.cat;
                    const catHeader = document.createElement('div');
                    catHeader.className = `font-bold text-xs uppercase tracking-widest mt-8 mb-2 ml-1 ${getTextStyle(p.cat)} flex items-center gap-2`;
                    let badgeColorClass = getBadgeStyle(p.cat).split(' ')[0];
                    if(badgeColorClass.startsWith('text')) badgeColorClass = 'bg-gray-800'; 
                    catHeader.innerHTML = `<span class="w-1 h-4 ${badgeColorClass} rounded-full"></span> ${p.cat}`;
                    container.appendChild(catHeader);
                }

                const qty = cart[p.id] || 0;
                const currentPrice = getPrice(p, qty);
                const isPromo = currentPrice < p.tiers[0].p;
                const cardClass = getCardStyle(p.cat);
                const textClass = getTextStyle(p.cat);
                const badgeClass = getBadgeStyle(p.cat);

                const card = document.createElement('div');
                card.id = 'product-' + p.id; // Added ID for anchor scrolling
                card.className = `product-card p-4 rounded-xl shadow-sm border relative mb-3 ${cardClass}`;
                
                // Botão de Favorito
                const favClass = isFavorite(p.id) ? 'active' : '';
                
                // Hint do próximo tier
                const nextTier = getNextTierHint(p, qty);
                let nextTierHtml = '';
                if (nextTier && qty > 0) {
                    nextTierHtml = `
                        <div class="next-tier-hint">
                            <i class="fas fa-arrow-up"></i>
                            +${nextTier.falta} un → ${nextTier.desconto}% OFF
                        </div>
                    `;
                }
                
                // Lazy loading: usar data-src para imagens
                const imgHtml = window.imgObserver 
                    ? `<img data-src="${p.image}" class="w-full h-full object-contain mix-blend-multiply lazy-img" alt="${p.name}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E">`
                    : `<img src="${p.image}" class="w-full h-full object-contain mix-blend-multiply" alt="${p.name}">`;
                
                card.innerHTML = `
                    <button onclick="event.stopPropagation(); toggleFavorite('${p.id}')" class="favorite-btn ${favClass}" title="Favoritar">
                        <i class="fas fa-heart"></i>
                    </button>
                    <div class="flex gap-4 items-start">
                        <div class="w-20 h-20 flex-shrink-0 bg-white rounded-lg border border-white/50 p-1 flex items-center justify-center shadow-sm relative text-center">
                             ${p.isCampaign ? '<span class="absolute -top-1 -left-1 text-[9px] bg-red-600 text-white px-1 rounded font-bold shadow-sm z-10"><i class="fas fa-fire"></i></span>' : ''}
                             ${imgHtml}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-start text-left">
                                <div>
                                    <h3 class="font-bold text-sm leading-tight ${textClass} uppercase">${p.name}</h3>
                                    <p class="text-[10px] text-gray-500 mt-1 bg-white/50 inline-block px-1 rounded font-mono text-left">EAN: ${p.id}</p>
                                    <div class="flex items-center gap-2 mt-1">
                                         <p class="text-[12px] text-red-500 font-bold line-through">Base: R$ ${p.base.toFixed(2).replace('.',',')}</p>
                                         <button onclick="openCalc('${p.id}')" class="text-blue-500 hover:text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1 border border-blue-200" title="Calculadora de Markup">
                                            <i class="fas fa-calculator"></i> Margem
                                         </button>
                                    </div>
                                    <p class="text-xl font-black mt-0 ${isPromo ? 'text-green-600' : textClass} text-left">R$ ${currentPrice.toFixed(2).replace('.',',')}</p>
                                    ${nextTierHtml}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex gap-2 mt-3 overflow-x-auto scrollbar-hide pb-1 pr-4">
                        ${p.tiers.map(t => {
                            const isReached = qty >= t.q;
                            const isCurrent = isReached && (p.tiers[p.tiers.indexOf(t)+1] ? qty < p.tiers[p.tiers.indexOf(t)+1].q : true);
                            
                            // Lógica de destaque para descontos altos (>= 19%)
                            const isHighDiscount = t.d >= 19;
                            const tierClass = isHighDiscount ? 'tier-active-campaign' : 'tier-active';
                            // Se não for o atual, mas for alcançado e high discount -> laranja claro. Se normal -> verde claro.
                            const reachedBg = isHighDiscount ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200';
                            
                            return `
                            <div onclick="toggleQty('${p.id}', ${t.q})" class="tier-box ${isCurrent ? tierClass : (isReached ? reachedBg : 'bg-white')} rounded-lg px-2 py-1 text-[10px] min-w-[75px] flex flex-col items-center shadow-sm transition-all relative">
                                <span class="font-bold uppercase">${t.q} un</span>
                                <span class="text-xs">R$ ${t.p.toFixed(2).replace('.',',')}</span>
                                <span class="text-[9px] ${isHighDiscount ? 'text-orange-600 font-black' : (t.d > 0 ? 'text-green-600 font-bold' : 'text-gray-400')}">
                                    ${t.d > 0 ? `(-${t.d}% OFF)` : ''} ${isHighDiscount ? '<i class="fas fa-fire"></i>' : ''}
                                </span>
                            </div>`;
                        }).join('')}
                    </div>

                    <div class="flex items-center justify-between mt-2 bg-white/90 p-1.5 rounded-xl border border-white/60">
                        <button onclick="changeQty('${p.id}', -1)" class="w-10 h-10 bg-white rounded-lg shadow-sm text-gray-600 font-bold active:bg-gray-100 transition-colors">-</button>
                        <input type="number" value="${qty > 0 ? qty : ''}" placeholder="0" onchange="manualInput('${p.id}', this.value)" class="w-full text-center bg-transparent font-bold text-gray-800 text-lg focus:outline-none">
                        <button onclick="changeQty('${p.id}', 1)" class="w-10 h-10 ${badgeClass} rounded-lg shadow-md font-bold active:scale-95 transition-colors">+</button>
                    </div>`;
                container.appendChild(card);
                
                // Ativar lazy loading para esta imagem
                if (window.imgObserver) {
                    const lazyImg = card.querySelector('.lazy-img');
                    if (lazyImg) window.imgObserver.observe(lazyImg);
                }
            });
            updateCartBar();
        }

        // Funções de Carrinho e Persistência
        function updateProductCard(id) {
            const card = document.getElementById('product-' + id);
            if (!card) { render(); return; }
            const p = productsMap[id];
            if (!p) return;

            const qty = cart[id] || 0;
            const currentPrice = getPrice(p, qty);
            const isPromo = currentPrice < p.tiers[0].p;
            const textClass = getTextStyle(p.cat);

            // Atualizar preço
            const priceEl = card.querySelector('.text-xl');
            if (priceEl) {
                priceEl.className = `text-xl font-black mt-0 ${isPromo ? 'text-green-600' : textClass} text-left`;
                priceEl.textContent = `R$ ${currentPrice.toFixed(2).replace('.',',')}`;
            }

            // Atualizar hint de próximo tier
            const nextTier = getNextTierHint(p, qty);
            let existingHint = card.querySelector('.next-tier-hint');
            if (nextTier && qty > 0) {
                if (!existingHint) {
                    existingHint = document.createElement('div');
                    existingHint.className = 'next-tier-hint';
                    priceEl?.parentNode?.appendChild(existingHint);
                }
                existingHint.innerHTML = `<i class="fas fa-arrow-up"></i> +${nextTier.falta} un → ${nextTier.desconto}% OFF`;
            } else if (existingHint) {
                existingHint.remove();
            }

            // Atualizar tiers visuais
            const tierBoxes = card.querySelectorAll('.tier-box');
            p.tiers.forEach((t, i) => {
                const box = tierBoxes[i];
                if (!box) return;
                const isReached = qty >= t.q;
                const isCurrent = isReached && (p.tiers[i+1] ? qty < p.tiers[i+1].q : true);
                const isHighDiscount = t.d >= 19;
                const tierClass = isHighDiscount ? 'tier-active-campaign' : 'tier-active';
                const reachedBg = isHighDiscount ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200';

                box.className = `tier-box ${isCurrent ? tierClass : (isReached ? reachedBg : 'bg-white')} rounded-lg px-2 py-1 text-[10px] min-w-[75px] flex flex-col items-center shadow-sm transition-all relative`;
            });

            // Atualizar input de quantidade
            const input = card.querySelector('input[type="number"]');
            if (input && document.activeElement !== input) {
                input.value = qty > 0 ? qty : '';
            }

            updateCartBar();
        }

        function toggleQty(id, t) {
            cart[id] = (cart[id] === t) ? 0 : t;
            saveCart();
            updateProductCard(id);
        }
        function changeQty(id, delta) {
            if (!cart[id]) cart[id] = 0;
            cart[id] += delta;
            if (cart[id] < 0) cart[id] = 0;
            saveCart();
            updateProductCard(id);
        }
        function manualInput(id, value) {
            let val = parseInt(value);
            if(isNaN(val) || val < 0) val = 0;
            cart[id] = val;
            saveCart();
            updateProductCard(id);
        }
        
        function saveCart() {
            localStorage.setItem('opella_cart', JSON.stringify(cart));
        }

        function saveNetworkOrders() {
            localStorage.setItem(NETWORK_ORDERS_KEY, JSON.stringify(networkOrders));
        }

        function getCartSummary(cartSnapshot) {
            let total = 0;
            let totalBase = 0;
            let itemCount = 0;

            Object.keys(cartSnapshot || {}).forEach(id => {
                const qty = cartSnapshot[id];
                if (qty > 0) {
                    const p = productsMap[id];
                    if (p) {
                        const price = getPrice(p, qty);
                        total += price * qty;
                        totalBase += p.base * qty;
                        itemCount += qty;
                    }
                }
            });

            return {
                total: total,
                totalBase: totalBase,
                savings: Math.max(0, totalBase - total),
                itemCount: itemCount
            };
        }

        function getPrazoForTotal(total) {
            if (total >= 500) {
                const prazoElem = document.querySelector('input[name="prazo"]:checked');
                return prazoElem ? prazoElem.value : "50 dias direto";
            }
            return "50 dias direto";
        }

        function buildOrderItemsText(cartSnapshot) {
            let text = '';
            let currentCat = '';
            const sortedCartIds = Object.keys(cartSnapshot).sort((a, b) => {
                const pA = productsMap[a];
                const pB = productsMap[b];
                return (pA?.cat || '').localeCompare(pB?.cat || '');
            });

            sortedCartIds.forEach(id => {
                const qty = cartSnapshot[id];
                if (qty > 0) {
                    const p = productsMap[id];
                    if (p) {
                        const price = getPrice(p, qty);
                        if (p.cat !== currentCat) {
                            text += `\n*--- ${p.cat.toUpperCase()} ---*\n`;
                            currentCat = p.cat;
                        }
                        text += `  *${qty}x* ${p.name}\n`;
                        text += `   └ R$ ${price.toFixed(2).replace('.',',')} un\n`;
                        text += `> EAN: ${p.id}\n`;
                    }
                }
            });

            return text;
        }

        // --- CLEAR CART SYSTEM ---
        function toggleScrollLock(lock) {
            if (lock) {
                document.documentElement.classList.add('no-scroll');
                document.body.classList.add('no-scroll');
            } else {
                document.documentElement.classList.remove('no-scroll');
                document.body.classList.remove('no-scroll');
            }
        }

        function askClearCart() {
            toggleScrollLock(true);
            document.getElementById('clear-modal').classList.remove('hidden');
        }

        function closeClearModal() {
            toggleScrollLock(false);
            document.getElementById('clear-modal').classList.add('hidden');
        }

        function performClearCart() {
            cart = {};
            saveCart();
            render();
            closeClearModal();
            closeModal(); // fecha o modal de checkout se estiver aberto
        }

        function clearCart() {
             askClearCart(); // Redireciona para o novo sistema
        }

        function updateCartBar() {
            let total = 0; let totalBase = 0; let count = 0;
            Object.keys(cart).forEach(id => { 
                const qty = cart[id]; 
                if(qty > 0) { 
                    const p = productsMap[id]; 
                    if(p) {
                        total += getPrice(p, qty) * qty; 
                        totalBase += p.base * qty;
                        count += qty; 
                    }
                } 
            });
            
            const savings = Math.max(0, totalBase - total);
            const savingsModal = document.getElementById('total-savings-modal');
            if(savingsModal) savingsModal.innerText = 'R$ ' + savings.toFixed(2).replace('.',',');

            const label = document.getElementById('installment-label');
            const installment = document.getElementById('cart-installment');
            const totalSmall = document.getElementById('cart-total-small');
            const progressFill = document.getElementById('progress-fill');
            const bar = document.getElementById('cart-bar');
            const btnReview = document.getElementById('btn-review');
            
            // Atualiza indicador de CNPJ ativo na barra
            const cnpjInput = document.getElementById('cnpj-input');
            const activeCnpjDisplay = document.getElementById('active-cnpj-display');
            if (activeCnpjDisplay) {
                const currentCnpj = cnpjInput?.value || localStorage.getItem(LAST_CNPJ_KEY) || 'Não definido';
                activeCnpjDisplay.innerText = count > 0 ? `Editando: ${currentCnpj}` : '';
            }

            const progressPercent = Math.min((total / 500) * 100, 100);
            if(progressFill) progressFill.style.width = progressPercent + '%';
            const networkTotal = networkOrders.reduce((sum, order) => sum + (order.total || 0), 0);

            if(total < MIN_ORDER) {
                if(progressFill) progressFill.className = "h-full bg-red-500 transition-all duration-500";
                const missing = (MIN_ORDER - total).toFixed(2).replace('.',',');
                if(label) label.innerHTML = `<span class="text-red-500 font-bold text-[12px] uppercase tracking-tighter text-left">Faltam R$ ${missing} para pedido mínimo</span>`;
                if(installment) {
                    installment.innerText = "R$ " + total.toFixed(2).replace('.',',');
                    installment.className = "text-2xl font-black text-gray-900 leading-none text-left text-left";
                }
                if(btnReview) btnReview.disabled = networkOrders.length === 0;
            } else if (total >= 500) {
                if(progressFill) progressFill.className = "h-full bg-green-500 transition-all duration-500";
                if(label) label.innerHTML = `<span class="bg-green-100 text-green-800 px-2 py-0.5 rounded text-[12px] font-black uppercase tracking-tight text-left">Prazo disponível: 40/60 dias</span>`;
                if(installment) {
                    installment.innerText = "2x de R$ " + (total/2).toFixed(2).replace('.',',');
                    installment.className = "text-2xl font-black text-green-600 leading-none text-left text-left";
                }
                if(btnReview) btnReview.disabled = false;
            } else {
                if(progressFill) progressFill.className = "h-full bg-blue-500 transition-all duration-500";
                const missing = (500 - total).toFixed(2).replace('.',',');
                if(label) label.innerHTML = `<span class="text-blue-600 font-bold text-[12px] uppercase tracking-tighter text-left">Faltam R$ ${missing} para parcelar</span>`;
                if(installment) {
                    installment.innerText = "R$ " + total.toFixed(2).replace('.',',');
                    installment.className = "text-2xl font-black text-gray-900 leading-none text-left text-left";
                }
                if(btnReview) btnReview.disabled = false;
            }
            
            if(totalSmall) {
                let footerText = `Total: R$ ${total.toFixed(2).replace('.',',')} (Econ: R$ ${savings.toFixed(2).replace('.',',')})`;
                if (networkOrders.length > 0) {
                    footerText += ` | Rede: R$ ${networkTotal.toFixed(2).replace('.',',')} (${networkOrders.length} CNPJ)`;
                }
                totalSmall.innerText = footerText;
            }
            if ((count > 0 || networkOrders.length > 0) && bar) bar.classList.remove('hidden'); else if(bar) bar.classList.add('hidden');
        }

        // --- DASHBOARD SYSTEM ---
        function openDashboard() {
            toggleScrollLock(true);
            let total = 0; let totalBase = 0; let count = 0;
            let brandTotals = {};

            Object.keys(cart).forEach(id => { 
                const qty = cart[id]; 
                if(qty > 0) { 
                    const p = productsMap[id]; 
                    if(p) { // Check p
                        const price = getPrice(p, qty);
                        const val = price * qty;
                        total += val; 
                        totalBase += p.base * qty;
                        count += qty;
                        
                        brandTotals[p.cat] = (brandTotals[p.cat] || 0) + val;
                    }
                } 
            });

            document.getElementById('dash-total-items').innerText = count;
            document.getElementById('dash-total-savings').innerText = 'R$ ' + Math.max(0, totalBase - total).toFixed(2).replace('.',',');
            
            const listEl = document.getElementById('brand-summary-list');
            listEl.innerHTML = '';
            const sortedBrands = Object.entries(brandTotals).sort((a,b) => b[1] - a[1]);
            
            sortedBrands.forEach(([brand, val]) => {
                const perc = total > 0 ? (val/total)*100 : 0;
                listEl.innerHTML += `
                <div class="flex justify-between items-center text-xs border-b border-gray-100 last:border-0 py-2">
                    <span class="font-bold text-gray-700">${brand}</span>
                    <div class="text-right">
                        <span class="font-bold block">R$ ${val.toFixed(2).replace('.',',')}</span>
                        <span class="text-[9px] text-gray-400">${perc.toFixed(1)}%</span>
                    </div>
                </div>`;
            });

            const ctx = document.getElementById('categoryChart').getContext('2d');
            if(chartInstance) chartInstance.destroy();
            
            chartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: sortedBrands.map(x => x[0]),
                    datasets: [{
                        data: sortedBrands.map(x => x[1]),
                        backgroundColor: [
                            '#E20613', '#009EE2', '#C5007F', '#009640', '#FFBD59', 
                            '#F57F20', '#0055b8', '#003366', '#00aed9', '#FFD700', '#32CD32'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } }
                    }
                }
            });

            document.getElementById('dashboard-modal').classList.remove('hidden');
        }

        function closeDashboard() {
            toggleScrollLock(false);
            document.getElementById('dashboard-modal').classList.add('hidden');
        }

        // --- CALCULATOR SYSTEM ---
        function openCalc(id) {
            try {
                // Safety first: Open modal before logic to avoid freeze
                document.getElementById('calc-modal').classList.remove('hidden');
                toggleScrollLock(true);

                currentCalcProduct = productsMap[id];
                
                if (!currentCalcProduct) {
                    throw new Error("Produto não encontrado");
                }

                const toggle = document.getElementById('calc-fraction-toggle');
                toggle.classList.add('hidden'); // Always hide the toggle (choice is automatic)

                if(currentCalcProduct.fraction) {
                    // Hospital/Fractional items: force unit mode
                    setCalcMode('unit');
                } else {
                    // Standard items: force box mode
                    setCalcMode('box');
                }

                document.getElementById('calc-sell').value = ''; 
                // Removed auto-focus to prevent keyboard popup
                // document.getElementById('calc-sell').focus(); 
            } catch (e) {
                console.error("Erro na calculadora:", e);
                closeCalc(); // Auto-close on error to prevent lock
                alert("Erro ao abrir calculadora para este item.");
            }
        }

        function setCalcMode(mode) {
            calcMode = mode;
            // Button references kept for code compatibility, though hidden
            const btnBox = document.getElementById('btn-calc-box');
            const btnUnit = document.getElementById('btn-calc-unit');
            
            if(mode === 'box') {
                btnBox.className = "flex-1 py-1.5 text-[10px] font-bold rounded bg-yellow-400 text-white shadow-sm transition-all";
                btnUnit.className = "flex-1 py-1.5 text-[10px] font-bold rounded text-gray-500 hover:bg-gray-50 transition-all";
                document.getElementById('label-calc-cost').innerText = "Custo da Caixa (R$)";
                document.getElementById('label-calc-sell').innerText = "Venda da Caixa (R$)";
            } else {
                btnBox.className = "flex-1 py-1.5 text-[10px] font-bold rounded text-gray-500 hover:bg-gray-50 transition-all";
                btnUnit.className = "flex-1 py-1.5 text-[10px] font-bold rounded bg-yellow-400 text-white shadow-sm transition-all";
                const unitName = currentCalcProduct.fraction ? currentCalcProduct.fraction.unit : 'Unidade';
                document.getElementById('label-calc-cost').innerText = `Custo por ${unitName} (R$)`;
                document.getElementById('label-calc-sell').innerText = `Venda por ${unitName} (R$)`;
            }
            
            updateCalcValues();
            calculateMargin(); 
        }

        function updateCalcValues() {
            const qty = cart[currentCalcProduct.id] || 0;
            let cost = getPrice(currentCalcProduct, Math.max(1, qty));
            
            if(calcMode === 'unit' && currentCalcProduct.fraction) {
                cost = cost / currentCalcProduct.fraction.divisor;
            }
            
            document.getElementById('calc-cost').value = cost.toFixed(2);
        }

        function calculateMargin() {
            const cost = parseFloat(document.getElementById('calc-cost').value);
            const sell = parseFloat(document.getElementById('calc-sell').value);
            
            if(sell > 0) {
                const profit = sell - cost;
                const margin = (profit / sell) * 100;
                
                const resultEl = document.getElementById('calc-result');
                const valEl = document.getElementById('calc-profit-val');
                
                resultEl.innerText = margin.toFixed(1) + '%';
                valEl.innerText = 'Lucro: R$ ' + profit.toFixed(2).replace('.',',');
                
                if(margin < 0) {
                    resultEl.className = "text-3xl font-black text-red-400";
                } else if (margin < 20) {
                    resultEl.className = "text-3xl font-black text-yellow-400";
                } else {
                    resultEl.className = "text-3xl font-black text-green-400";
                }
            } else {
                 document.getElementById('calc-result').innerText = '0.0%';
                 document.getElementById('calc-profit-val').innerText = 'Lucro: R$ 0,00';
                 document.getElementById('calc-result').className = "text-3xl font-black";
            }
        }

        function closeCalc() {
            toggleScrollLock(false);
            document.getElementById('calc-modal').classList.add('hidden');
        }

        // --- HISTORY SYSTEM ---
        function saveToHistory(total) {
            const now = new Date();
            const record = {
                date: now.toLocaleString('pt-BR'),
                total: total,
                itemsCount: Object.values(cart).reduce((a,b)=>a+b,0),
                cartSnapshot: JSON.parse(JSON.stringify(cart))
            };
            orderHistory.unshift(record);
            if(orderHistory.length > 5) orderHistory.pop(); 
            localStorage.setItem('opella_history', JSON.stringify(orderHistory));
            updateHistoryList();
        }

        function updateHistoryList() {
            const container = document.getElementById('history-list');
            if(!container) return;
            container.innerHTML = '';
            
            if(orderHistory.length === 0) {
                container.innerHTML = '<p class="text-center text-gray-400 text-xs mt-4">Nenhum pedido anterior.</p>';
                return;
            }

            orderHistory.forEach((rec, idx) => {
                const div = document.createElement('div');
                div.className = "bg-gray-50 p-3 rounded-xl border border-gray-200 flex justify-between items-center";
                div.innerHTML = `
                    <div>
                        <p class="text-xs font-bold text-gray-700">${rec.date}</p>
                        <p class="text-[10px] text-gray-500">${rec.itemsCount} itens</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-black text-green-700">R$ ${rec.total.toFixed(2).replace('.',',')}</p>
                        <button onclick="restoreCart(${idx})" class="text-[9px] text-blue-600 underline font-bold">Carregar</button>
                    </div>
                `;
                container.appendChild(div);
            });
        }

        function restoreCart(idx) {
            // Pequeno modal ou confirm customizado seria ideal, mas aqui um alert simples ajuda no debug rápido, 
            // porém, seguindo a regra de não usar confirm/alert, vamos apenas carregar direto.
            cart = orderHistory[idx].cartSnapshot;
            saveCart();
            render();
            closeHistoryModal();
        }
        
        function clearHistory() {
            orderHistory = [];
            localStorage.removeItem('opella_history');
            updateHistoryList();
        }

        function openHistoryModal() {
            toggleScrollLock(true);
            document.getElementById('history-modal').classList.remove('hidden');
        }
        function closeHistoryModal() {
            toggleScrollLock(false);
            document.getElementById('history-modal').classList.add('hidden');
        }

        // --- PDF EXPORT ---
        function exportPDF() {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const cnpjInput = document.getElementById('cnpj-input');
            const typedCnpj = cnpjInput ? cnpjInput.value.trim() : '';
            const savedCnpj = localStorage.getItem(LAST_CNPJ_KEY) || '';
            const currentCnpj = typedCnpj || savedCnpj;

            const ordersToExport = networkOrders.map(o => ({
                cnpj: o.cnpj,
                cartSnapshot: JSON.parse(JSON.stringify(o.cartSnapshot || {})),
                total: o.total || 0,
                totalBase: o.totalBase || 0,
                prazo: o.prazo || "50 dias direto"
            }));

            const currentSummary = getCartSummary(cart);
            if (currentSummary.itemCount > 0) {
                if (!currentCnpj && ordersToExport.length > 0) {
                    alert("Digite o CNPJ do pedido atual antes de exportar PDF consolidado.");
                    return;
                }
                const fallbackCnpj = currentCnpj || "Não informado";
                localStorage.setItem(LAST_CNPJ_KEY, fallbackCnpj);
                ordersToExport.push({
                    cnpj: fallbackCnpj,
                    cartSnapshot: JSON.parse(JSON.stringify(cart)),
                    total: currentSummary.total,
                    totalBase: currentSummary.totalBase,
                    prazo: getPrazoForTotal(currentSummary.total)
                });
            }

            if (ordersToExport.length === 0) {
                alert("Nenhum pedido para exportar.");
                return;
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(18);
            doc.text("Pedido Opella - Fev 2026", 14, 20);
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Data: ${new Date().toLocaleString('pt-BR')}`, 14, 26);
            doc.text(`Quantidade de CNPJs: ${ordersToExport.length}`, 14, 32);

            // --- NOVO: Tabela de Resumo da Rede na primeira página ---
            const summaryRows = ordersToExport.map((o, i) => [
                `CNPJ ${i+1}: ${o.cnpj}`,
                `R$ ${o.total.toFixed(2).replace('.',',')}`
            ]);
            doc.autoTable({
                startY: 38,
                head: [['Identificação do Pedido', 'Valor Total']],
                body: summaryRows,
                theme: 'grid',
                headStyles: { fillColor: [31, 41, 55] } // Gray-800
            });
            let y = doc.lastAutoTable.finalY + 15;

            let grandTotal = 0;
            let grandSavings = 0;

            ordersToExport.forEach((order, idx) => {
                if (y > 250) {
                    doc.addPage();
                    y = 20;
                }

                doc.setFont("helvetica", "bold");
                doc.setFontSize(12);
                doc.text(`CNPJ ${idx + 1}: ${order.cnpj}`, 14, y);
                y += 6;

                const tableRows = [];
                const sortedCartIds = Object.keys(order.cartSnapshot || {}).sort((a,b) => {
                    const pA = productsMap[a];
                    const pB = productsMap[b];
                    return (pA?.cat || '').localeCompare(pB?.cat || '');
                });

                sortedCartIds.forEach(id => {
                    const qty = order.cartSnapshot[id];
                    if (qty > 0) {
                        const p = productsMap[id];
                        if (p) {
                            const price = getPrice(p, qty);
                            const subtotal = price * qty;
                            tableRows.push([p.cat, p.id, p.name, qty, `R$ ${price.toFixed(2).replace('.',',')}`, `R$ ${subtotal.toFixed(2).replace('.',',')}`]);
                        }
                    }
                });

                doc.autoTable({
                    startY: y,
                    head: [['Marca', 'EAN', 'Produto', 'Qtd', 'Unit.', 'Total']],
                    body: tableRows,
                    theme: 'striped',
                    headStyles: { fillColor: [22, 163, 74] }
                });

                const orderSavings = Math.max(0, (order.totalBase || 0) - (order.total || 0));
                const finalY = doc.lastAutoTable.finalY + 6;
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.text(`Subtotal: R$ ${(order.total || 0).toFixed(2).replace('.',',')}`, 14, finalY);
                doc.text(`Economia: R$ ${orderSavings.toFixed(2).replace('.',',')}`, 14, finalY + 5);
                doc.setFont("helvetica", "normal");
                doc.text(`Prazo: ${order.prazo || "50 dias direto"}`, 14, finalY + 10);

                grandTotal += order.total || 0;
                grandSavings += orderSavings;
                y = finalY + 18;
            });

            if (y > 260) {
                doc.addPage();
                y = 20;
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text(`TOTAL GERAL REDE: R$ ${grandTotal.toFixed(2).replace('.',',')}`, 14, y);
            doc.text(`ECONOMIA GERAL: R$ ${grandSavings.toFixed(2).replace('.',',')}`, 14, y + 7);

            const fileName = ordersToExport.length > 1 ? 'pedido_opella_rede.pdf' : 'pedido_opella.pdf';
            doc.save(fileName);
        }

        // --- CORE FUNCTIONS ---
        function openModal() { 
            toggleScrollLock(true);

            const container = document.getElementById('cart-items-preview');
            const savingsModal = document.getElementById('total-savings-modal');
            container.innerHTML = '';
            
            let total = 0;
            let totalBase = 0;
            
            // Agrupar por marca
            const brandGroups = {};

            const sortedCartIds = Object.keys(cart).sort((a,b) => {
                const pA = productsMap[a];
                const pB = productsMap[b];
                return (pA?.cat || '').localeCompare(pB?.cat || '');
            });

            sortedCartIds.forEach(id => {
                const qty = cart[id];
                if(qty > 0) {
                    const p = productsMap[id];
                    if (p) {
                        const price = getPrice(p, qty);
                        total += price * qty;
                        totalBase += p.base * qty;
                        
                        if (!brandGroups[p.cat]) {
                            brandGroups[p.cat] = { items: [], subtotal: 0 };
                        }
                        brandGroups[p.cat].items.push({ product: p, qty, price });
                        brandGroups[p.cat].subtotal += price * qty;
                    }
                }
            });

            // Renderizar agrupado por marca
            const brandColors = {
                'Dorflex': '#E20613', 'Enterogermina': '#009EE2', 'Allegra': '#C5007F',
                'Novalgina': '#009640', 'Anador': '#FFBD59', 'Targifor': '#F57F20',
                'Moura': '#0055b8', 'Oscal': '#003366', 'Dulco': '#00aed9',
                'Bisolvon': '#FFD700', 'Fenergan': '#32CD32'
            };

            Object.keys(brandGroups).forEach(cat => {
                const group = brandGroups[cat];
                const color = brandColors[cat] || '#6b7280';
                
                const groupDiv = document.createElement('div');
                groupDiv.className = 'brand-summary-checkout';
                
                let itemsHtml = group.items.map(item => `
                    <div class="flex gap-2 items-center py-1 text-left">
                        <img src="${item.product.image}" class="w-8 h-8 object-contain mix-blend-multiply bg-white rounded p-0.5 border">
                        <div class="flex-1 min-w-0">
                            <p class="text-[9px] font-bold text-gray-700 truncate">${item.product.name}</p>
                            <p class="text-[8px] text-gray-500">${item.qty} un × R$ ${item.price.toFixed(2).replace('.',',')}</p>
                        </div>
                        <p class="text-[10px] font-bold text-gray-800">R$ ${(item.price * item.qty).toFixed(2).replace('.',',')}</p>
                    </div>
                `).join('');
                
                groupDiv.innerHTML = `
                    <div class="brand-header">
                        <span class="brand-dot" style="background-color: ${color}"></span>
                        <span class="text-[10px] font-bold text-gray-700 flex-1">${cat}</span>
                        <span class="text-[10px] font-bold text-gray-900">R$ ${group.subtotal.toFixed(2).replace('.',',')}</span>
                    </div>
                    ${itemsHtml}
                `;
                
                container.appendChild(groupDiv);
            });

            const savings = Math.max(0, totalBase - total);
            if(savingsModal) savingsModal.innerText = 'R$ ' + savings.toFixed(2).replace('.',',');

            // --- Lógica de Pagamento Simplificada ---
            // Removemos a opção de prazo especial para > 3k.
            if (total >= 500) {
                document.getElementById('payment-options').classList.remove('hidden');
                document.getElementById('payment-single').classList.add('hidden');

                const grid = document.getElementById('payment-options-grid');
                grid.innerHTML = `
                    <label class="flex items-center gap-2 cursor-pointer bg-white p-2 rounded-lg border border-blue-200 hover:border-blue-400 transition-all text-left">
                        <input type="radio" name="prazo" value="2x (40/60 dias)" class="w-4 h-4 text-blue-600" checked>
                        <span class="text-[10px] font-bold text-gray-800">2x (40/60 dias)</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer bg-white p-2 rounded-lg border border-blue-200 hover:border-blue-400 transition-all text-left">
                        <input type="radio" name="prazo" value="50 dias direto" class="w-4 h-4 text-blue-600">
                        <span class="text-[10px] font-bold text-gray-800 text-left">50 dias direto</span>
                    </label>
                `;
            } else {
                document.getElementById('payment-options').classList.add('hidden');
                document.getElementById('payment-single').classList.remove('hidden');
            }

            // Preenche automaticamente com o ultimo CNPJ usado no envio.
            const cnpjInput = document.getElementById('cnpj-input');
            const lastCnpj = localStorage.getItem(LAST_CNPJ_KEY) || '';
            if (cnpjInput && lastCnpj && !cnpjInput.value.trim()) {
                cnpjInput.value = lastCnpj;
            }

            renderNetworkOrdersPreview();

            document.getElementById('checkout-modal').classList.remove('hidden'); 
        }

        function closeModal() { 
            toggleScrollLock(false);
            document.getElementById('checkout-modal').classList.add('hidden'); 
        }

        function renderNetworkOrdersPreview() {
            const container = document.getElementById('network-orders-preview');
            const totalEl = document.getElementById('network-grand-total');
            if (!container || !totalEl) return;

            if (networkOrders.length === 0) {
                container.innerHTML = '<p class="text-[11px] text-gray-400">Nenhum pedido de CNPJ separado ainda.</p>';
                totalEl.innerText = 'R$ 0,00';
                return;
            }

            container.innerHTML = '';
            let grandTotal = 0;
            networkOrders.forEach((order, idx) => {
                grandTotal += order.total || 0;
                const card = document.createElement('div');
                card.className = 'bg-white border border-gray-200 rounded-lg p-3';
                card.innerHTML = `
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <p class="text-[11px] font-black text-gray-800">CNPJ: ${order.cnpj}</p>
                            <p class="text-[10px] text-gray-500">${order.itemsCount || 0} itens</p>
                        </div>
                        <p class="text-[11px] font-black text-green-700">R$ ${(order.total || 0).toFixed(2).replace('.',',')}</p>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <button onclick="editNetworkOrder(${idx})" class="text-[10px] py-2 rounded-lg font-bold bg-blue-50 text-blue-700 border border-blue-200">Editar</button>
                        <button onclick="removeNetworkOrder(${idx})" class="text-[10px] py-2 rounded-lg font-bold bg-red-50 text-red-700 border border-red-200">Remover</button>
                    </div>
                `;
                container.appendChild(card);
            });

            totalEl.innerText = `R$ ${grandTotal.toFixed(2).replace('.',',')}`;
        }

        function addCurrentCartToNetwork() {
            const summary = getCartSummary(cart);
            if (summary.itemCount === 0) {
                alert('Adicione itens antes de criar pedido para outro CNPJ.');
                return;
            }

            const cnpjInput = document.getElementById('cnpj-input');
            const typedCnpj = cnpjInput ? cnpjInput.value.trim() : '';
            const savedCnpj = localStorage.getItem(LAST_CNPJ_KEY) || '';
            const cnpj = typedCnpj || savedCnpj;
            if (!cnpj) {
                alert('Digite o CNPJ deste pedido antes de separar.');
                return;
            }

            localStorage.setItem(LAST_CNPJ_KEY, cnpj);
            const prazo = getPrazoForTotal(summary.total);

            const existingIdx = networkOrders.findIndex(o => o.cnpj === cnpj);
            if (existingIdx >= 0) {
                const merged = JSON.parse(JSON.stringify(networkOrders[existingIdx].cartSnapshot || {}));
                Object.keys(cart).forEach(id => {
                    const qty = cart[id] || 0;
                    if (qty > 0) merged[id] = (merged[id] || 0) + qty;
                });
                const mergedSummary = getCartSummary(merged);
                networkOrders[existingIdx] = {
                    ...networkOrders[existingIdx],
                    cartSnapshot: merged,
                    total: mergedSummary.total,
                    totalBase: mergedSummary.totalBase,
                    itemsCount: mergedSummary.itemCount,
                    prazo: prazo
                };
            } else {
                networkOrders.push({
                    id: Date.now(),
                    cnpj: cnpj,
                    cartSnapshot: JSON.parse(JSON.stringify(cart)),
                    total: summary.total,
                    totalBase: summary.totalBase,
                    itemsCount: summary.itemCount,
                    prazo: prazo
                });
            }

            saveNetworkOrders();
            cart = {};
            saveCart();
            render();
            if (cnpjInput) cnpjInput.value = '';
            openModal();
        }

        function editNetworkOrder(idx) {
            const order = networkOrders[idx];
            if (!order) return;
            cart = JSON.parse(JSON.stringify(order.cartSnapshot || {}));
            saveCart();
            networkOrders.splice(idx, 1);
            saveNetworkOrders();
            render();
            const cnpjInput = document.getElementById('cnpj-input');
            if (cnpjInput) cnpjInput.value = order.cnpj || '';
            openModal();
        }

        function removeNetworkOrder(idx) {
            if (!networkOrders[idx]) return;
            networkOrders.splice(idx, 1);
            saveNetworkOrders();
            renderNetworkOrdersPreview();
            updateCartBar();
        }

        function clearNetworkOrders() {
            if (networkOrders.length === 0) return;
            networkOrders = [];
            saveNetworkOrders();
            renderNetworkOrdersPreview();
            updateCartBar();
        }

        function saveAndSendWhatsapp() {
            const cnpjInput = document.getElementById('cnpj-input');
            const typedCnpj = cnpjInput ? cnpjInput.value.trim() : '';
            const savedCnpj = localStorage.getItem(LAST_CNPJ_KEY) || '';
            const cnpj = typedCnpj || savedCnpj;

            const ordersToSend = networkOrders.map(o => ({
                cnpj: o.cnpj,
                cartSnapshot: JSON.parse(JSON.stringify(o.cartSnapshot || {})),
                total: o.total || 0,
                totalBase: o.totalBase || 0,
                itemsCount: o.itemsCount || 0,
                prazo: o.prazo || "50 dias direto"
            }));

            const currentSummary = getCartSummary(cart);
            if (currentSummary.itemCount > 0) {
                if (!cnpj) { alert("Por favor, digite o CNPJ."); return; }
                localStorage.setItem(LAST_CNPJ_KEY, cnpj);
                if (cnpjInput) cnpjInput.value = cnpj;
                ordersToSend.push({
                    cnpj: cnpj,
                    cartSnapshot: JSON.parse(JSON.stringify(cart)),
                    total: currentSummary.total,
                    totalBase: currentSummary.totalBase,
                    itemsCount: currentSummary.itemCount,
                    prazo: getPrazoForTotal(currentSummary.total)
                });
            }

            if (ordersToSend.length === 0) {
                alert("Nenhum pedido para enviar.");
                return;
            }

            let text = `*PEDIDO OPELLA | FEV 2026*\n`;
            text += `--------------------------------\n`;

            const isSingleCnpj = ordersToSend.length === 1;

            if (isSingleCnpj) {
                const order = ordersToSend[0];
                text += `CNPJ: ${order.cnpj}\n`;
                text += `DATA: ${new Date().toLocaleDateString('pt-BR')}\n`;
                text += buildOrderItemsText(order.cartSnapshot);
                const savings = Math.max(0, (order.totalBase || 0) - (order.total || 0));
                text += `\n--------------------------------`;
                text += `\n*TOTAL:* R$ ${(order.total || 0).toFixed(2).replace('.',',')}`;
                text += `\n*ECONOMIA:* R$ ${savings.toFixed(2).replace('.',',')}`;
                text += `\n*PRAZO:* ${order.prazo || "50 dias direto"}`;
                text += `\n--------------------------------`;
            } else {
                text += `DATA: ${new Date().toLocaleDateString('pt-BR')}\n`;
                text += `CNPJs no envio: ${ordersToSend.length}\n`;

                let grandTotal = 0;
                let grandSavings = 0;

                ordersToSend.forEach((order, idx) => {
                    text += `\n*===== CNPJ ${idx + 1}: ${order.cnpj} =====*\n`;
                    text += buildOrderItemsText(order.cartSnapshot);
                    const savings = Math.max(0, (order.totalBase || 0) - (order.total || 0));
                    text += `\n*Subtotal:* R$ ${(order.total || 0).toFixed(2).replace('.',',')}`;
                    text += `\n*Economia:* R$ ${savings.toFixed(2).replace('.',',')}`;
                    text += `\n*Prazo:* ${order.prazo || "50 dias direto"}`;
                    text += `\n--------------------------------`;
                    grandTotal += order.total || 0;
                    grandSavings += savings;
                });

                text += `\n*TOTAL GERAL REDE:* R$ ${grandTotal.toFixed(2).replace('.',',')}`;
                text += `\n*ECONOMIA GERAL:* R$ ${grandSavings.toFixed(2).replace('.',',')}`;
            }

            text += `\n\n> Aguardo faturamento.`;

            const now = new Date().toLocaleString('pt-BR');
            const historyRecords = ordersToSend.map((order, idx) => ({
                id: Date.now() + idx,
                date: now,
                cnpj: order.cnpj,
                total: order.total || 0,
                itemsCount: order.itemsCount || 0,
                cartSnapshot: JSON.parse(JSON.stringify(order.cartSnapshot || {}))
            }));
            orderHistory = [...historyRecords, ...orderHistory].slice(0, 10);
            localStorage.setItem('opella_history', JSON.stringify(orderHistory));
            updateQuickReorderBar();

            networkOrders = [];
            saveNetworkOrders();
            cart = {};
            saveCart();
            render();

            const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
            window.location.href = url;
        }
    

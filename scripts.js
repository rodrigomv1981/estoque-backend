const CONFIG = {
    API_BASE_URL: 'https://estoque-backend-zfgj.onrender.com', // Altere para a URL do seu backend em produção
    ITEMS_PER_PAGE: 12,
    EXPIRING_DAYS_WARNING: 30,
    EXPIRING_DAYS_CRITICAL: 7,
    GLOBAL_MINIMUM_STOCK: 100 // Exemplo de estoque mínimo global
};

// ==================== ESTADO GLOBAL ====================
const state = {
    currentPage: 1,
    stockData: [],
    locationsData: [],
    logsData: [],
    filteredStockData: [],
    searchQuery: '',
    statusFilter: ''
};

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[App] Iniciando aplicação');
    showLoading();
    try {
        initializeEventListeners();
        await loadAllData();
    } catch (error) {
        console.error('[App] Erro na inicialização:', error);
        alert(`Erro ao iniciar aplicação: ${error.message}. Por favor, recarregue a página.`);
    } finally {
        hideLoading();
    }
});

// ==================== CARREGAR DADOS ====================
async function loadAllData() {
    showLoading();
    try {
        console.log('[Data] Carregando todos os dados do backend');
        const [stockResult, locationsResult, logsResult] = await Promise.all([
            fetchData('api/stock'),
            fetchData('api/locations'),
            fetchData('api/logs')
        ]);
        
        if (stockResult && stockResult.success) state.stockData = Array.isArray(stockResult.data) ? stockResult.data : [];
        if (locationsResult && locationsResult.success) state.locationsData = Array.isArray(locationsResult.data) ? locationsResult.data : [];
        if (logsResult && logsResult.success) state.logsData = Array.isArray(logsResult.data) ? logsResult.data : [];

        applyFilters();
        displayStock();
        displayLocations();
        displayLogs();
        checkExpiringProducts();
        populateLocationDropdown(); // Popula o dropdown de localização após carregar as localidades
    } catch (error) {
        console.error('[Data] Erro ao carregar dados:', error);
        alert(`Erro ao carregar dados: ${error.message}. Verifique sua conexão ou contate o suporte.`);
    } finally {
        hideLoading();
    }
}

async function fetchData(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${CONFIG.API_BASE_URL}/${endpoint}`, options);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Erro na requisição: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Erro ao buscar ${endpoint}:`, error);
        throw error;
    }
}

async function addProduct(product) {
    await fetchData('api/stock', 'POST', product);
    await loadAllData();
}

async function updateProduct(id, product) {
    await fetchData(`api/stock/${id}`, 'PUT', product);
    await loadAllData();
}

async function deleteProduct(id) {
    await fetchData(`api/stock/${id}`, 'DELETE');
    await loadAllData();
}

async function addLocation(location) {
    await fetchData('api/locations', 'POST', location);
    await loadAllData();
}

async function updateLocation(id, location) {
    await fetchData(`api/locations/${id}`, 'PUT', location);
    await loadAllData();
}

async function deleteLocation(id) {
    await fetchData(`api/locations/${id}`, 'DELETE');
    await loadAllData();
}

// --- Utilitários --- //
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A'; // Verifica se a data é inválida
    return date.toLocaleDateString('pt-BR');
}

function calculateDaysUntilExpiration(expirationDate) {
    if (!expirationDate || expirationDate === 'N/A') return Infinity;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(expirationDate);
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ==================== FILTROS E BUSCA ====================
function applyFilters() {
    state.filteredStockData = state.stockData.filter(item => {
        const matchesSearch = !state.searchQuery || 
            item.productName.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
            item.batch.toLowerCase().includes(state.searchQuery.toLowerCase());
        
        const matchesStatus = !state.statusFilter || item.status === state.statusFilter;
        
        return matchesSearch && matchesStatus;
    });
    
    state.currentPage = 1;
    // A paginação será feita sobre os grupos, não sobre os itens individuais
}

function searchProducts(query) {
    state.searchQuery = query;
    applyFilters();
    displayStock();
}

function filterByStatus(status) {
    state.statusFilter = status;
    applyFilters();
    displayStock();
}

// ==================== INICIALIZAÇÃO DE EVENT LISTENERS ====================
function initializeEventListeners() {
    // Navegação por abas
    document.querySelectorAll('.bottom-nav .nav-item').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            const targetId = button.id.replace('TabBtn', '-section');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Abrir modal de produto
    document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
    document.getElementById('closeModal').addEventListener('click', closeProductModal);
    document.getElementById('cancelBtn').addEventListener('click', closeProductModal);
    document.getElementById('productModal').querySelector('.modal-overlay').addEventListener('click', closeProductModal);

    // Submeter formulário de produto
    document.getElementById('productForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('productId').value;
        const product = {
            productName: document.getElementById('productName').value,
            manufacturer: document.getElementById('manufacturer').value,
            batch: document.getElementById('batch').value,
            quantity: parseFloat(document.getElementById('quantity').value),
            unit: document.getElementById('unit').value,
            packaging: document.getElementById('packaging').value,
            packagingNumber: parseInt(document.getElementById('packagingNumber').value),
            minimumStock: parseFloat(document.getElementById('minimumStock').value),
            invoice: document.getElementById('invoice').value, // Não obrigatório
            expirationDate: document.getElementById('expirationDate').value,
            locationId: document.getElementById('location').value,
            location: document.getElementById('location').options[document.getElementById('location').selectedIndex].textContent, // Salva o nome da localização
            status: document.getElementById('status').value,
        };

        if (productId) {
            await updateProduct(productId, product);
        } else {
            await addProduct(product);
        }
        closeProductModal();
    });

    // Abrir modal de localidade
    document.getElementById('addLocationBtn').addEventListener('click', () => openLocationModal());
    document.getElementById('closeLocationModal').addEventListener('click', closeLocationModal);
    document.getElementById('cancelLocationBtn').addEventListener('click', closeLocationModal);
    document.getElementById('locationModal').querySelector('.modal-overlay').addEventListener('click', closeLocationModal);

    // Submeter formulário de localidade
    document.getElementById('locationForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const locationId = document.getElementById('locationId').value;
        const location = {
            room: document.getElementById('room').value,
            cabinet: document.getElementById('cabinet').value,
        };

        if (locationId) {
            await updateLocation(locationId, location);
        } else {
            await addLocation(location);
        }
        closeLocationModal();
    });

    // Filtro e busca
    document.getElementById('searchInput').addEventListener('input', (e) => searchProducts(e.target.value));
    document.getElementById('statusFilter').addEventListener('change', (e) => filterByStatus(e.target.value));

    // Paginação
    document.getElementById('prevPage').addEventListener('click', previousPage);
    document.getElementById('nextPage').addEventListener('click', nextPage);

    // Event Listeners para ações de produto (Editar, Excluir, Esgotar, Usar, Transferir)
    document.getElementById('stockList').addEventListener('click', async (e) => {
        const target = e.target.closest('.btn-action');
        if (!target) return;

        const productId = target.dataset.id; // Este é o ID do item individual
        const product = state.stockData.find(p => p.id === productId);

        if (!product) {
            alert('Produto não encontrado.');
            return;
        }

        if (target.classList.contains('edit')) {
            openProductModal(product);
        } else if (target.classList.contains('delete')) {
            if (confirm(`Tem certeza que deseja excluir o produto ${product.productName} (Lote: ${product.batch})?`)) {
                await deleteProduct(productId);
                alert('Produto excluído com sucesso!');
            }
        } else if (target.classList.contains('exhaust')) {
            if (confirm(`Tem certeza que deseja esgotar o saldo do produto ${product.productName} (Lote: ${product.batch})?`)) {
                const updatedProduct = { ...product, quantity: 0, status: 'indisponivel' };
                await updateProduct(productId, updatedProduct);
                alert('Saldo do produto esgotado!');
            }
        } else if (target.classList.contains('use')) {
            const quantityToUse = prompt(`Quantas unidades de ${product.productName} (Lote: ${product.batch}) deseja usar?`);
            if (quantityToUse !== null) {
                const numQuantityToUse = parseFloat(quantityToUse);
                if (isNaN(numQuantityToUse) || numQuantityToUse <= 0) {
                    alert('Por favor, insira uma quantidade válida.');
                    return;
                }
                if (numQuantityToUse > product.quantity) {
                    alert(`Quantidade insuficiente. Saldo atual: ${product.quantity} ${product.unit}.`);
                    return;
                }
                const updatedQuantity = product.quantity - numQuantityToUse;
                const updatedProduct = { ...product, quantity: updatedQuantity };
                if (updatedQuantity <= 0) {
                    updatedProduct.status = 'indisponivel';
                }
                await updateProduct(productId, updatedProduct);
                alert(`${numQuantityToUse} ${product.unit} de ${product.productName} usado(s) com sucesso!`);
            }
        } else if (target.classList.contains('transfer')) {
            if (product.packagingNumber <= 1) {
                alert('Não é possível transferir uma unidade de embalagem, pois este produto possui apenas uma.');
                return;
            }

            const newLocationId = prompt(`Para qual localização deseja transferir uma embalagem de ${product.productName} (Lote: ${product.batch})?\n\nDigite o ID da localização:`);
            if (newLocationId !== null) {
                const newLocation = state.locationsData.find(loc => loc.id === newLocationId);
                if (!newLocation) {
                    alert('ID de localização inválido. Por favor, insira um ID de localização existente.');
                    return;
                }

                // Reduzir o número de embalagens do produto original
                const updatedOriginalProduct = { ...product, packagingNumber: product.packagingNumber - 1 };
                if (updatedOriginalProduct.packagingNumber <= 0) {
                    updatedOriginalProduct.status = 'indisponivel';
                }
                await updateProduct(productId, updatedOriginalProduct);

                // Criar um novo produto para a embalagem transferida
                const newProduct = {
                    ...product,
                    id: null, // O backend irá gerar um novo ID
                    packagingNumber: 1,
                    locationId: newLocation.id,
                    location: `${newLocation.room} ${newLocation.cabinet ? `- ${newLocation.cabinet}` : ''}`,
                };
                await addProduct(newProduct);
                alert(`Uma embalagem de ${product.productName} transferida para ${newLocation.room} ${newLocation.cabinet ? `- ${newLocation.cabinet}` : ''} com sucesso!`);
            }
        }
    });

    // Event Listeners para ações de localidade (Editar, Excluir)
    document.getElementById('locationsList').addEventListener('click', async (e) => {
        const target = e.target.closest('.btn-action');
        if (!target) return;

        const locationId = target.dataset.id;
        const location = state.locationsData.find(loc => loc.id === locationId);

        if (!location) {
            alert('Localidade não encontrada.');
            return;
        }

        if (target.classList.contains('edit-location')) {
            openLocationModal(location);
        } else if (target.classList.contains('delete-location')) {
            if (confirm(`Tem certeza que deseja excluir a localização ${location.room} ${location.cabinet ? `- ${location.cabinet}` : ''}?`)) {
                await deleteLocation(locationId);
                alert('Localização excluída com sucesso!');
            }
        }
    });
}

// ==================== EXIBIÇÃO DE DADOS ====================
function displayStock() {
    const stockListDiv = document.getElementById('stockList');
    const globalSummaryDiv = document.getElementById('globalSummary');

    if (!stockListDiv || !globalSummaryDiv) {
        console.error('[UI] Elementos stockListDiv ou globalSummaryDiv não encontrados no DOM');
        return;
    }

    // Calcular totais globais para o resumo
    const totalProducts = new Set(state.stockData.map(item => item.productName)).size;
    const totalQuantity = state.stockData.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    const productsBelowMin = state.stockData.filter(item => parseFloat(item.quantity) < parseFloat(item.minimumStock)).length;

    globalSummaryDiv.innerHTML = `
        <div class="global-summary-section">
            <h2 class="section-title">Resumo Global do Estoque</h2>
            <div class="global-summary-grid">
                <div class="summary-item">
                    <div class="summary-label">Produtos Únicos</div>
                    <div class="summary-value">${totalProducts}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Quantidade Total</div>
                    <div class="summary-value">${totalQuantity.toFixed(2)}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Estoque Mínimo Global</div>
                    <div class="summary-value">${CONFIG.GLOBAL_MINIMUM_STOCK}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Itens Abaixo do Mínimo</div>
                    <div class="summary-value">${productsBelowMin}</div>
                </div>
            </div>
        </div>
    `;

    // Agrupar produtos por produto e lote para exibição individual
    const grouped = groupByProductAndBatch(state.filteredStockData);
    const sorted = sortByExpirationDate(grouped);
    
    // Paginar resultados
    const totalPages = Math.ceil(sorted.length / CONFIG.ITEMS_PER_PAGE);
    const startIndex = (state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
    const endIndex = startIndex + CONFIG.ITEMS_PER_PAGE;
    const paginatedGroups = sorted.slice(startIndex, endIndex);
    
    stockListDiv.innerHTML = '';

    if (paginatedGroups.length === 0) {
        stockListDiv.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <h3>Nenhum produto encontrado</h3>
                <p>Tente ajustar seus filtros ou adicione novos produtos.</p>
            </div>
        `;
    } else {
        paginatedGroups.forEach(group => {
            const firstItem = group.items[0]; 
            const daysLeft = calculateDaysUntilExpiration(firstItem.expirationDate);
            let expiryBadgeClass = 'normal';
            if (daysLeft <= 0) expiryBadgeClass = 'danger';
            else if (daysLeft <= CONFIG.EXPIRING_DAYS_WARNING) expiryBadgeClass = 'warning';
    
            const productCard = document.createElement('div');
            productCard.className = `product-card ${expiryBadgeClass === 'danger' ? 'expired' : ''} ${expiryBadgeClass === 'warning' ? 'expiring-soon' : ''}`;
            productCard.innerHTML = `
                <div class="product-header">
                    <div>
                        <h3 class="product-name">${firstItem.productName}</h3>
                        <p class="product-batch">Lote: ${firstItem.batch}</p>
                    </div>
                    <span class="product-status ${parseFloat(group.totalQuantity) < parseFloat(firstItem.minimumStock) ? 'low-stock' : (group.totalQuantity > 0 ? 'disponivel' : 'indisponivel')}">
                        ${parseFloat(group.totalQuantity) < parseFloat(firstItem.minimumStock) ? 'Estoque Baixo' : (group.totalQuantity > 0 ? 'Disponível' : 'Indisponível')}
                    </span>
                </div>
                <div class="product-info">
                    <div class="info-row">
                        <span class="info-label">Fabricante:</span>
                        <span class="info-value">${firstItem.manufacturer || 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Localização:</span>
                        <span class="info-value">${firstItem.location || 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Quantidade Total:</span>
                        <span class="info-value quantity-badge">${group.totalQuantity.toFixed(2)} ${firstItem.unit}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Nº Embalagens:</span>
                        <span class="info-value quantity-badge">${group.totalPackagingNumber}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Validade:</span>
                        <span class="info-value expiry-badge ${expiryBadgeClass}">${formatDate(firstItem.expirationDate)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Estoque Mínimo:</span>
                        <span class="info-value">${firstItem.minimumStock || '0'} ${firstItem.unit}</span>
                    </div>
                </div>
                <div class="product-actions">
                    <button class="btn-action edit" data-id="${firstItem.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        Editar
                    </button>
                    <button class="btn-action delete" data-id="${firstItem.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        Excluir
                    </button>
                    <button class="btn-action exhaust" data-id="${firstItem.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                        Esgotar
                    </button>
                    <button class="btn-action use" data-id="${firstItem.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
                        Usar
                    </button>
                    <button class="btn-action transfer" data-id="${firstItem.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                        Transferir
                    </button>
                </div>
            `;
            stockListDiv.appendChild(productCard);
        });
    }

    updatePagination(totalPages);
    renderExpiringAlert(sorted);
}

function groupByProductAndBatch(data) {
    const grouped = {};
    data.forEach(item => {
        const key = `${item.productName.toLowerCase()}-${item.batch.toLowerCase()}`;
        if (!grouped[key]) {
            grouped[key] = {
                productName: item.productName,
                batch: item.batch,
                totalQuantity: 0,
                totalPackagingNumber: 0,
                expirationDate: null, // Data de validade mais próxima do grupo
                items: [] // Itens individuais que compõem o grupo
            };
        }
        grouped[key].totalQuantity += parseFloat(item.quantity);
        grouped[key].totalPackagingNumber += parseInt(item.packagingNumber || 1);
        // Encontra a data de validade mais próxima para o grupo
        if (item.expirationDate && (!grouped[key].expirationDate || new Date(item.expirationDate) < new Date(grouped[key].expirationDate))) {
            grouped[key].expirationDate = item.expirationDate;
        }
        grouped[key].items.push(item);
    });
    return Object.values(grouped);
}

function sortByExpirationDate(groupedData) {
    return groupedData.sort((a, b) => {
        const daysA = calculateDaysUntilExpiration(a.expirationDate);
        const daysB = calculateDaysUntilExpiration(b.expirationDate);
        return daysA - daysB;
    });
}

function renderExpiringAlert(sortedStock) {
    const expiringAlert = document.getElementById('expiringAlert');
    const expiringMessage = document.getElementById('expiringMessage');
    if (!expiringAlert || !expiringMessage) return;

    const expiringItems = sortedStock.filter(group => {
        const daysLeft = calculateDaysUntilExpiration(group.expirationDate);
        return daysLeft > 0 && daysLeft <= CONFIG.EXPIRING_DAYS_WARNING; // Produtos que vencem em até 30 dias
    });

    const expiredItems = sortedStock.filter(group => {
        const daysLeft = calculateDaysUntilExpiration(group.expirationDate);
        return daysLeft <= 0;
    });

    let message = '';
    if (expiredItems.length > 0) {
        message += `${expiredItems.length} produto(s) vencido(s). `;
    }
    if (expiringItems.length > 0) {
        message += `${expiringItems.length} produto(s) vencendo em breve.`;
    }

    if (message) {
        expiringMessage.textContent = message;
        expiringAlert.style.display = 'flex';
    } else {
        expiringAlert.style.display = 'none';
    }
}

function updatePagination(totalItems) {
    const totalPages = Math.ceil(totalItems / CONFIG.ITEMS_PER_PAGE);
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const pageInfoSpan = document.getElementById('pageInfo');

    if (!prevPageBtn || !nextPageBtn || !pageInfoSpan) return;

    pageInfoSpan.textContent = `Página ${state.currentPage} de ${totalPages || 1}`;
    prevPageBtn.disabled = state.currentPage === 1;
    nextPageBtn.disabled = state.currentPage === totalPages || totalPages === 0;
}

function previousPage() {
    if (state.currentPage > 1) {
        state.currentPage--;
        displayStock();
    }
}

function nextPage() {
    const totalItems = groupByProductAndBatch(state.filteredStockData).length;
    const totalPages = Math.ceil(totalItems / CONFIG.ITEMS_PER_PAGE);
    if (state.currentPage < totalPages) {
        state.currentPage++;
        displayStock();
    }
}

function displayLocations() {
    const locationsListDiv = document.getElementById('locationsList');
    if (!locationsListDiv) return;

    locationsListDiv.innerHTML = '';
    if (state.locationsData.length === 0) {
        locationsListDiv.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <h3>Nenhuma localização cadastrada</h3>
                <p>Adicione uma nova localização para organizar seu estoque.</p>
            </div>
        `;
        return;
    }

    state.locationsData.forEach(location => {
        const locationCard = document.createElement('div');
        locationCard.className = 'location-card';
        locationCard.innerHTML = `
            <div class="location-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            </div>
            <h3 class="location-name">${location.room}</h3>
            <p class="location-details">${location.cabinet || 'N/A'}</p>
            <div class="product-actions">
                <button class="btn-action edit-location" data-id="${location.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    Editar
                </button>
                <button class="btn-action delete-location" data-id="${location.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    Excluir
                </button>
            </div>
        `;
        locationsListDiv.appendChild(locationCard);
    });
}

function displayLogs() {
    const logsListDiv = document.getElementById('logsList');
    if (!logsListDiv) return;

    logsListDiv.innerHTML = '';
    if (state.logsData.length === 0) {
        logsListDiv.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <h3>Nenhuma ação registrada</h3>
                <p>O histórico de ações estará disponível aqui.</p>
            </div>
        `;
        return;
    }

    state.logsData.forEach(log => {
        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        logItem.innerHTML = `
            <div class="log-header">
                <span class="log-action">${log.action}</span>
                <span class="log-timestamp">${formatDate(log.timestamp)}</span>
            </div>
            <p class="log-details">${log.details}</p>
        `;
        logsListDiv.appendChild(logItem);
    });
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}-section`).classList.add('active');

    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${tabName}TabBtn`).classList.add('active');
}

// ==================== MODAIS E FORMULÁRIOS ====================
const productModal = document.getElementById('productModal');
const productForm = document.getElementById('productForm');
const modalTitle = document.getElementById('modalTitle');
const productIdInput = document.getElementById('productId');
const productNameInput = document.getElementById('productName');
const manufacturerInput = document.getElementById('manufacturer');
const batchInput = document.getElementById('batch');
const quantityInput = document.getElementById('quantity');
const unitInput = document.getElementById('unit');
const packagingInput = document.getElementById('packaging');
const packagingNumberInput = document.getElementById('packagingNumber');
const minimumStockInput = document.getElementById('minimumStock');
const invoiceInput = document.getElementById('invoice');
const expirationDateInput = document.getElementById('expirationDate');
const locationSelect = document.getElementById('location');
const statusSelect = document.getElementById('status');

const locationModal = document.getElementById('locationModal');
const locationForm = document.getElementById('locationForm');
const locationModalTitle = document.getElementById('locationModalTitle');
const locationIdInput = document.getElementById('locationId');
const roomInput = document.getElementById('room');
const cabinetInput = document.getElementById('cabinet');

async function openProductModal(product = null) {
    productForm.reset();
    await populateLocationDropdown(); // Garante que o dropdown esteja populado antes de abrir o modal

    if (product) {
        modalTitle.textContent = 'Editar Produto';
        productIdInput.value = product.id;
        productNameInput.value = product.productName;
        manufacturerInput.value = product.manufacturer;
        batchInput.value = product.batch;
        quantityInput.value = product.quantity;
        unitInput.value = product.unit;
        packagingInput.value = product.packaging;
        packagingNumberInput.value = product.packagingNumber;
        minimumStockInput.value = product.minimumStock;
        invoiceInput.value = product.invoice;
        expirationDateInput.value = product.expirationDate;
        locationSelect.value = product.locationId;
        statusSelect.value = product.status;
    } else {
        modalTitle.textContent = 'Adicionar Produto';
        productIdInput.value = '';
        // Valores padrão para adicionar
        quantityInput.value = 1;
        packagingNumberInput.value = 1;
        minimumStockInput.value = 0;
        statusSelect.value = 'disponivel';
        locationSelect.value = ''; // Reset location select
    }
    productModal.classList.add('active');
}

function closeProductModal() {
    productModal.classList.remove('active');
}

function openLocationModal(location = null) {
    locationForm.reset();
    if (location) {
        locationModalTitle.textContent = 'Editar Localidade';
        locationIdInput.value = location.id;
        roomInput.value = location.room;
        cabinetInput.value = location.cabinet;
    } else {
        locationModalTitle.textContent = 'Adicionar Localidade';
        locationIdInput.value = '';
    }
    locationModal.classList.add('active');
}

function closeLocationModal() {
    locationModal.classList.remove('active');
}

function populateLocationDropdown() {
    const locationSelectElement = document.getElementById('location');
    if (!locationSelectElement) return;

    locationSelectElement.innerHTML = '<option value="">Selecione uma localização</option>';
    state.locationsData.forEach(loc => {
        const option = document.createElement('option');
        option.value = loc.id;
        option.textContent = `${loc.room} ${loc.cabinet ? `- ${loc.cabinet}` : ''}`;
        locationSelectElement.appendChild(option);
    });
}

// ==================== FUNÇÕES DE AÇÃO ====================
async function saveProduct(e) {
    e.preventDefault();
    const productId = document.getElementById('productId').value;
    const product = {
        productName: document.getElementById('productName').value,
        manufacturer: document.getElementById('manufacturer').value,
        batch: document.getElementById('batch').value,
        quantity: parseFloat(document.getElementById('quantity').value),
        unit: document.getElementById('unit').value,
        packaging: document.getElementById('packaging').value,
        packagingNumber: parseInt(document.getElementById('packagingNumber').value),
        minimumStock: parseFloat(document.getElementById('minimumStock').value),
        invoice: document.getElementById('invoice').value, 
        expirationDate: document.getElementById('expirationDate').value,
        locationId: document.getElementById('location').value,
        location: document.getElementById('location').options[document.getElementById('location').selectedIndex].textContent, 
        status: document.getElementById('status').value,
    };

    if (productId) {
        await updateProduct(productId, product);
    } else {
        await addProduct(product);
    }
    closeProductModal();
}

async function saveLocation(e) {
    e.preventDefault();
    const locationId = document.getElementById('locationId').value;
    const location = {
        room: document.getElementById('room').value,
        cabinet: document.getElementById('cabinet').value,
    };

    if (locationId) {
        await updateLocation(locationId, location);
    } else {
        await addLocation(location);
    }
    closeLocationModal();
}

async function handleProductAction(action, productId) {
    const product = state.stockData.find(p => p.id === productId);

    if (!product) {
        alert('Produto não encontrado.');
        return;
    }

    switch (action) {
        case 'edit':
            openProductModal(product);
            break;
        case 'delete':
            if (confirm(`Tem certeza que deseja excluir o produto ${product.productName} (Lote: ${product.batch})?`)) {
                await deleteProduct(productId);
                alert('Produto excluído com sucesso!');
            }
            break;
        case 'exhaust':
            if (confirm(`Tem certeza que deseja esgotar o saldo do produto ${product.productName} (Lote: ${product.batch})?`)) {
                const updatedProduct = { ...product, quantity: 0, status: 'indisponivel' };
                await updateProduct(productId, updatedProduct);
                alert('Saldo do produto esgotado!');
            }
            break;
        case 'use':
            const quantityToUse = prompt(`Quantas unidades de ${product.productName} (Lote: ${product.batch}) deseja usar?`);
            if (quantityToUse !== null) {
                const numQuantityToUse = parseFloat(quantityToUse);
                if (isNaN(numQuantityToUse) || numQuantityToUse <= 0) {
                    alert('Por favor, insira uma quantidade válida.');
                    return;
                }
                if (numQuantityToUse > product.quantity) {
                    alert(`Quantidade insuficiente. Saldo atual: ${product.quantity} ${product.unit}.`);
                    return;
                }
                const updatedQuantity = product.quantity - numQuantityToUse;
                const updatedProduct = { ...product, quantity: updatedQuantity };
                if (updatedQuantity <= 0) {
                    updatedProduct.status = 'indisponivel';
                }
                await updateProduct(productId, updatedProduct);
                alert(`${numQuantityToUse} ${product.unit} de ${product.productName} usado(s) com sucesso!`);
            }
            break;
        case 'transfer':
            if (product.packagingNumber <= 0) {
                alert('Não é possível transferir, pois este produto não possui embalagens.');
                return;
            }

            const newLocationId = prompt(`Para qual localização deseja transferir uma embalagem de ${product.productName} (Lote: ${product.batch})?\n\nDigite o ID da localização:`);
            if (newLocationId !== null) {
                const newLocation = state.locationsData.find(loc => loc.id === newLocationId);
                if (!newLocation) {
                    alert('ID de localização inválido. Por favor, insira um ID de localização existente.');
                    return;
                }

                // Reduzir o número de embalagens do produto original
                const updatedOriginalProduct = { ...product, packagingNumber: product.packagingNumber - 1 };
                // Se a quantidade total do produto original cair para zero, considere-o indisponível
                if (updatedOriginalProduct.packagingNumber <= 0) {
                    updatedOriginalProduct.status = 'indisponivel';
                }
                await updateProduct(productId, updatedOriginalProduct);

                // Criar um novo produto para a embalagem transferida
                const newProduct = {
                    ...product,
                    id: null, // O backend irá gerar um novo ID
                    packagingNumber: 1,
                    locationId: newLocation.id,
                    location: `${newLocation.room} ${newLocation.cabinet ? `- ${newLocation.cabinet}` : ''}`,
                };
                await addProduct(newProduct);
                alert(`Uma embalagem de ${product.productName} transferida para ${newLocation.room} ${newLocation.cabinet ? `- ${newLocation.cabinet}` : ''} com sucesso!`);
            }
            break;
        default:
            console.warn('Ação desconhecida:', action);
    }
}

// Listener para todas as ações de produto
document.getElementById('stockList').addEventListener('click', async (e) => {
    const target = e.target.closest('.btn-action');
    if (!target) return;

    const productId = target.dataset.id;
    let action = '';
    if (target.classList.contains('edit')) action = 'edit';
    else if (target.classList.contains('delete')) action = 'delete';
    else if (target.classList.contains('exhaust')) action = 'exhaust';
    else if (target.classList.contains('use')) action = 'use';
    else if (target.classList.contains('transfer')) action = 'transfer';

    if (action) {
        await handleProductAction(action, productId);
    }
});

// Listener para ações de localidade
document.getElementById('locationsList').addEventListener('click', async (e) => {
    const target = e.target.closest('.btn-action');
    if (!target) return;

    const locationId = target.dataset.id;
    const location = state.locationsData.find(loc => loc.id === locationId);

    if (!location) {
        alert('Localidade não encontrada.');
        return;
    }

    if (target.classList.contains('edit-location')) {
        openLocationModal(location);
    } else if (target.classList.contains('delete-location')) {
        if (confirm(`Tem certeza que deseja excluir a localização ${location.room} ${location.cabinet ? `- ${location.cabinet}` : ''}?`)) {
            await deleteLocation(locationId);
            alert('Localização excluída com sucesso!');
        }
    }
});


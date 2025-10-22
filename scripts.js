// ==================== CONFIGURAÇÕES ====================
const CONFIG = {
    API_BASE_URL: 'https://estoque-backend-zfgj.onrender.com',
    ITEMS_PER_PAGE: 12,
    EXPIRING_DAYS_WARNING: 30,
    EXPIRING_DAYS_CRITICAL: 7
};

// ==================== ESTADO GLOBAL ====================
const state = {
    currentPage: 1,
    stockData: [],
    locationsData: [],
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
        await Promise.all([
            loadStock(),
            loadLocations(),
            loadLogs()
        ]);
        applyFilters();
        displayStock();
        displayTotalStock();
        displayLocations();
        displayLogs();
        checkExpiringProducts();
    } catch (error) {
        console.error('[Data] Erro ao carregar dados:', error);
        alert(`Erro ao carregar dados: ${error.message}. Verifique sua conexão ou contate o suporte.`);
    } finally {
        hideLoading();
    }
}

async function loadStock() {
    try {
        console.log('[API Request] URL:', `${CONFIG.API_BASE_URL}/api/stock`);
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/stock`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('[API Response] Status:', response.status, 'OK:', response.ok);
        if (!response.ok) throw new Error(`Erro ao carregar estoque: ${response.status} ${response.statusText}`);
        let result = await response.json();
        if (!result || typeof result !== 'object' || !result.success) throw new Error('Resposta inválida');
        state.stockData = Array.isArray(result.data) ? result.data : [];
        console.log('[Data] Estoque carregado:', state.stockData.length, 'itens');
    } catch (error) {
        console.error('[Fetch Error Details]', error);
        throw error;
    }
}

async function loadLocations() {
    try {
        console.log('[API Request] Carregando localidades do backend');
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/locations`);
        if (!response.ok) {
            throw new Error(`Erro ao carregar localidades: ${response.status} ${response.statusText}`);
        }
        let result = await response.json();
        if (!result || typeof result !== 'object' || !result.success) {
            throw new Error('Resposta do servidor em formato inválido');
        }
        state.locationsData = Array.isArray(result.data) ? result.data : [];
        console.log('[Data] Localidades carregadas:', state.locationsData.length, 'itens');
        populateLocationDropdown();
    } catch (error) {
        console.error('[Data] Erro ao carregar localidades:', error);
        throw error;
    }
}

async function loadLogs() {
    try {
        console.log('[API Request] Carregando logs do backend');
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/logs`);
        if (!response.ok) {
            throw new Error(`Erro ao carregar logs: ${response.status} ${response.statusText}`);
        }
        let result = await response.json();
        if (!result || typeof result !== 'object' || !result.success) {
            throw new Error('Resposta do servidor em formato inválido');
        }
        console.log('[Data] Logs carregados:', result.data.length, 'itens');
        return Array.isArray(result.data) ? result.data : [];
    } catch (error) {
        console.error('[Data] Erro ao carregar logs:', error);
        return [];
    }
}

// ==================== FILTROS E BUSCA ====================
function applyFilters() {
    let filtered = [...state.stockData];
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        filtered = filtered.filter(item => 
            (item.product && item.product.toLowerCase().includes(query)) ||
            (item.batch && item.batch.toLowerCase().includes(query)) ||
            (item.manufacturer && item.manufacturer.toLowerCase().includes(query))
        );
    }
    if (state.statusFilter) {
        filtered = filtered.filter(item => item.status === state.statusFilter);
    }
    state.filteredStockData = filtered;
    state.currentPage = 1;
}

function groupByProductAndBatch(data) {
    const grouped = {};
    data.forEach(item => {
        if (!item.product || !item.batch) {
            console.warn('[Data] Item com product ou batch inválido:', item);
            return;
        }
        const key = `${item.product}_${item.batch}`;
        if (!grouped[key]) {
            grouped[key] = {
                ...item,
                totalQuantity: 0,
                items: []
            };
        }
        grouped[key].totalQuantity += item.quantity || 0;
        grouped[key].items.push(item);
        if (!grouped[key].expirationDate || 
            (item.expirationDate && item.expirationDate < grouped[key].expirationDate)) {
            grouped[key].expirationDate = item.expirationDate;
        }
    });
    return Object.values(grouped);
}

function groupByProduct(data) {
    const grouped = {};
    data.forEach(item => {
        if (!item.product) {
            console.warn('[Data] Item sem product:', item);
            return;
        }
        if (!grouped[item.product]) {
            grouped[item.product] = {
                product: item.product,
                totalQuantity: 0,
                unit: item.unit,
                minimumStock: item.minimumStock || 0,
                items: []
            };
        }
        grouped[item.product].totalQuantity += item.quantity || 0;
        grouped[item.product].items.push(item);
        if (item.minimumStock > grouped[item.product].minimumStock) {
            grouped[item.product].minimumStock = item.minimumStock;
        }
    });
    return Object.values(grouped);
}

function sortByExpirationDate(data) {
    return data.sort((a, b) => {
        if (!a.expirationDate) return 1;
        if (!b.expirationDate) return -1;
        const dateA = new Date(a.expirationDate);
        const dateB = new Date(b.expirationDate);
        return dateA - dateB;
    });
}

// ==================== EXIBIÇÃO DE DADOS ====================
function displayStock() {
    const stockList = document.getElementById('stockList');
    if (!stockList) {
        console.error('[UI] Elemento stockList não encontrado no DOM');
        alert('Erro na interface: elemento de estoque não encontrado. Contate o suporte.');
        return;
    }
    const grouped = groupByProductAndBatch(state.filteredStockData);
    const sorted = sortByExpirationDate(grouped);
    const start = (state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
    const end = start + CONFIG.ITEMS_PER_PAGE;
    const paginated = sorted.slice(start, end);
    if (paginated.length === 0) {
        stockList.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                <h3>Nenhum produto encontrado</h3>
                <p>Adicione produtos ao estoque ou ajuste os filtros de busca.</p>
            </div>
        `;
    } else {
        stockList.innerHTML = paginated.map(group => createProductCard(group)).join('');
    }
    updatePagination(sorted.length);
}

function displayTotalStock() {
    const totalStockList = document.getElementById('totalStockList');
    if (!totalStockList) {
        console.error('[UI] Elemento totalStockList não encontrado no DOM');
        return;
    }
    const grouped = groupByProduct(state.filteredStockData);
    if (grouped.length === 0) {
        totalStockList.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                <h3>Nenhum produto encontrado</h3>
                <p>Adicione produtos ao estoque para ver os totais.</p>
            </div>
        `;
        return;
    }
    totalStockList.innerHTML = grouped.map(group => `
        <div class="total-stock-card ${group.totalQuantity <= group.minimumStock && group.minimumStock > 0 ? 'low-stock' : ''}">
            <h4>${escapeHtml(group.product)}</h4>
            <p>Total: ${formatNumber(group.totalQuantity)} ${escapeHtml(group.unit)}</p>
            <p>Estoque Mínimo: ${formatNumber(group.minimumStock)} ${escapeHtml(group.unit)}</p>
        </div>
    `).join('');
}

function createProductCard(group) {
    const expiryStatus = getExpiryStatus(group.expirationDate);
    const expiryBadge = getExpiryBadge(group.expirationDate);
    const isLowStock = group.totalQuantity <= group.minimumStock && group.minimumStock > 0;
    return `
        <div class="product-card ${expiryStatus.class} ${isLowStock ? 'low-stock' : ''}" data-id="${group.items[0].id}">
            <div class="product-header">
                <div>
                    <div class="product-name">${escapeHtml(group.product)}</div>
                    <div class="product-batch">Lote: ${escapeHtml(group.batch)}</div>
                </div>
                <span class="product-status ${group.status}">${group.status === 'disponivel' ? 'Disponível' : 'Indisponível'}</span>
            </div>
            <div class="product-info">
                <div class="info-row">
                    <span class="info-label">Quantidade Total</span>
                    <span class="quantity-badge">${formatNumber(group.totalQuantity)} ${escapeHtml(group.unit)}</span>
                </div>
                ${group.manufacturer ? `
                <div class="info-row">
                    <span class="info-label">Fabricante</span>
                    <span class="info-value">${escapeHtml(group.manufacturer)}</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-label">Validade</span>
                    ${expiryBadge}
                </div>
                <div class="info-row">
                    <span class="info-label">Localização</span>
                    <span class="info-value">${escapeHtml(group.location || 'Não definida')}</span>
                </div>
                ${group.packaging ? `
                <div class="info-row">
                    <span class="info-label">Embalagem</span>
                    <span class="info-value">${escapeHtml(group.packaging)} (${group.packagingNumber}x)</span>
                </div>
                ` : ''}
                ${isLowStock ? `
                <div class="info-row">
                    <span class="info-label" style="color: var(--info);">⚠️ Estoque Baixo</span>
                    <span class="info-value" style="color: var(--info);">Mín: ${formatNumber(group.minimumStock)} ${escapeHtml(group.unit)}</span>
                </div>
                ` : ''}
            </div>
            <div class="product-actions">
                <button class="btn-action edit" aria-label="Editar produto ${escapeHtml(group.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Editar
                </button>
                <button class="btn-action delete" aria-label="Excluir produto ${escapeHtml(group.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Excluir
                </button>
                <button class="btn-action use" aria-label="Usar produto ${escapeHtml(group.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 12h16"></path>
                    </svg>
                    Usar
                </button>
                <button class="btn-action exhaust" aria-label="Esgotar produto ${escapeHtml(group.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 8v8"></path>
                    </svg>
                    Esgotar
                </button>
                ${group.packagingNumber > 1 ? `
                <button class="btn-action transfer" aria-label="Transferir produto ${escapeHtml(group.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    Transferir
                </button>
                ` : ''}
            </div>
        </div>
    `;
}

function getExpiryStatus(expirationDate) {
    if (!expirationDate || isNaN(new Date(expirationDate))) {
        return { class: '', status: 'normal' };
    }
    const today = new Date();
    const expiry = new Date(expirationDate);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) {
        return { class: 'expired', status: 'expired' };
    } else if (daysUntilExpiry <= CONFIG.EXPIRING_DAYS_CRITICAL) {
        return { class: 'expiring-soon', status: 'critical' };
    } else if (daysUntilExpiry <= CONFIG.EXPIRING_DAYS_WARNING) {
        return { class: 'expiring-soon', status: 'warning' };
    }
    return { class: '', status: 'normal' };
}

function getExpiryBadge(expirationDate) {
    if (!expirationDate || isNaN(new Date(expirationDate))) {
        return '<span class="expiry-badge normal">Sem validade</span>';
    }
    const today = new Date();
    const expiry = new Date(expirationDate);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    const formattedDate = formatDate(expirationDate);
    if (daysUntilExpiry < 0) {
        return `<span class="expiry-badge danger">Vencido (${formattedDate})</span>`;
    } else if (daysUntilExpiry <= CONFIG.EXPIRING_DAYS_CRITICAL) {
        return `<span class="expiry-badge danger">${daysUntilExpiry} dias (${formattedDate})</span>`;
    } else if (daysUntilExpiry <= CONFIG.EXPIRING_DAYS_WARNING) {
        return `<span class="expiry-badge warning">${daysUntilExpiry} dias (${formattedDate})</span>`;
    }
    return `<span class="expiry-badge normal">${formattedDate}</span>`;
}

function checkExpiringProducts() {
    const alert = document.getElementById('expiringAlert');
    const message = document.getElementById('expiringMessage');
    if (!alert || !message) {
        console.error('[UI] Elementos expiringAlert ou expiringMessage não encontrados');
        return;
    }
    const today = new Date();
    const expiring = state.stockData.filter(item => {
        if (!item.expirationDate || isNaN(new Date(item.expirationDate))) return false;
        const expiry = new Date(item.expirationDate);
        const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry >= 0 && daysUntilExpiry <= CONFIG.EXPIRING_DAYS_WARNING;
    });
    if (expiring.length > 0) {
        expiring.sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));
        const nearestExpiring = expiring[0];
        const daysUntilExpiry = Math.ceil((new Date(nearestExpiring.expirationDate) - today) / (1000 * 60 * 60 * 24));
        message.innerHTML = `
            ${expiring.length} produto(s) próximo(s) ao vencimento. 
            <strong>${escapeHtml(nearestExpiring.product)}</strong> vence em ${daysUntilExpiry} dia(s).
        `;
        alert.style.display = 'flex';
    } else {
        alert.style.display = 'none';
    }
}

function displayLocations() {
    const locationsList = document.getElementById('locationsList');
    if (!locationsList) {
        console.error('[UI] Elemento locationsList não encontrado no DOM');
        alert('Erro na interface: elemento de localidades não encontrado. Contate o suporte.');
        return;
    }
    if (state.locationsData.length === 0) {
        locationsList.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <h3>Nenhuma localidade cadastrada</h3>
                <p>Adicione localidades para organizar seu estoque.</p>
            </div>
        `;
        return;
    }
    locationsList.innerHTML = state.locationsData.map(loc => `
        <div class="location-card">
            <div class="location-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
            </div>
            <div class="location-name">${escapeHtml(loc.room)}</div>
            <div class="location-details">${escapeHtml(loc.cabinet || 'Sem armário')}</div>
            <div class="location-actions">
                <button class="btn-action edit" onclick="editLocation('${loc.id}')" aria-label="Editar localidade ${escapeHtml(loc.room)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Editar
                </button>
                <button class="btn-action delete" onclick="deleteLocation('${loc.id}')" aria-label="Excluir localidade ${escapeHtml(loc.room)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Excluir
                </button>
            </div>
        </div>
    `).join('');
}

async function displayLogs() {
    const logsList = document.getElementById('logsList');
    if (!logsList) {
        console.error('[UI] Elemento logsList não encontrado no DOM');
        alert('Erro na interface: elemento de logs não encontrado. Contate o suporte.');
        return;
    }
    const logs = await loadLogs();
    if (logs.length === 0) {
        logsList.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <h3>Nenhum histórico disponível</h3>
                <p>As ações realizadas aparecerão aqui.</p>
            </div>
        `;
        return;
    }
    logsList.innerHTML = logs.slice(0, 50).map(log => `
        <div class="log-item">
            <div class="log-header">
                <span class="log-action">${escapeHtml(log.action)}</span>
                <span class="log-timestamp">${formatDateTime(log.timestamp)}</span>
            </div>
            <div class="log-details">${escapeHtml(log.details)}</div>
        </div>
    `).join('');
}

function updatePagination(totalItems) {
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    if (!pageInfo || !prevBtn || !nextBtn) {
        console.error('[UI] Elementos de paginação não encontrados');
        return;
    }
    const totalPages = Math.ceil(totalItems / CONFIG.ITEMS_PER_PAGE) || 1;
    pageInfo.textContent = `Página ${state.currentPage} de ${totalPages}`;
    prevBtn.disabled = state.currentPage === 1;
    nextBtn.disabled = state.currentPage === totalPages;
}

// ==================== NAVEGAÇÃO ====================
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    const selectedTab = document.getElementById(`${tabName}-section`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    } else {
        console.error(`[UI] Tab ${tabName}-section não encontrada`);
    }
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const selectedNav = document.getElementById(`${tabName}TabBtn`);
    if (selectedNav) {
        selectedNav.classList.add('active');
    }
    if (tabName === 'logs') {
        displayLogs();
    }
}

function previousPage() {
    if (state.currentPage > 1) {
        state.currentPage--;
        displayStock();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function nextPage() {
    const totalPages = Math.ceil(state.filteredStockData.length / CONFIG.ITEMS_PER_PAGE);
    if (state.currentPage < totalPages) {
        state.currentPage++;
        displayStock();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ==================== MODAIS ====================
function openProductModal(title = 'Adicionar Produto', product = null) {
    const modal = document.getElementById('productModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('productForm');
    if (!modal || !modalTitle || !form) {
        console.error('[UI] Elementos do modal de produto não encontrados');
        alert('Erro na interface: modal de produto não encontrado. Contate o suporte.');
        return;
    }
    modalTitle.textContent = title;
    if (product) {
        document.getElementById('productId').value = product.id;
        document.getElementById('productName').value = product.product;
        document.getElementById('manufacturer').value = product.manufacturer;
        document.getElementById('batch').value = product.batch;
        document.getElementById('quantity').value = product.quantity;
        document.getElementById('unit').value = product.unit;
        document.getElementById('packaging').value = product.packaging;
        document.getElementById('packagingNumber').value = product.packagingNumber;
        document.getElementById('minimumStock').value = product.minimumStock;
        document.getElementById('invoice').value = product.invoice;
        document.getElementById('expirationDate').value = product.expirationDate;
        document.getElementById('location').value = product.location;
        document.getElementById('status').value = product.status;
    } else {
        form.reset();
        document.getElementById('productId').value = '';
        document.getElementById('packagingNumber').value = '1';
        document.getElementById('minimumStock').value = '0';
        document.getElementById('status').value = 'disponivel';
    }
    populateLocationDropdown();
    modal.classList.add('active');
}

function closeProductModal() {
    const modal = document.getElementById('productModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function openLocationModal(title
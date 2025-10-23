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

// ==================== Refresh da página ====================

async function refreshPage() {
    showLoading();
    try {
        state.currentPage = 1; // Resetar para a primeira página
        await loadAllData();
        alert('Página atualizada com sucesso!');
    } catch (error) {
        console.error('[App] Erro ao atualizar página:', error);
        alert(`Erro ao atualizar página: ${error.message}`);
    } finally {
        hideLoading();
    }
}

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
        displayLocations();
        displayLogs();
    } catch (error) {
        console.error('[Data] Erro ao carregar dados:', error);
        alert(`Erro ao carregar dados: ${error.message}. Verifique sua conexão ou contate o suporte.`);
    } finally {
        hideLoading();
    }
}

async function generateFrontendSequentialId(prefix) {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/stock`);
    const result = await response.json();
    const count = result.data.length + 1;
    return `${prefix}${count.toString().padStart(6, '0')}`;
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
        state.logsData = Array.isArray(result.data) ? result.data : [];
        console.log('[Data] Logs carregados:', state.logsData.length, 'itens');
    } catch (error) {
        console.error('[Data] Erro ao carregar logs:', error);
        throw error;
    }
}

// ==================== FILTROS E BUSCA ====================
function applyFilters() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const locationFilter = document.getElementById('locationFilter')?.value || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    let filtered = [...state.stockData];
    if (searchTerm) {
        filtered = filtered.filter(item =>
            item.product.toLowerCase().includes(searchTerm) ||
            item.batch.toLowerCase().includes(searchTerm) ||
            item.manufacturer.toLowerCase().includes(searchTerm)
        );
    }
    if (locationFilter) {
        filtered = filtered.filter(item => item.location === locationFilter);
    }
    if (statusFilter) {
        filtered = filtered.filter(item => 
            statusFilter === 'disponivel' ? item.quantity > 0 : item.quantity === 0
        );
    }
    state.filteredStockData = filtered;
    updatePagination();
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
    const grouped = groupByProduct(state.filteredStockData);
    if (grouped.length === 0) {
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
        const start = (state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
        const end = start + CONFIG.ITEMS_PER_PAGE;
        let paginatedItems = [];
        grouped.forEach(group => {
            const sortedItems = sortByExpirationDate(group.items);
            paginatedItems = paginatedItems.concat(sortedItems);
        });
        paginatedItems = paginatedItems.slice(start, end);
        const groupedPaginated = groupByProduct(paginatedItems);
        stockList.innerHTML = groupedPaginated.map(group => `
            <div class="product-group">
                <div class="total-stock-header ${group.totalQuantity <= group.minimumStock && group.minimumStock > 0 ? 'low-stock' : ''}">
                    <h4>${escapeHtml(group.product)}</h4>
                    <p>Total: ${formatNumber(group.totalQuantity)} ${escapeHtml(group.unit)}</p>
                    <p>Estoque Mínimo: ${formatNumber(group.minimumStock)} ${escapeHtml(group.unit)}</p>
                </div>
                <div class="product-group-items">
                    ${group.items.map(item => createProductCard(item)).join('')}
                </div>
            </div>
        `).join('');
    }
    updatePagination(state.filteredStockData.length);
}

function populateFilters() {
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.innerHTML = `
            <option value="">Todos os Status</option>
            <option value="disponivel">Disponível</option>
            <option value="esgotado">Esgotado</option>
        `;
    }
    const locationFilter = document.getElementById('locationFilter');
    if (locationFilter) {
        locationFilter.innerHTML = '<option value="">Todas as Localizações</option>';
        state.locationsData.forEach(location => {
            const option = document.createElement('option');
            option.value = location.id;
            option.textContent = location.cabinet ? `${location.room} - ${location.cabinet}` : location.room;
            locationFilter.appendChild(option);
        });
    }
}

function getLocationName(locationId) {
    if (!locationId) {
        console.warn('[getLocationName] ID de localização ausente');
        return 'Localização não especificada';
    }
    const location = state.locationsData.find(loc => loc.id === locationId);
    if (!location) {
        console.warn('[getLocationName] Localização não encontrada para ID:', locationId);
        return 'Localização inválida';
    }
    return escapeHtml(location.cabinet ? `${location.room} - ${location.cabinet}` : location.room);
}

function createProductCard(item) {
    const expiryStatus = getExpiryStatus(item.expirationDate);
    const expiryBadge = getExpiryBadge(item.expirationDate);
    const isLowStock = item.quantity <= item.minimumStock && item.minimumStock > 0;
    const cardHtml = `
        <div class="product-card ${expiryStatus.class} ${isLowStock ? 'low-stock' : ''}" data-id="${item.id}">
            <div class="product-header">
                <div>
                    <div class="product-name">${escapeHtml(item.product)}</div>
                    <div class="product-batch">Lote: ${escapeHtml(item.batch)}</div>
                </div>
                <span class="product-status ${item.quantity > 0 ? 'disponivel' : 'esgotado'}">${item.quantity > 0 ? 'Disponível' : 'Esgotado'}</span>
            </div>
            <div class="product-info">
                <div class="info-row">
                    <span class="info-label">Quantidade</span>
                    <span class="quantity-badge">${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</span>
                </div>
                ${item.manufacturer ? `
                <div class="info-row">
                    <span class="info-label">Fabricante</span>
                    <span class="info-value">${escapeHtml(item.manufacturer)}</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-label">Validade</span>
                    ${expiryBadge}
                </div>
                <div class="info-row">
                    <span class="info-label">Localização</span>
                    <span class="info-value">${getLocationName(item.location)}</span>
                </div>
                ${item.packaging ? `
                <div class="info-row">
                    <span class="info-label">Quantidade de Embalagens</span>
                    <span class="info-value">${item.packagingNumber}x ${escapeHtml(item.packaging)}</span>
                </div>
                ` : ''}
                ${isLowStock ? `
                <div class="info-row">
                    <span class="info-label" style="color: var(--info);">⚠️ Estoque Baixo</span>
                    <span class="info-value" style="color: var(--info);">Mín: ${formatNumber(item.minimumStock)} ${escapeHtml(item.unit)}</span>
                </div>
                ` : ''}
            </div>
            <div class="product-actions horizontal">
                <button class="btn-action edit" data-id="${item.id}" aria-label="Editar produto ${escapeHtml(item.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Editar
                </button>
                ${item.quantity > 0 ? `
                <button class="btn-action delete" data-id="${item.id}" aria-label="Excluir produto ${escapeHtml(item.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Excluir
                </button>
                <button class="btn-action use" data-id="${item.id}" aria-label="Usar produto ${escapeHtml(item.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 12h16"></path>
                    </svg>
                    Usar
                </button>
                <button class="btn-action exhaust" data-id="${item.id}" aria-label="Esgotar produto ${escapeHtml(item.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 8v8"></path>
                    </svg>
                    Esgotar
                </button>
                ${item.packagingNumber > 1 ? `
                <button class="btn-action transfer" data-id="${item.id}" aria-label="Transferir produto ${escapeHtml(item.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    Transferir
                </button>
                ` : ''}
                ` : ''}
            </div>
        </div>
    `;
    console.log('[createProductCard] HTML gerado para item:', item.id, cardHtml);
    return cardHtml;
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
        <div class="location-card" data-id="${loc.id}">
            <div class="location-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
            </div>
            <div class="location-name">${escapeHtml(loc.room)}</div>
            <div class="location-details">${escapeHtml(loc.cabinet || 'Sem armário')}</div>
            <div class="location-actions">
                <button class="btn-action edit" data-id="${loc.id}" aria-label="Editar localidade ${escapeHtml(loc.room)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Editar
                </button>
                <button class="btn-action delete" data-id="${loc.id}" aria-label="Excluir localidade ${escapeHtml(loc.room)}">
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

function displayLogs() {
    const logsList = document.getElementById('logsList');
    if (!logsList) {
        console.error('[UI] Elemento logsList não encontrado no DOM');
        alert('Erro na interface: elemento de logs não encontrado. Contate o suporte.');
        return;
    }
    if (state.logsData.length === 0) {
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
    logsList.innerHTML = state.logsData.slice(0, 50).map(log => `
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
        console.error('[UI] Elementos do modal de produto não encontrados', { modal, modalTitle, form });
        alert('Erro na interface: modal de produto não encontrado. Verifique o console para detalhes.');
        return;
    }
    console.log('[openProductModal] Abrindo modal com título:', title, 'Produto:', product);
    modalTitle.textContent = title;
    populateLocationDropdown();
    if (product) {
        console.log('[openProductModal] Preenchendo formulário com dados do produto:', product);
        document.getElementById('productId').value = product.id || '';
        document.getElementById('productName').value = product.product || '';
        document.getElementById('manufacturer').value = product.manufacturer || '';
        document.getElementById('batch').value = product.batch || '';
        document.getElementById('quantity').value = product.quantity || '';
        document.getElementById('unit').value = product.unit || 'un';
        document.getElementById('packaging').value = product.packaging || 'Frasco plástico';
        document.getElementById('packagingNumber').value = product.packagingNumber || 1;
        document.getElementById('minimumStock').value = product.minimumStock || 0;
        document.getElementById('invoice').value = product.invoice || '';
        document.getElementById('expirationDate').value = product.expirationDate || '';
        document.getElementById('location').value = product.location || '';
        document.getElementById('status').value = product.status || 'disponivel';
    } else {
        console.log('[openProductModal] Resetando formulário para novo produto');
        form.reset();
        document.getElementById('productId').value = '';
        document.getElementById('packagingNumber').value = '1';
        document.getElementById('minimumStock').value = '0';
        document.getElementById('status').value = 'disponivel';
        document.getElementById('packaging').value = 'Frasco plástico';
    }
    // Remove a classe active primeiro para forçar re-renderização
    modal.classList.remove('active');
    // Usa setTimeout para garantir que o navegador processe a remoção antes de adicionar
    setTimeout(() => {
        modal.classList.add('active');
        console.log('[openProductModal] Modal aberto, classe active adicionada');
    }, 10);
}

function closeProductModal() {
    const modal = document.getElementById('productModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function openLocationModal(title = 'Adicionar Localidade', location = null) {
    const modal = document.getElementById('locationModal');
    const modalTitle = document.getElementById('locationModalTitle');
    const form = document.getElementById('locationForm');
    if (!modal || !modalTitle || !form) {
        console.error('[UI] Elementos do modal de localidade não encontrados');
        alert('Erro na interface: modal de localidade não encontrado. Contate o suporte.');
        return;
    }
    modalTitle.textContent = title;
    if (location) {
        document.getElementById('locationId').value = location.id;
        document.getElementById('room').value = location.room;
        document.getElementById('cabinet').value = location.cabinet || '';
    } else {
        form.reset();
        document.getElementById('locationId').value = '';
    }
    modal.classList.add('active');
}

function closeLocationModal() {
    const modal = document.getElementById('locationModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function openUseProductModal(product) {
    const modal = document.getElementById('useProductModal');
    const form = document.getElementById('useProductForm');
    if (!modal || !form) {
        console.error('[UI] Elementos do modal de uso não encontrados');
        alert('Erro na interface: modal de uso não encontrado. Contate o suporte.');
        return;
    }
    document.getElementById('useProductId').value = product.id;
    document.getElementById('useQuantity').value = '';
    modal.classList.add('active');
}

function closeUseProductModal() {
    const modal = document.getElementById('useProductModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function openTransferProductModal(product) {
    const modal = document.getElementById('transferProductModal');
    const transferLocation = document.getElementById('transferLocation');
    if (!modal || !transferLocation) {
        console.error('[UI] Elementos do modal de transferência não encontrados');
        alert('Erro na interface: modal de transferência não encontrado. Contate o suporte.');
        return;
    }
    document.getElementById('transferProductId').value = product.id;
    populateTransferLocationDropdown(product.location);
    modal.classList.add('active');
}

function closeTransferProductModal() {
    const modal = document.getElementById('transferProductModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function populateLocationDropdown() {
    const select = document.getElementById('location');
    if (!select) {
        console.error('[UI] Elemento location select não encontrado');
        return;
    }
    select.innerHTML = '<option value="">Selecione uma localização</option>';
    state.locationsData.forEach(loc => {
        const option = document.createElement('option');
        option.value = loc.id;
        option.textContent = `${loc.room}${loc.cabinet ? ' - ' + loc.cabinet : ''}`;
        select.appendChild(option);
    });
}

function populateTransferLocationDropdown(currentLocation) {
    const select = document.getElementById('transferLocation');
    if (!select) {
        console.error('[UI] Elemento transferLocation select não encontrado');
        return;
    }
    select.innerHTML = '<option value="">Selecione uma localização</option>';
    state.locationsData.forEach(loc => {
        if (loc.id !== currentLocation) {
            const option = document.createElement('option');
            option.value = loc.id;
            option.textContent = `${loc.room}${loc.cabinet ? ' - ' + loc.cabinet : ''}`;
            select.appendChild(option);
        }
    });
}

// ==================== EVENT LISTENERS ====================
function initializeEventListeners() {
    // Navegação
    document.getElementById('stockTabBtn')?.addEventListener('click', () => showTab('stock'));
    document.getElementById('locationsTabBtn')?.addEventListener('click', () => showTab('locations'));
    document.getElementById('logsTabBtn')?.addEventListener('click', () => showTab('logs'));

    // Paginação
    document.getElementById('prevPage')?.addEventListener('click', previousPage);
    document.getElementById('nextPage')?.addEventListener('click', nextPage);

    // Filtros
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        applyFilters();
        displayStock();
    });
    document.getElementById('statusFilter')?.addEventListener('change', (e) => {
        state.statusFilter = e.target.value;
        applyFilters();
        displayStock();
    });

    // Modais
	document.getElementById('addProductBtn')?.addEventListener('click', () => {
    console.log('[Event] Clicou em Adicionar Produto');
    openProductModal();
	});
    document.getElementById('closeModal')?.addEventListener('click', closeProductModal);
    document.getElementById('cancelBtn')?.addEventListener('click', closeProductModal);
    document.getElementById('productModal')?.querySelector('.modal-overlay')?.addEventListener('click', closeProductModal);
    document.getElementById('productForm')?.addEventListener('submit', handleProductSubmit);

    document.getElementById('addLocationBtn')?.addEventListener('click', () => openLocationModal());
    document.getElementById('closeLocationModal')?.addEventListener('click', closeLocationModal);
    document.getElementById('cancelLocationBtn')?.addEventListener('click', closeLocationModal);
    document.getElementById('locationModal')?.querySelector('.modal-overlay')?.addEventListener('click', closeLocationModal);
    document.getElementById('locationForm')?.addEventListener('submit', handleLocationSubmit);

    document.getElementById('closeUseModal')?.addEventListener('click', closeUseProductModal);
    document.getElementById('cancelUseBtn')?.addEventListener('click', closeUseProductModal);
    document.getElementById('useProductModal')?.querySelector('.modal-overlay')?.addEventListener('click', closeUseProductModal);
    document.getElementById('useProductForm')?.addEventListener('submit', handleUseProductSubmit);

    document.getElementById('closeTransferModal')?.addEventListener('click', closeTransferProductModal);
    document.getElementById('cancelTransferBtn')?.addEventListener('click', closeTransferProductModal);
    document.getElementById('transferProductModal')?.querySelector('.modal-overlay')?.addEventListener('click', closeTransferProductModal);
    document.getElementById('transferProductForm')?.addEventListener('submit', handleTransferProductSubmit);
    document.getElementById('refreshPageBtn')?.addEventListener('click', refreshPage);


    // Delegação de eventos para botões dinâmicos
document.getElementById('stockList')?.addEventListener('click', (e) => {
    console.log('[Event] Clique em #stockList:', e.target);
    const target = e.target.closest('.btn-action');
    if (!target) {
        console.log('[Event] Nenhum botão .btn-action encontrado');
        return;
    }
    const productId = target.dataset.id;
    console.log('[Event] Botão clicado, productId:', productId, 'Classes:', target.classList);
    const product = state.stockData.find(p => p.id === productId);
    if (!product) {
        console.error('[Event] Produto não encontrado para ID:', productId);
        alert('Produto não encontrado.');
        return;
    }
    if (target.classList.contains('edit')) {
        console.log('[Event] Abrindo modal para edição do produto:', product);
        openProductModal('Editar Produto', product);
    } else if (target.classList.contains('delete')) {
        console.log('[Event] Excluindo produto:', productId);
        deleteProduct(productId);
    } else if (target.classList.contains('use')) {
        console.log('[Event] Abrindo modal de uso do produto:', product);
        openUseProductModal(product);
    } else if (target.classList.contains('exhaust')) {
        console.log('[Event] Esgotando produto:', productId);
        exhaustProduct(productId);
    } else if (target.classList.contains('transfer')) {
        console.log('[Event] Abrindo modal de transferência do produto:', product);
        openTransferProductModal(product);
    }
});

    document.getElementById('locationsList')?.addEventListener('click', (e) => {
        const target = e.target.closest('.btn-action');
        if (!target) return;
        const locationId = target.dataset.id;
        const location = state.locationsData.find(loc => loc.id === locationId);
        if (!location) {
            alert('Localidade não encontrada.');
            return;
        }
        if (target.classList.contains('edit')) {
            openLocationModal('Editar Localidade', location);
        } else if (target.classList.contains('delete')) {
            deleteLocation(locationId);
        }
    });
}

// ==================== MANIPULAÇÃO DE FORMULÁRIOS ====================
async function handleProductSubmit(e) {
    e.preventDefault();
    showLoading();
    try {
        const productId = document.getElementById('productId').value;
        const packaging = document.getElementById('packaging').value;
        if (!packaging) {
            throw new Error('Selecione um tipo de embalagem válido.');
        }
        const product = {
            id: productId || await generateFrontendSequentialId('prod_'),
            product: document.getElementById('productName').value,
            manufacturer: document.getElementById('manufacturer').value,
            batch: document.getElementById('batch').value,
            quantity: parseFloat(document.getElementById('quantity').value) || 0,
            unit: document.getElementById('unit').value,
            packaging: document.getElementById('packaging').value,
            packagingNumber: parseInt(document.getElementById('packagingNumber').value) || 1,
            minimumStock: parseFloat(document.getElementById('minimumStock').value) || 0,
            invoice: document.getElementById('invoice').value,
            expirationDate: document.getElementById('expirationDate').value,
            location: document.getElementById('location').value,
            status: document.getElementById('status').value,
            packaging: packaging
        };
        let response;
        if (productId) {
            const index = state.stockData.findIndex(p => p.id === productId);
            response = await fetch(`${CONFIG.API_BASE_URL}/api/stock/${productId}?index=${index}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(product)
            });
        } else {
            response = await fetch(`${CONFIG.API_BASE_URL}/api/stock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(product)
            });
        }
        if (!response.ok) {
            throw new Error(`Erro ao salvar produto: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Erro ao salvar produto');
        }
        await loadStock();
        applyFilters();
        displayStock();
        closeProductModal();
        alert(productId ? 'Produto atualizado com sucesso!' : 'Produto adicionado com sucesso!');
    } catch (error) {
        console.error('[Form] Erro ao salvar produto:', error);
        alert(`Erro ao salvar produto: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function handleLocationSubmit(e) {
    e.preventDefault();
    showLoading();
    try {
        const locationId = document.getElementById('locationId').value;
        const location = {
            id: locationId || `loc_${Date.now()}`,
            room: document.getElementById('room').value,
            cabinet: document.getElementById('cabinet').value
        };
        let response;
        if (locationId) {
            const index = state.locationsData.findIndex(loc => loc.id === locationId);
            response = await fetch(`${CONFIG.API_BASE_URL}/api/locations/${locationId}?index=${index}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(location)
            });
        } else {
            response = await fetch(`${CONFIG.API_BASE_URL}/api/locations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(location)
            });
        }
        if (!response.ok) {
            throw new Error(`Erro ao salvar localidade: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Erro ao salvar localidade');
        }
        await loadLocations();
        displayLocations();
        closeLocationModal();
        alert(locationId ? 'Localidade atualizada com sucesso!' : 'Localidade adicionada com sucesso!');
    } catch (error) {
        console.error('[Form] Erro ao salvar localidade:', error);
        alert(`Erro ao salvar localidade: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function handleUseProductSubmit(e) {
    e.preventDefault();
    showLoading();
    try {
        const productId = document.getElementById('useProductId').value;
        const useQuantity = parseFloat(document.getElementById('useQuantity').value);
        if (isNaN(useQuantity) || useQuantity <= 0) {
            throw new Error('Quantidade inválida.');
        }
        const product = state.stockData.find(p => p.id === productId);
        if (!product) {
            throw new Error('Produto não encontrado.');
        }
        if (useQuantity > product.quantity) {
            throw new Error('Quantidade a usar excede o estoque disponível.');
        }
        const updatedProduct = { ...product, quantity: product.quantity - useQuantity };
        const index = state.stockData.findIndex(p => p.id === productId);
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/stock/${productId}?index=${index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProduct)
        });
        if (!response.ok) {
            throw new Error(`Erro ao usar produto: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Erro ao usar produto');
        }
        await loadStock();
        applyFilters();
        displayStock();
        closeUseProductModal();
        alert(`Produto ${product.product} usado com sucesso!`);
    } catch (error) {
        console.error('[Form] Erro ao usar produto:', error);
        alert(`Erro ao usar produto: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function populateLocationSelect() {
    const select = document.getElementById('location');
    const transferSelect = document.getElementById('transferLocation');
    if (!select || !transferSelect) {
        console.error('[populateLocationSelect] Elementos select ou transferSelect não encontrados');
        return;
    }
    select.innerHTML = '<option value="">Selecione uma localização</option>';
    transferSelect.innerHTML = '<option value="">Selecione uma localização</option>';
    state.locationsData.forEach(location => {
        const option = document.createElement('option');
        option.value = location.id;
        option.textContent = location.cabinet ? `${location.room} - ${location.cabinet}` : location.room;
        select.appendChild(option.cloneNode(true));
        transferSelect.appendChild(option);
    });
    console.log('[populateLocationSelect] Opções de localização adicionadas:', state.locationsData.length);
}

async function handleTransferProductSubmit(e) {
    e.preventDefault();
    showLoading();
    try {
        const productId = document.getElementById('transferProductId').value;
        const newLocationId = document.getElementById('transferLocation').value;
        console.log('[handleTransferProductSubmit] Transferindo produto:', { productId, newLocationId });
        if (!newLocationId) {
            throw new Error('Selecione uma localização válida.');
        }
        const product = state.stockData.find(p => p.id === productId);
        if (!product) {
            throw new Error('Produto não encontrado.');
        }
        if (product.packagingNumber <= 1) {
            throw new Error('Produto não possui múltiplas embalagens para transferência.');
        }
        const quantityPerPackage = product.quantity / product.packagingNumber;
        if (product.quantity < quantityPerPackage) {
            throw new Error('Quantidade insuficiente para transferência.');
        }

        // Verificar se já existe um produto com mesmo product, batch e nova localização
        const existingProduct = state.stockData.find(p =>
            p.product === product.product &&
            p.batch === product.batch &&
            p.location === newLocationId
        );

        if (existingProduct) {
            // Atualizar o número de embalagens e quantidade do produto existente
            console.log('[handleTransferProductSubmit] Produto existente encontrado, atualizando:', existingProduct);
            const updatedExistingProduct = {
                ...existingProduct,
                packagingNumber: existingProduct.packagingNumber + 1,
                quantity: existingProduct.quantity + quantityPerPackage,
                packaging: product.packaging || 'Frasco plástico'
            };
            const existingIndex = state.stockData.findIndex(p => p.id === existingProduct.id);
            const updateExistingResponse = await fetch(`${CONFIG.API_BASE_URL}/api/stock/${existingProduct.id}?index=${existingIndex}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedExistingProduct)
            });
            const updateResult = await updateExistingResponse.json();
            if (!updateExistingResponse.ok) {
                throw new Error(`Erro ao atualizar produto existente: ${updateExistingResponse.status} ${updateResult.error || updateExistingResponse.statusText}`);
            }
            console.log('[handleTransferProductSubmit] Produto existente atualizado com sucesso:', updateResult);
        } else {
            // Criar novo produto na nova localização com 1 embalagem e quantidade por embalagem
            console.log('[handleTransferProductSubmit] Criando novo produto na nova localização');
            const newProduct = {
                ...product,
                id: await generateFrontendSequentialId('prod_'),
                packagingNumber: 1,
                quantity: quantityPerPackage,
                location: newLocationId,
                packaging: product.packaging || 'Frasco plástico'
            };
            console.log('[handleTransferProductSubmit] Dados do novo produto:', newProduct);
            const addResponse = await fetch(`${CONFIG.API_BASE_URL}/api/stock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newProduct)
            });
            const addResult = await addResponse.json();
            if (!addResponse.ok) {
                throw new Error(`Erro ao criar novo produto: ${addResponse.status} ${addResult.error || addResponse.statusText}`);
            }
            console.log('[handleTransferProductSubmit] Novo produto criado com sucesso:', addResult);
        }

        // Atualizar produto original (reduzir embalagens e quantidade)
        console.log('[handleTransferProductSubmit] Atualizando produto original:', product);
        const updatedProduct = {
            ...product,
            packagingNumber: product.packagingNumber - 1,
            quantity: product.quantity - quantityPerPackage,
            packaging: product.packaging || 'Frasco plástico'
        };
        const index = state.stockData.findIndex(p => p.id === productId);
        const updateResponse = await fetch(`${CONFIG.API_BASE_URL}/api/stock/${productId}?index=${index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProduct)
        });
        const updateResult = await updateResponse.json();
        if (!updateResponse.ok) {
            throw new Error(`Erro ao atualizar produto: ${updateResponse.status} ${updateResult.error || updateResponse.statusText}`);
        }
        console.log('[handleTransferProductSubmit] Produto original atualizado com sucesso:', updateResult);

        // Registrar log
        console.log('[handleTransferProductSubmit] Registrando log da transferência');
        await fetch(`${CONFIG.API_BASE_URL}/api/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: `log_${Date.now()}`,
                action: 'Transferir Produto',
                details: `${product.product} (Lote: ${product.batch}) para ${getLocationName(newLocationId)}`,
                timestamp: new Date().toISOString()
            })
        });

        await loadStock();
        applyFilters();
        displayStock();
        closeTransferProductModal();
        alert(`Produto ${product.product} transferido com sucesso!`);
    } catch (error) {
        console.error('[Form] Erro ao transferir produto:', error);
        alert(`Erro ao transferir produto: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function exhaustProduct(productId) {
    if (!confirm('Tem certeza que deseja esgotar este produto? A quantidade será zerada.')) {
        return;
    }
    showLoading();
    try {
        const product = state.stockData.find(p => p.id === productId);
        if (!product) {
            console.error('[exhaustProduct] Produto não encontrado:', productId);
            throw new Error('Produto não encontrado.');
        }
        console.log('[exhaustProduct] Produto encontrado:', product);
        // Validar campos obrigatórios
        const missingFields = [];
        if (!product.product) missingFields.push('product');
        if (!product.batch) missingFields.push('batch');
        if (product.quantity === undefined || product.quantity === null) missingFields.push('quantity');
        if (!product.unit) missingFields.push('unit');
        if (!product.location) missingFields.push('location');
        if (!product.status) missingFields.push('status');
		if (!product.packaging) missingFields.push('packaging'); // Adicionada validação
        if (missingFields.length > 0) {
            console.error('[exhaustProduct] Campos obrigatórios ausentes:', missingFields, 'Produto:', product);
            throw new Error(`Produto com dados incompletos. Campos ausentes: ${missingFields.join(', ')}.`);
        }
        const updatedProduct = {
            id: product.id,
            product: product.product,
            batch: product.batch,
            quantity: 0,
            unit: product.unit,
            location: product.location,
            status: product.status,
            manufacturer: product.manufacturer || '',
            packaging: product.packaging || '',
            packagingNumber: product.packagingNumber || 1,
            minimumStock: product.minimumStock || 0,
            invoice: product.invoice || '',
            expirationDate: product.expirationDate || '',
            packaging: product.packaging || 'Frasco plástico' // Inclui packageType com padrão
        };
        const index = state.stockData.findIndex(p => p.id === productId);
        if (index === -1) {
            console.error('[exhaustProduct] Índice não encontrado para produto:', productId);
            throw new Error('Índice do produto não encontrado.');
        }
        console.log('[exhaustProduct] Enviando atualização:', { productId, index, updatedProduct });
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/stock/${productId}?index=${index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProduct)
        });
        console.log('[exhaustProduct] Resposta do servidor:', response.status, response.statusText);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao esgotar produto: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Erro ao esgotar produto');
        }
        await loadStock();
        applyFilters();
        displayStock();
        alert(`Produto ${product.product} esgotado com sucesso!`);
    } catch (error) {
        console.error('[Form] Erro ao esgotar produto:', error);
        alert(`Erro ao esgotar produto: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function deleteProduct(productId) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) {
        return;
    }
    showLoading();
    try {
        const index = state.stockData.findIndex(p => p.id === productId);
        if (index === -1) {
            console.error('[deleteProduct] Índice não encontrado para produto:', productId);
            throw new Error('Índice do produto não encontrado.');
        }
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/stock/${productId}?index=${index}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`Erro ao excluir produto: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Erro ao excluir produto');
        }
        await loadStock();
        applyFilters();
        displayStock();
        alert('Produto excluído com sucesso!');
    } catch (error) {
        console.error('[Form] Erro ao excluir produto:', error);
        alert(`Erro ao excluir produto: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function deleteLocation(locationId) {
    if (!confirm('Tem certeza que deseja excluir esta localidade?')) {
        return;
    }
    showLoading();
    try {
        const index = state.locationsData.findIndex(loc => loc.id === locationId);
        if (index === -1) {
            console.error('[deleteLocation] Índice não encontrado para localidade:', locationId);
            throw new Error('Índice da localidade não encontrado.');
        }
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/locations/${locationId}?index=${index}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`Erro ao excluir localidade: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Erro ao excluir localidade');
        }
        await loadLocations();
        displayLocations();
        alert('Localidade excluída com sucesso!');
    } catch (error) {
        console.error('[Form] Erro ao excluir localidade:', error);
        alert(`Erro ao excluir localidade: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// ==================== UTILITÁRIOS ====================
function showLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.classList.add('active');
    }
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('active');
    }
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatNumber(number) {
    return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

function formatDate(dateStr) {
    if (!dateStr || isNaN(new Date(dateStr))) return 'Sem validade';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr || isNaN(new Date(dateStr))) return 'Data inválida';
    const date = new Date(dateStr);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
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
        console.log('[Data] Carregando todos os dados do backend');
        await Promise.all([
            loadStock(),
            loadLocations(),
            loadLogs()
        ]);
        
        applyFilters();
        displayStock();
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
        
        let result;
        try {
            result = await response.json();
        } catch (error) {
            throw new Error('Erro ao parsear resposta do servidor: JSON inválido');
        }
        
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
        
        let result;
        try {
            result = await response.json();
        } catch (error) {
            throw new Error('Erro ao parsear resposta do servidor: JSON inválido');
        }
        
        if (!result || typeof result !== 'object' || !result.success) {
            throw new Error('Resposta do servidor em formato inválido');
        }
        
        const logs = Array.isArray(result.data) ? result.data : [];
        console.log('[Data] Logs carregados:', logs.length, 'itens');
        return logs;
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
            item.product.toLowerCase().includes(query) ||
            item.batch.toLowerCase().includes(query) ||
            item.manufacturer.toLowerCase().includes(query)
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
        const key = `${item.product}_${item.batch}`;
        
        if (!grouped[key]) {
            grouped[key] = {
                ...item,
                totalQuantity: 0,
                items: []
            };
        }
        
        grouped[key].totalQuantity += item.quantity;
        grouped[key].items.push(item);
        
        if (!grouped[key].expirationDate || 
            (item.expirationDate && item.expirationDate < grouped[key].expirationDate)) {
            grouped[key].expirationDate = item.expirationDate;
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

function createProductCard(group) {
    const expiryStatus = getExpiryStatus(group.expirationDate);
    const expiryBadge = getExpiryBadge(group.expirationDate);
    const isLowStock = group.totalQuantity <= group.minimumStock && group.minimumStock > 0;
    
    return `
        <div class="product-card ${expiryStatus.class} ${isLowStock ? 'low-stock' : ''}">
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
                
                <!-- Subdivisão de Saldo Total e Estoque Mínimo -->
                <div class="stock-summary">
                    <div class="summary-item">
                        <span class="summary-label">Saldo Total</span>
                        <span class="summary-value">${formatNumber(group.totalQuantity)} ${escapeHtml(group.unit)}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Estoque Mín.</span>
                        <span class="summary-value">${formatNumber(group.minimumStock)} ${escapeHtml(group.unit)}</span>
                    </div>
                </div>
            </div>
            
            <div class="product-actions">
                <button class="btn-action edit" onclick="editProduct('${group.items[0].id}')" aria-label="Editar produto ${escapeHtml(group.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Editar
                </button>
                <button class="btn-action delete" onclick="deleteProduct('${group.items[0].id}')" aria-label="Excluir produto ${escapeHtml(group.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Excluir
                </button>
                <button class="btn-action exhaust" onclick="exhaustProduct('${group.items[0].id}')" aria-label="Esgotar produto ${escapeHtml(group.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="16"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    Esgotar
                </button>
                <button class="btn-action use" onclick="openUseModal('${group.items[0].id}')" aria-label="Usar produto ${escapeHtml(group.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"></path>
                        <path d="M12 6v6l4 2"></path>
                    </svg>
                    Usar
                </button>
                <button class="btn-action transfer" onclick="openTransferModal('${group.items[0].id}')" aria-label="Transferir produto ${escapeHtml(group.product)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 5v14"></path>
                        <path d="M19 12l-7 7-7-7"></path>
                    </svg>
                    Transferir
                </button>
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
        console.error('[UI] Elementos de alerta de validade não encontrados');
        return;
    }
    
    const today = new Date();
    const expiringProducts = state.stockData.filter(item => {
        if (!item.expirationDate || isNaN(new Date(item.expirationDate))) return false;
        const expiry = new Date(item.expirationDate);
        const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry <= CONFIG.EXPIRING_DAYS_WARNING && daysUntilExpiry >= 0;
    });
    
    if (expiringProducts.length > 0) {
        message.innerHTML = `${expiringProducts.length} produto(s) próximo(s) ao vencimento. Verifique o estoque!`;
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
    
    locationsList.innerHTML = state.locationsData.map(loc => `
        <div class="location-card">
            <div class="location-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
            </div>
            <div class="location-name">${escapeHtml(loc.room)}</div>
            <div class="location-details">${escapeHtml(loc.cabinet || 'Sem armário especificado')}</div>
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
        document.getElementById('cabinet').value = location.cabinet;
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

// ==================== MODAIS DE AÇÕES ====================
function openUseModal(productId) {
    const product = state.stockData.find(p => p.id === productId);
    if (!product) {
        alert('Produto não encontrado.');
        return;
    }
    
    const quantity = prompt(`Quantos ${product.unit} deseja usar de "${product.product}" (Lote: ${product.batch})?\n\nQuantidade disponível: ${product.quantity} ${product.unit}`);
    
    if (quantity === null) return;
    
    const quantityToUse = parseFloat(quantity);
    if (isNaN(quantityToUse) || quantityToUse <= 0) {
        alert('Quantidade inválida.');
        return;
    }
    
    if (quantityToUse > product.quantity) {
        alert(`Quantidade insuficiente. Disponível: ${product.quantity} ${product.unit}`);
        return;
    }
    
    useProduct(productId, quantityToUse);
}

function openTransferModal(productId) {
    const product = state.stockData.find(p => p.id === productId);
    if (!product) {
        alert('Produto não encontrado.');
        return;
    }
    
    if (product.packagingNumber <= 1) {
        alert('Este produto tem apenas uma embalagem. Não é possível transferir.');
        return;
    }
    
    const newLocation = prompt(`Selecione a nova localização para transferir uma unidade de "${product.product}" (Lote: ${product.batch}):\n\nLocalidades disponíveis:\n${state.locationsData.map(l => `- ${l.room} - ${l.cabinet || 'Sem armário'}`).join('\n')}`);
    
    if (newLocation === null) return;
    
    transferProduct(productId, newLocation);
}

function populateLocationDropdown() {
    const select = document.getElementById('location');
    if (!select) {
        console.error('[UI] Elemento location não encontrado');
        return;
    }
    
    select.innerHTML = '<option value="">Selecione uma localização</option>' +
        state.locationsData.map(loc => 
            `<option value="${escapeHtml(loc.room)} - ${escapeHtml(loc.cabinet || 'Sem armário')}">${escapeHtml(loc.room)} - ${escapeHtml(loc.cabinet || 'Sem armário')}</option>`
        ).join('');
}

// ==================== CRUD PRODUTOS ====================
async function saveProduct(event) {
    event.preventDefault();
    showLoading();
    
    try {
        const productId = document.getElementById('productId').value;
        const isEdit = !!productId;
        
        const product = {
            id: productId || `prod_${Date.now()}`,
            product: document.getElementById('productName').value.trim(),
            manufacturer: document.getElementById('manufacturer').value.trim(),
            batch: document.getElementById('batch').value.trim(),
            quantity: parseFloat(document.getElementById('quantity').value) || 0,
            unit: document.getElementById('unit').value,
            packaging: document.getElementById('packaging').value.trim(),
            packagingNumber: parseInt(document.getElementById('packagingNumber').value) || 1,
            minimumStock: parseFloat(document.getElementById('minimumStock').value) || 0,
            invoice: document.getElementById('invoice').value.trim(),
            expirationDate: document.getElementById('expirationDate').value,
            location: document.getElementById('location').value,
            status: document.getElementById('status').value
        };
        
        // Validação: Nota Fiscal é opcional, mas outros campos são obrigatórios
        if (!product.product || !product.batch || !product.quantity || !product.unit || !product.location || !product.status) {
            alert('Por favor, preencha todos os campos obrigatórios: Nome, Lote, Quantidade, Unidade, Localização e Status.');
            return;
        }
        
        const url = isEdit ? `${CONFIG.API_BASE_URL}/api/stock/${product.id}?index=${state.stockData.findIndex(p => p.id === product.id)}` : `${CONFIG.API_BASE_URL}/api/stock`;
        const method = isEdit ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(product)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro ao ${isEdit ? 'atualizar' : 'adicionar'} produto`);
        }
        
        await loadStock();
        applyFilters();
        displayStock();
        checkExpiringProducts();
        closeProductModal();
    } catch (error) {
        console.error('[CRUD] Erro ao salvar produto:', error);
        alert(`Erro ao salvar produto: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function editProduct(id) {
    const product = state.stockData.find(p => p.id === id);
    if (product) {
        openProductModal('Editar Produto', product);
    } else {
        alert('Produto não encontrado.');
    }
}

async function deleteProduct(id) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) {
        return;
    }
    
    showLoading();
    
    try {
        const index = state.stockData.findIndex(p => p.id === id);
        if (index === -1) {
            throw new Error('Produto não encontrado');
        }
        
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/stock/${id}?index=${index}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao excluir produto');
        }
        
        await loadStock();
        applyFilters();
        displayStock();
        checkExpiringProducts();
    } catch (error) {
        console.error('[CRUD] Erro ao excluir produto:', error);
        alert(`Erro ao excluir produto: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// ==================== FUNÇÕES DE AÇÃO ====================
async function exhaustProduct(id) {
    if (!confirm('Tem certeza que deseja esgotar este produto (zerar o saldo)?')) {
        return;
    }
    
    showLoading();
    
    try {
        const product = state.stockData.find(p => p.id === id);
        if (!product) {
            throw new Error('Produto não encontrado');
        }
        
        const updatedProduct = { ...product, quantity: 0 };
        const index = state.stockData.findIndex(p => p.id === id);
        
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/stock/${id}?index=${index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProduct)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao esgotar produto');
        }
        
        await loadStock();
        applyFilters();
        displayStock();
        checkExpiringProducts();
        alert('Produto esgotado com sucesso!');
    } catch (error) {
        console.error('[Action] Erro ao esgotar produto:', error);
        alert(`Erro ao esgotar produto: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function useProduct(id, quantityToUse) {
    showLoading();
    
    try {
        const product = state.stockData.find(p => p.id === id);
        if (!product) {
            throw new Error('Produto não encontrado');
        }
        
        const newQuantity = product.quantity - quantityToUse;
        const updatedProduct = { ...product, quantity: newQuantity };
        const index = state.stockData.findIndex(p => p.id === id);
        
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/stock/${id}?index=${index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProduct)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao usar produto');
        }
        
        await loadStock();
        applyFilters();
        displayStock();
        checkExpiringProducts();
        alert(`${quantityToUse} ${product.unit} utilizado(s) com sucesso!`);
    } catch (error) {
        console.error('[Action] Erro ao usar produto:', error);
        alert(`Erro ao usar produto: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function transferProduct(id, newLocation) {
    showLoading();
    
    try {
        const product = state.stockData.find(p => p.id === id);
        if (!product) {
            throw new Error('Produto não encontrado');
        }
        
        // Criar novo produto com a localização transferida
        const newProduct = {
            ...product,
            id: `prod_${Date.now()}`,
            location: newLocation,
            packagingNumber: 1,
            quantity: product.quantity / product.packagingNumber
        };
        
        // Atualizar o produto original reduzindo a quantidade de embalagens
        const updatedProduct = {
            ...product,
            packagingNumber: product.packagingNumber - 1,
            quantity: product.quantity - newProduct.quantity
        };
        
        // Adicionar novo produto
        const addResponse = await fetch(`${CONFIG.API_BASE_URL}/api/stock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newProduct)
        });
        
        if (!addResponse.ok) {
            const errorData = await addResponse.json();
            throw new Error(errorData.error || 'Erro ao transferir produto');
        }
        
        // Atualizar produto original
        const index = state.stockData.findIndex(p => p.id === id);
        const updateResponse = await fetch(`${CONFIG.API_BASE_URL}/api/stock/${id}?index=${index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProduct)
        });
        
        if (!updateResponse.ok) {
            const errorData = await updateResponse.json();
            throw new Error(errorData.error || 'Erro ao atualizar produto original');
        }
        
        await loadStock();
        applyFilters();
        displayStock();
        checkExpiringProducts();
        alert('Produto transferido com sucesso!');
    } catch (error) {
        console.error('[Action] Erro ao transferir produto:', error);
        alert(`Erro ao transferir produto: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// ==================== CRUD LOCALIDADES ====================
async function saveLocation(event) {
    event.preventDefault();
    showLoading();
    
    try {
        const locationId = document.getElementById('locationId').value;
        const isEdit = !!locationId;
        
        const location = {
            id: locationId || `loc_${Date.now()}`,
            room: document.getElementById('room').value.trim(),
            cabinet: document.getElementById('cabinet').value.trim()
        };
        
        if (!location.room) {
            alert('Por favor, preencha o nome da sala.');
            return;
        }
        
        const url = isEdit ? `${CONFIG.API_BASE_URL}/api/locations/${location.id}?index=${state.locationsData.findIndex(l => l.id === location.id)}` : `${CONFIG.API_BASE_URL}/api/locations`;
        const method = isEdit ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(location)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro ao ${isEdit ? 'atualizar' : 'adicionar'} localidade`);
        }
        
        await loadLocations();
        displayLocations();
        closeLocationModal();
    } catch (error) {
        console.error('[CRUD] Erro ao salvar localidade:', error);
        alert(`Erro ao salvar localidade: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function editLocation(id) {
    const location = state.locationsData.find(l => l.id === id);
    if (location) {
        openLocationModal('Editar Localidade', location);
    } else {
        alert('Localidade não encontrada.');
    }
}

async function deleteLocation(id) {
    if (!confirm('Tem certeza que deseja excluir esta localidade?')) {
        return;
    }
    
    showLoading();
    
    try {
        const index = state.locationsData.findIndex(l => l.id === id);
        if (index === -1) {
            throw new Error('Localidade não encontrada');
        }
        
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/locations/${id}?index=${index}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao excluir localidade');
        }
        
        await loadLocations();
        displayLocations();
    } catch (error) {
        console.error('[CRUD] Erro ao excluir localidade:', error);
        alert(`Erro ao excluir localidade: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// ==================== UTILITÁRIOS ====================
function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('active');
    } else {
        console.error('[UI] Elemento loadingOverlay não encontrado');
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(num) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(num);
}

function formatDate(dateString) {
    if (!dateString || isNaN(new Date(dateString))) return 'N/A';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatDateTime(isoString) {
    if (!isoString || isNaN(new Date(isoString))) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==================== EVENT LISTENERS ====================
function initializeEventListeners() {
    console.log('[Events] Inicializando event listeners');
    
    document.getElementById('stockTabBtn')?.addEventListener('click', () => showTab('stock'));
    document.getElementById('locationsTabBtn')?.addEventListener('click', () => showTab('locations'));
    document.getElementById('logsTabBtn')?.addEventListener('click', () => showTab('logs'));
    
    document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());
    document.getElementById('addLocationBtn')?.addEventListener('click', () => openLocationModal());
    
    document.getElementById('closeModal')?.addEventListener('click', closeProductModal);
    document.getElementById('cancelBtn')?.addEventListener('click', closeProductModal);
    document.getElementById('productForm')?.addEventListener('submit', saveProduct);
    
    document.getElementById('closeLocationModal')?.addEventListener('click', closeLocationModal);
    document.getElementById('cancelLocationBtn')?.addEventListener('click', closeLocationModal);
    document.getElementById('locationForm')?.addEventListener('submit', saveLocation);
    
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeProductModal();
                closeLocationModal();
            }
        });
    });
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            applyFilters();
            displayStock();
        });
    } else {
        console.error('[UI] Elemento searchInput não encontrado');
    }
    
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            state.statusFilter = e.target.value;
            applyFilters();
            displayStock();
        });
    } else {
        console.error('[UI] Elemento statusFilter não encontrado');
    }
    
    document.getElementById('prevPage')?.addEventListener('click', previousPage);
    document.getElementById('nextPage')?.addEventListener('click', nextPage);
    
    console.log('[Events] Event listeners inicializados');
}


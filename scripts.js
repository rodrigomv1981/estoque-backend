const config = { apiUrl: 'https://estoque-backend-zfgj.onrender.com/api' };

const state = {
    products: [],
    filteredProducts: [],
    locationsCache: [],
    globalMinStockCache: [],
    currentPage: 1,
    itemsPerPage: 10
};

async function loadGlobalMinStock() {
    try {
        const response = await fetch(`${config.apiUrl}/globalMinStock`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.globalMinStockCache = (await response.json()).data;
    } catch (error) {
        console.error('Erro ao carregar estoque mínimo global:', error);
    }
}

function checkGlobalStock(productName, newQuantity = 0) {
    const products = state.products.filter(p => 
        p.productName.toLowerCase() === productName.toLowerCase()
    );

    if (products.length === 0) return null;

    const totalStock = products.reduce((sum, p) => sum + (parseFloat(p.quantity) || 0), 0) + newQuantity;
    const globalMinStockEntry = state.globalMinStockCache.find(g => 
        g.productName.toLowerCase() === productName.toLowerCase()
    );
    const globalMinStock = globalMinStockEntry ? globalMinStockEntry.minStock : 0;

    return {
        totalStock,
        globalMinStock,
        isLow: totalStock <= globalMinStock
    };
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === 'N/A') return 'N/A';
    try {
        if (typeof dateStr === 'string' && dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            return dateStr;
        }
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return 'Data inválida';
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (error) {
        console.error('Erro ao formatar data:', error);
        return 'Data inválida';
    }
}

async function updateLocationSelect(selectId = 'locationId') {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '<option value="">Selecione a localização...</option>';
    try {
        const response = await fetch(`${config.apiUrl}/locations`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.locationsCache = (await response.json()).data;
        state.locationsCache.forEach(location => {
            const option = document.createElement('option');
            option.value = location.id;
            option.textContent = location.cabinet ? `${location.room} - ${location.cabinet}` : location.room;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar localizações:', error);
    }
}

async function loadAndDisplayStock() {
    showLoading();
    try {
        const response = await fetch(`${config.apiUrl}/stock`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.products = (await response.json()).data;
        state.filteredProducts = [...state.products];
        await loadGlobalMinStock();
        renderProductTable();
    } catch (error) {
        showError('form-error', `Falha ao carregar estoque: ${error.message}`);
        state.products = [];
        state.filteredProducts = [];
        renderProductTable();
    } finally {
        hideLoading();
    }
}

function createProductRow(product, index) {
    const statusClass = product.status.replace(/\s+/g, '-').toLowerCase();
    const row = document.createElement('tr');
    row.className = `status-${statusClass}`;
    row.setAttribute('data-id', product.id);

    const alerts = [];
    if (product.status === 'esgotado') alerts.push('Esgotado');
    if (product.expirationDate && new Date(product.expirationDate) < new Date()) {
        alerts.push('Vencido');
    }

    row.innerHTML = `
        <td data-label="Produto">${product.productName}</td>
        <td data-label="Unidade">${product.unit}</td>
        <td data-label="Quantidade">${product.quantity.toFixed(2)}</td>
        <td data-label="Lote">${product.batch}</td>
        <td data-label="Embalagem">${product.packageType}</td>
        <td data-label="Validade">${formatDate(product.expirationDate)}</td>
        <td data-label="Localização">${product.location}</td>
        <td data-label="Alerta">${alerts.join(' • ')}</td>
        <td data-label="Ações" class="product-actions">
            <input type="number" id="quantity-use-${product.id}" class="quantity-input" min="0" step="0.01" placeholder="Qtd" aria-label="Quantidade a usar">
            <button class="btn-action use" onclick="useProduct('${product.id}', ${index})" ${product.status === 'esgotado' ? 'disabled' : ''} title="Usar"><i class="fas fa-hand-paper"></i></button>
            <button class="btn-action finish" onclick="finishProduct('${product.id}', ${index})" ${product.status === 'esgotado' ? 'disabled' : ''} title="Esgotar"><i class="fas fa-check-circle"></i></button>
            <button class="btn-action edit" onclick="editProduct('${product.id}', ${index})" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="btn-action delete" onclick="deleteProduct('${product.id}', ${index})" title="Excluir"><i class="fas fa-trash"></i></button>
        </td>
    `;
    return row;
}

function renderProductTable() {
    const tableBody = document.getElementById('productTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (state.filteredProducts.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9">Nenhum produto encontrado.</td></tr>';
        return;
    }

    // Agrupar por productName e batch
    const groupedProducts = state.filteredProducts.reduce((acc, product, index) => {
        const key = `${product.productName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}_${product.batch}`;
        if (!acc[key]) {
            acc[key] = {
                products: [],
                totalStock: 0,
                minStock: Infinity,
                unit: product.unit || 'un',
                index: index
            };
        }
        acc[key].products.push({ ...product, index });
        acc[key].totalStock += parseFloat(product.quantity) || 0;
        acc[key].minStock = Math.min(acc[key].minStock, parseFloat(product.minStock) || 0);
        return acc;
    }, {});

    const sortedGroups = Object.entries(groupedProducts).sort(([keyA], [keyB]) => {
        const [nameA, batchA] = keyA.split('_');
        const [nameB, batchB] = keyB.split('_');
        return nameA.localeCompare(nameB) || batchA.localeCompare(batchB);
    });

    for (const [key, groupData] of sortedGroups) {
        const [productName] = key.split('_');
        const stockCheck = checkGlobalStock(productName);
        const globalStockAlert = stockCheck && stockCheck.isLow
            ? `<span class="alert-global">ESTOQUE BAIXO (Total: ${stockCheck.totalStock.toFixed(2)} | Mínimo: ${stockCheck.globalMinStock.toFixed(2)})</span>`
            : '';

        const headerRow = document.createElement('tr');
        headerRow.classList.add('product-group-header');
        headerRow.innerHTML = `
            <td colspan="9">
                <strong>${groupData.products[0].productName} (Lote: ${groupData.products[0].batch})</strong>
                <div class="group-summary">
                    Total: ${groupData.totalStock.toFixed(2)} ${groupData.unit} | 
                    Mínimo: ${groupData.minStock.toFixed(2)} ${groupData.unit}
                    ${globalStockAlert}
                </div>
            </td>
        `;
        tableBody.appendChild(headerRow);

        groupData.products.forEach(product => {
            tableBody.appendChild(createProductRow(product, product.index));
        });
    }
}

async function openAddProductModal() {
    const modalTitle = document.getElementById('modalTitle');
    const addProductForm = document.getElementById('addProductForm');
    const productIdInput = document.getElementById('productId');
    const rowIndexInput = document.getElementById('rowIndex');
    const modalError = document.getElementById('modal-error');
    const productModal = document.getElementById('productModal');
    const globalMinStockDisplay = document.getElementById('global-min-stock-display');

    if (modalTitle) modalTitle.textContent = 'Adicionar Produto';
    if (addProductForm) addProductForm.reset();
    if (productIdInput) productIdInput.value = '';
    if (rowIndexInput) rowIndexInput.value = '';
    if (modalError) modalError.style.display = 'none';
    if (globalMinStockDisplay) globalMinStockDisplay.textContent = '0.00';

    await updateLocationSelect();
    if (productModal) productModal.style.display = 'block';
}

async function addOrUpdateProduct(event) {
    event.preventDefault();
    const form = document.getElementById('addProductForm');
    if (!form || !form.checkValidity()) {
        showError('modal-error', 'Por favor, preencha todos os campos obrigatórios corretamente.');
        return;
    }

    const productData = {
        id: document.getElementById('productId').value || `prod_${Date.now()}`,
        productName: document.getElementById('productName').value.trim(),
        manufacturer: document.getElementById('manufacturer').value.trim(),
        batch: document.getElementById('batch').value.trim(),
        quantity: parseFloat(document.getElementById('quantity').value) || 0,
        unit: document.getElementById('unit').value,
        packageType: document.getElementById('packageType').value,
        totalPackages: parseInt(document.getElementById('totalPackages').value) || 1,
        minStock: parseFloat(document.getElementById('minStock').value) || 0,
        invoice: document.getElementById('invoice').value.trim() || 'N/A',
        expirationDate: document.getElementById('validade').value || null,
        locationId: document.getElementById('locationId').value,
        status: document.getElementById('status').value,
        location: state.locationsCache.find(loc => loc.id === document.getElementById('locationId').value)?.room || '',
        parentProductId: generateParentProductId(document.getElementById('productName').value.trim())
    };

    const stockCheck = checkGlobalStock(productData.productName, productData.quantity);
    if (stockCheck && stockCheck.isLow) {
        if (!confirm(`O estoque total de ${productData.productName} será ${stockCheck.totalStock.toFixed(2)}, abaixo do mínimo global de ${stockCheck.globalMinStock.toFixed(2)}. Continuar?`)) {
            return;
        }
    }

    showLoading();
    try {
        const method = productData.id ? 'PUT' : 'POST';
        const url = productData.id ? `${config.apiUrl}/stock/${productData.id}?index=${document.getElementById('rowIndex').value}` : `${config.apiUrl}/stock`;
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro HTTP ${response.status}`);
        }

        // Atualizar estoque mínimo global
        await fetch(`${config.apiUrl}/globalMinStock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productName: productData.productName, minStock: productData.minStock })
        });

        await loadAndDisplayStock();
        closeModal('productModal');
        showError('form-error', `Produto ${productData.id ? 'atualizado' : 'adicionado'} com sucesso!`, true);
    } catch (error) {
        showError('modal-error', error.message);
    } finally {
        hideLoading();
    }
}

async function editProduct(id, index) {
    const product = state.products.find(p => p.id === id);
    if (!product) {
        showError('form-error', 'Produto não encontrado!');
        return;
    }

    const modalTitle = document.getElementById('modalTitle');
    const productIdInput = document.getElementById('productId');
    const productNameInput = document.getElementById('productName');
    const manufacturerInput = document.getElementById('manufacturer');
    const batchInput = document.getElementById('batch');
    const unitInput = document.getElementById('unit');
    const packageTypeInput = document.getElementById('packageType');
    const totalPackagesInput = document.getElementById('totalPackages');
    const minStockInput = document.getElementById('minStock');
    const invoiceInput = document.getElementById('invoice');
    const validadeInput = document.getElementById('validade');
    const locationIdInput = document.getElementById('locationId');
    const statusInput = document.getElementById('status');
    const rowIndexInput = document.getElementById('rowIndex');
    const modalError = document.getElementById('modal-error');
    const productModal = document.getElementById('productModal');

    if (modalTitle) modalTitle.textContent = 'Editar Produto';
    if (productIdInput) productIdInput.value = id;
    if (productNameInput) productNameInput.value = product.productName;
    if (manufacturerInput) manufacturerInput.value = product.manufacturer;
    if (batchInput) batchInput.value = product.batch;
    if (unitInput) unitInput.value = product.unit;
    if (packageTypeInput) packageTypeInput.value = product.packageType;
    if (totalPackagesInput) totalPackagesInput.value = product.totalPackages;
    if (minStockInput) minStockInput.value = product.minStock;
    if (invoiceInput) invoiceInput.value = product.invoice;
    if (validadeInput) validadeInput.value = product.expirationDate ? product.expirationDate.split('T')[0] : '';
    if (locationIdInput) locationIdInput.value = product.locationId;
    if (statusInput) statusInput.value = product.status;
    if (rowIndexInput) rowIndexInput.value = index;
    if (modalError) modalError.style.display = 'none';

    await updateLocationSelect();

    const stockCheck = checkGlobalStock(product.productName);
    const globalMinStockDisplay = document.getElementById('global-min-stock-display');
    if (globalMinStockDisplay) {
        globalMinStockDisplay.textContent = stockCheck ? stockCheck.globalMinStock.toFixed(2) : '0.00';
    }

    if (productModal) productModal.style.display = 'block';
}

async function useProduct(id, index) {
    const quantityInput = document.getElementById(`quantity-use-${id}`);
    const quantityUsed = parseFloat(quantityInput?.value || '0');

    if (isNaN(quantityUsed) || quantityUsed <= 0) {
        showError('form-error', 'Por favor, insira uma quantidade válida maior que zero!');
        quantityInput?.focus();
        return;
    }

    const product = state.products.find(p => p.id === id);
    if (!product) {
        showError('form-error', 'Produto não encontrado!');
        return;
    }

    if (product.quantity < quantityUsed) {
        showError('form-error', `Quantidade insuficiente! Disponível: ${product.quantity}`);
        quantityInput?.focus();
        return;
    }

    showLoading();
    try {
        const response = await fetch(`${config.apiUrl}/stock/${id}/use?index=${index}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantityUsed: quantityUsed.toFixed(2) })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro ao usar produto`);
        }

        await loadAndDisplayStock();
        if (quantityInput) quantityInput.value = '';
        showError('form-error', `Produto usado com sucesso!`, true);
    } catch (error) {
        showError('form-error', `Erro: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function finishProduct(id, index) {
    if (!confirm('Tem certeza que deseja esgotar esta embalagem?')) return;

    showLoading();
    try {
        const product = state.products.find(p => p.id === id);
        const response = await fetch(`${config.apiUrl}/stock/${id}?index=${index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...product, status: 'esgotado', quantity: 0 })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro ao esgotar produto`);
        }

        await loadAndDisplayStock();
        showError('form-error', 'Embalagem esgotada com sucesso!', true);
    } catch (error) {
        showError('form-error', `Erro: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function deleteProduct(id, index) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    showLoading();
    try {
        const response = await fetch(`${config.apiUrl}/stock/${id}?index=${index}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro HTTP ${response.status}`);
        }

        await loadAndDisplayStock();
        showError('form-error', 'Produto excluído com sucesso!', true);
    } catch (error) {
        showError('form-error', `Erro: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function showError(elementId, message, isSuccess = false) {
    const errorDiv = document.getElementById(elementId);
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.className = `message ${isSuccess ? 'success' : 'error'}`;
        errorDiv.style.display = 'block';
        setTimeout(() => errorDiv.style.display = 'none', 5000);
    }
}

function showLoading() {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) loadingElement.style.display = 'block';
}

function hideLoading() {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) loadingElement.style.display = 'none';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function generateParentProductId(productName) {
    const cleanName = productName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `prod_${cleanName}_${Math.random().toString(36).substring(2, 8)}`;
}

document.addEventListener('DOMContentLoaded', () => {
    loadAndDisplayStock();
    updateLocationSelect('locationFilter');
});
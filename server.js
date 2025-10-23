const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { google } = require('googleapis');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Função para gerar IDs sequenciais
async function generateSequentialId(sheetName, prefix) {
    try {
        const range = sheetName === 'Estoque' ? 'Estoque!A2:A' : 'Localidades!A2:A';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range
        });
        const values = response.data.values || [];
        const count = values.length + 1; // Próximo número na sequência
        if (sheetName === 'Estoque') {
            return `${prefix}${count.toString().padStart(6, '0')}`; // Ex: prod_000001
        } else {
            return `${prefix}${count.toString().padStart(3, '0')}`; // Ex: local_001
        }
    } catch (error) {
        console.error(`[API] Erro ao gerar ID sequencial para ${sheetName}:`, error);
        throw error;
    }
}

// Middleware
app.use(cors());
app.use(express.json());

// Configurar autenticação com Google usando SERVICE_ACCOUNT_KEY
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.SERVICE_ACCOUNT_KEY),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

// Rota de saúde
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor está funcionando' });
});

// Função para normalizar datas
function normalizeDate(dateStr) {
    if (!dateStr) return '';
    const regex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
    const match = dateStr.match(regex);
    if (match) {
        const [_, day, month, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return isNaN(new Date(dateStr)) ? '' : dateStr;
}

// Rota para carregar dados de estoque
app.get('/api/stock', async (req, res) => {
    try {
        console.log('[API] Carregando dados de estoque...');
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Estoque!A2:M'
        });

        const values = response.data.values || [];
        const stockData = values.map((row, index) => {
    const quantityStr = row[4] ? row[4].toString().replace(',', '.') : '0';
    const minimumStockStr = row[8] ? row[8].toString().replace(',', '.') : '0';
    const location = row[11] || 'loc_default';
    return {
        id: row[0] || `prod_${(index + 1).toString().padStart(6, '0')}`, // Alterado para sequencial
        product: row[1] || 'Produto Desconhecido',
        manufacturer: row[2] || '',
        batch: row[3] || `Lote_${index + 2}`,
        quantity: parseFloat(quantityStr) || 0,
        unit: row[5] || 'un',
        packaging: row[6] || '', // Usado para tipo de embalagem
        packagingNumber: parseInt(row[7]) || 1,
        minimumStock: parseFloat(minimumStockStr) || 0,
        invoice: row[9] || '',
        expirationDate: normalizeDate(row[10]),
        location: location,
        status: row[12] || 'disponivel'
    };
		}).filter(item => item.product && item.batch);

        console.log(`[API] Estoque carregado: ${stockData.length} itens`);
        res.json({ success: true, data: stockData });
    } catch (error) {
        console.error('[API] Erro ao carregar estoque:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para carregar dados de localidades
app.get('/api/locations', async (req, res) => {
    try {
        console.log('[API] Carregando dados de localidades...');
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Localidades!A2:C'
        });

        const values = response.data.values || [];
        const locationsData = values.map((row, index) => ({
			id: row[0] || `local_${(index + 1).toString().padStart(3, '0')}`, // Alterado para sequencial
			room: row[1] || 'Sala Desconhecida',
			cabinet: row[2] || ''
			}));

        console.log(`[API] Localidades carregadas: ${locationsData.length} itens`);
        res.json({ success: true, data: locationsData });
    } catch (error) {
        console.error('[API] Erro ao carregar localidades:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para carregar dados de logs
app.get('/api/logs', async (req, res) => {
    try {
        console.log('[API] Carregando dados de logs...');
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Logs!A2:D'
        });

        const values = response.data.values || [];
        const logsData = values.map(row => ({
            id: row[0] || Date.now().toString(),
            action: row[1] || '',
            details: row[2] || '',
            timestamp: row[3] || new Date().toISOString()
        })).reverse();

        console.log(`[API] Logs carregados: ${logsData.length} itens`);
        res.json({ success: true, data: logsData });
    } catch (error) {
        console.error('[API] Erro ao carregar logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para adicionar produto
app.post('/api/stock', async (req, res) => {
    try {
        const product = req.body;
        if (!product.product || !product.batch || !product.quantity || !product.unit || !product.location || !product.status) {
            console.warn('[API] Campos obrigatórios ausentes:', product);
            return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes' });
        }
        // Gerar ID sequencial
        product.id = product.id || await generateSequentialId('Estoque', 'prod_');
        const values = [
            product.id,
            product.product,
            product.manufacturer || '',
            product.batch,
            product.quantity.toString(),
            product.unit,
            product.packaging,
            product.packagingNumber.toString(),
            product.minimumStock.toString(),
            product.invoice || '',
            product.expirationDate || '',
            product.location,
            product.status
        ];

        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Estoque!A:M',
            valueInputOption: 'RAW',
            resource: { values: [values] }
        });

        // Registrar log
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Logs!A:D',
            valueInputOption: 'RAW',
            resource: {
                values: [[
                    `log_${Date.now()}`,
                    'Adicionar Produto',
                    `${product.product} (Lote: ${product.batch})`,
                    new Date().toISOString()
                ]]
            }
        });

        console.log(`[API] Produto adicionado: ${product.product} (Lote: ${product.batch})`);
        res.json({ success: true, data: product });
    } catch (error) {
        console.error('[API] Erro ao adicionar produto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para atualizar produto
app.put('/api/stock/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const index = parseInt(req.query.index);
        const product = req.body;
        console.log(`[API] Atualizando produto ID: ${id}, Index: ${index}, Dados:`, product);
        if (!product.product || !product.batch || product.quantity === undefined || product.quantity === null || !product.unit || !product.location || !product.status || !product.packaging) {
            console.warn('[API] Campos obrigatórios ausentes:', product);
            return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes' });
        }
        if (isNaN(product.quantity) || product.quantity < 0) {
            console.warn('[API] Quantidade inválida:', product.quantity);
            return res.status(400).json({ success: false, error: 'Quantidade inválida' });
        }
        if (product.expirationDate && isNaN(new Date(product.expirationDate))) {
            console.warn('[API] Data de validade inválida:', product.expirationDate);
            return res.status(400).json({ success: false, error: 'Data de validade inválida' });
        }
        if (product.packagingNumber && (isNaN(product.packagingNumber) || product.packagingNumber < 1)) {
            console.warn('[API] Número de embalagens inválido:', product.packagingNumber);
            return res.status(400).json({ success: false, error: 'Número de embalagens inválido' });
        }
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Estoque!A2:M' // Inclui coluna N para packageType
        });
        const values = response.data.values || [];
        if (isNaN(index) || index < 0 || index >= values.length) {
            console.warn('[API] Índice inválido:', index);
            return res.status(400).json({ success: false, error: 'Índice inválido' });
        }
        values[index] = [
            product.id,
            product.product,
            product.manufacturer || '',
            product.batch,
            product.quantity.toString(),
            product.unit,
            product.packaging || '',
            product.packagingNumber.toString(),
            product.minimumStock.toString(),
            product.invoice || '',
            product.expirationDate || '',
            product.location || 'loc_default',
            product.status
        ];
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Estoque!A${index + 2}:N${index + 2}`, // Corrigido para incluir coluna N
            valueInputOption: 'RAW',
            resource: { values: [values[index]] }
        });
        // Registrar log para ação de esgotar (quantidade = 0)
        if (product.quantity === 0) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Logs!A:D',
                valueInputOption: 'RAW',
                resource: {
                    values: [[
                        `log_${Date.now()}`,
                        'Esgotar Produto',
                        `${product.product} (Lote: ${product.batch})`,
                        new Date().toISOString()
                    ]]
                }
            });
        }
        console.log(`[API] Produto atualizado com sucesso: ${id}`);
        res.json({ success: true, data: product });
    } catch (error) {
        console.error('[API] Erro ao atualizar produto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para excluir produto
app.delete('/api/stock/:id', async (req, res) => {
    try {
        const index = parseInt(req.query.index);
        if (isNaN(index)) {
            console.warn('[API] Índice da linha inválido:', index);
            return res.status(400).json({ success: false, error: 'Índice da linha inválido' });
        }

        const stockResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `Estoque!A${index + 2}:M${index + 2}`
        });
        const product = stockResponse.data.values ? {
            product: stockResponse.data.values[0][1] || '',
            batch: stockResponse.data.values[0][3] || ''
        } : { product: 'Desconhecido', batch: 'Desconhecido' };

        await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: `Estoque!A${index + 2}:M${index + 2}`
        });

        // Registrar log
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Logs!A:D',
            valueInputOption: 'RAW',
            resource: {
                values: [[
                    `log_${Date.now()}`,
                    'Excluir Produto',
                    `${product.product} (Lote: ${product.batch})`,
                    new Date().toISOString()
                ]]
            }
        });

        console.log(`[API] Produto excluído: ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Erro ao excluir produto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para adicionar log
app.post('/api/logs', async (req, res) => {
    try {
        const log = req.body;
        if (!log.action || !log.details || !log.timestamp) {
            console.warn('[API] Campos obrigatórios ausentes no log:', log);
            return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes' });
        }
        const values = [
            log.id || `log_${Date.now()}`,
            log.action,
            log.details,
            log.timestamp
        ];
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Logs!A:D',
            valueInputOption: 'RAW',
            resource: { values: [values] }
        });
        console.log(`[API] Log adicionado: ${log.action} - ${log.details}`);
        res.json({ success: true, data: log });
    } catch (error) {
        console.error('[API] Erro ao adicionar log:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para adicionar localidade
app.post('/api/locations', async (req, res) => {
    try {
        const location = req.body;
        if (!location.room) {
            console.warn('[API] Campo sala é obrigatório:', location);
            return res.status(400).json({ success: false, error: 'Campo sala é obrigatório' });
        }
        // Gerar ID sequencial
        location.id = location.id || await generateSequentialId('Localidades', 'local_');
        const values = [location.id, location.room, location.cabinet || ''];

        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Localidades!A:C',
            valueInputOption: 'RAW',
            resource: { values: [values] }
        });

        // Registrar log
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Logs!A:D',
            valueInputOption: 'RAW',
            resource: {
                values: [[
                    `log_${Date.now()}`,
                    'Adicionar Localidade',
                    `${location.room} - ${location.cabinet || 'Sem armário'}`,
                    new Date().toISOString()
                ]]
            }
        });

        console.log(`[API] Localidade adicionada: ${location.room} - ${location.cabinet}`);
        res.json({ success: true, data: location });
    } catch (error) {
        console.error('[API] Erro ao adicionar localidade:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para atualizar localidade
app.put('/api/locations/:id', async (req, res) => {
    try {
        const location = req.body;
        const index = parseInt(req.query.index);
        if (isNaN(index)) {
            console.warn('[API] Índice da linha inválido:', index);
            return res.status(400).json({ success: false, error: 'Índice da linha inválido' });
        }
        if (!location.room) {
            console.warn('[API] Campo sala é obrigatório:', location);
            return res.status(400).json({ success: false, error: 'Campo sala é obrigatório' });
        }

        const values = [location.id, location.room, location.cabinet || ''];

        const response = await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Localidades!A${index + 2}:C${index + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [values] }
        });

        // Registrar log
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Logs!A:D',
            valueInputOption: 'RAW',
            resource: {
                values: [[
                    `log_${Date.now()}`,
                    'Editar Localidade',
                    `${location.room} - ${location.cabinet || 'Sem armário'}`,
                    new Date().toISOString()
                ]]
            }
        });

        console.log(`[API] Localidade atualizada: ${location.room} - ${location.cabinet}`);
        res.json({ success: true, data: location });
    } catch (error) {
        console.error('[API] Erro ao atualizar localidade:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para excluir localidade
app.delete('/api/locations/:id', async (req, res) => {
    try {
        const index = parseInt(req.query.index);
        if (isNaN(index)) {
            console.warn('[API] Índice da linha inválido:', index);
            return res.status(400).json({ success: false, error: 'Índice da linha inválido' });
        }

        const locationResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `Localidades!A${index + 2}:C${index + 2}`
        });
        const location = locationResponse.data.values ? {
            room: locationResponse.data.values[0][1] || '',
            cabinet: locationResponse.data.values[0][2] || ''
        } : { room: 'Desconhecida', cabinet: 'Sem armário' };

        await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: `Localidades!A${index + 2}:C${index + 2}`
        });

        // Registrar log
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Logs!A:D',
            valueInputOption: 'RAW',
            resource: {
                values: [[
                    `log_${Date.now()}`,
                    'Excluir Localidade',
                    `${location.room} - ${location.cabinet || 'Sem armário'}`,
                    new Date().toISOString()
                ]]
            }
        });

        console.log(`[API] Localidade excluída: ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Erro ao excluir localidade:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`[Server] Backend rodando em http://localhost:${PORT}`);
    console.log(`[Server] Spreadsheet ID: ${SPREADSHEET_ID}`);
});
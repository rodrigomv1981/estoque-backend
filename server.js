const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const Joi = require('joi');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Middleware
app.use(cors());
app.use(express.json());

// Configurar autenticação com Google
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.SERVICE_ACCOUNT_KEY),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

// Esquema de validação para produtos
const productSchema = Joi.object({
    productName: Joi.string().required().messages({ 'string.empty': 'Nome do produto é obrigatório' }),
    manufacturer: Joi.string().allow('').optional(),
    batch: Joi.string().required().messages({ 'string.empty': 'Lote é obrigatório' }),
    quantity: Joi.number().min(0).required().messages({ 'number.min': 'Quantidade inválida' }),
    unit: Joi.string().valid('L', 'kg', 'un').required().messages({ 'any.only': 'Unidade inválida' }),
    packageType: Joi.string().valid('Frasco metal', 'Frasco vidro âmbar', 'Frasco vidro', 'Frasco plástico').required().messages({ 'any.only': 'Tipo de embalagem inválido' }),
    totalPackages: Joi.number().integer().min(1).default(1),
    minStock: Joi.number().min(0).default(0).messages({ 'number.min': 'Estoque mínimo inválido' }),
    invoice: Joi.string().allow('').default('N/A'),
    expirationDate: Joi.string().allow(null).optional(),
    locationId: Joi.string().required().messages({ 'string.empty': 'Localização é obrigatória' }),
    status: Joi.string().valid('disponivel', 'em-uso', 'esgotado').required().messages({ 'any.only': 'Status inválido' }),
    parentProductId: Joi.string().optional(),
    location: Joi.string().optional()
});

// Esquema de validação para localidades
const locationSchema = Joi.object({
    room: Joi.string().required().messages({ 'string.empty': 'Sala é obrigatória' }),
    cabinet: Joi.string().allow('').optional(),
    id: Joi.string().optional()
});

// Função para gerar parentProductId
function generateParentProductId(productName) {
    const cleanName = productName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `prod_${cleanName}_${Math.random().toString(36).substring(2, 8)}`;
}

// Rota de saúde
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor está funcionando' });
});

// Rota para carregar dados de estoque
app.get('/api/stock', async (req, res) => {
    try {
        console.log('[API] Carregando dados de estoque...');
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Estoque!A2:O'
        });

        const values = response.data.values || [];
        const stockData = values.map((row, index) => {
            const item = {
                id: row[0] || `temp_${Date.now()}_${index}`,
                productName: row[1] || '',
                manufacturer: row[2] || '',
                batch: row[3] || '',
                quantity: parseFloat(row[4]) || 0,
                unit: row[5] || 'un',
                packageType: row[6] || 'Frasco plástico',
                totalPackages: parseInt(row[7]) || 1,
                minStock: parseFloat(row[8]) || 0,
                invoice: row[9] || 'N/A',
                expirationDate: row[10] || null,
                location: row[11] || '',
                status: row[12] || 'disponivel',
                locationId: row[13] || '',
                parentProductId: row[14] || generateParentProductId(row[1] || '')
            };

            if (!item.productName || !item.batch) {
                console.warn(`[API] Item inválido na linha ${index + 2}: productName ou batch ausente`);
            }
            if (item.expirationDate && isNaN(new Date(item.expirationDate))) {
                console.warn(`[API] Data de validade inválida na linha ${index + 2}: ${item.expirationDate}`);
                item.expirationDate = null;
            }

            return item;
        }).filter(item => item.productName && item.batch);

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
            id: row[0] || `temp_${Date.now()}_${index}`,
            room: row[1] || '',
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

// Rota para carregar estoque mínimo global
app.get('/api/globalMinStock', async (req, res) => {
    try {
        console.log('[API] Carregando estoque mínimo global...');
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'GlobalMinStock!A2:B'
        });

        const values = response.data.values || [];
        const globalMinStockData = values.map(row => ({
            productName: row[0] || '',
            minStock: parseFloat(row[1]) || 0
        }));

        console.log(`[API] Estoque mínimo global carregado: ${globalMinStockData.length} itens`);
        res.json({ success: true, data: globalMinStockData });
    } catch (error) {
        console.error('[API] Erro ao carregar estoque mínimo global:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para atualizar estoque mínimo global
app.post('/api/globalMinStock', async (req, res) => {
    try {
        const { productName, minStock } = req.body;
        const schema = Joi.object({
            productName: Joi.string().required().messages({ 'string.empty': 'Nome do produto é obrigatório' }),
            minStock: Joi.number().min(0).required().messages({ 'number.min': 'Estoque mínimo inválido' })
        });

        await schema.validateAsync({ productName, minStock });

        // Verificar se já existe
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'GlobalMinStock!A2:B'
        });

        const values = response.data.values || [];
        const index = values.findIndex(row => row[0] === productName);

        if (index >= 0) {
            // Atualizar
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `GlobalMinStock!A${index + 2}:B${index + 2}`,
                valueInputOption: 'RAW',
                resource: { values: [[productName, minStock]] }
            });
        } else {
            // Adicionar
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'GlobalMinStock!A:B',
                valueInputOption: 'RAW',
                resource: { values: [[productName, minStock]] }
            });
        }

        console.log(`[API] Estoque mínimo global atualizado: ${productName} - ${minStock}`);
        res.json({ success: true, data: { productName, minStock } });
    } catch (error) {
        console.error('[API] Erro ao atualizar estoque mínimo global:', error);
        res.status(error.isJoi ? 400 : 500).json({ success: false, error: error.message });
    }
});

// Rota para adicionar produto
app.post('/api/stock', async (req, res) => {
    try {
        const product = req.body;
        const validatedProduct = await productSchema.validateAsync(product, { stripUnknown: true });

        const location = (await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Localidades!A2:C'
        })).data.values?.find(row => row[0] === validatedProduct.locationId);

        if (!location) {
            return res.status(400).json({ success: false, error: 'Localização não encontrada' });
        }

        const parentProductId = validatedProduct.parentProductId || generateParentProductId(validatedProduct.productName);
        const values = [
            validatedProduct.id || `prod_${Date.now()}`,
            validatedProduct.productName,
            validatedProduct.manufacturer,
            validatedProduct.batch,
            validatedProduct.quantity,
            validatedProduct.unit,
            validatedProduct.packageType,
            validatedProduct.totalPackages,
            validatedProduct.minStock,
            validatedProduct.invoice,
            validatedProduct.expirationDate,
            validatedProduct.location,
            validatedProduct.status,
            validatedProduct.locationId,
            parentProductId
        ];

        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Estoque!A:O',
            valueInputOption: 'RAW',
            resource: { values: [values] }
        });

        // Atualizar estoque mínimo global
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'GlobalMinStock!A:B',
            valueInputOption: 'RAW',
            resource: { values: [[validatedProduct.productName, validatedProduct.minStock]] }
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
                    `${validatedProduct.productName} (Lote: ${validatedProduct.batch})`,
                    new Date().toISOString()
                ]]
            }
        });

        console.log(`[API] Produto adicionado: ${validatedProduct.productName} (Lote: ${validatedProduct.batch})`);
        res.json({ success: true, data: { ...validatedProduct, id: values[0], parentProductId } });
    } catch (error) {
        console.error('[API] Erro ao adicionar produto:', error);
        res.status(error.isJoi ? 400 : 500).json({ success: false, error: error.message });
    }
});

// Rota para atualizar produto
app.put('/api/stock/:id', async (req, res) => {
    try {
        const index = parseInt(req.query.index);
        if (isNaN(index)) {
            return res.status(400).json({ success: false, error: 'Índice da linha inválido' });
        }

        const product = req.body;
        const validatedProduct = await productSchema.validateAsync(product, { stripUnknown: true });

        const location = (await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Localidades!A2:C'
        })).data.values?.find(row => row[0] === validatedProduct.locationId);

        if (!location) {
            return res.status(400).json({ success: false, error: 'Localização não encontrada' });
        }

        const parentProductId = validatedProduct.parentProductId || generateParentProductId(validatedProduct.productName);
        const values = [
            validatedProduct.id,
            validatedProduct.productName,
            validatedProduct.manufacturer,
            validatedProduct.batch,
            validatedProduct.quantity,
            validatedProduct.unit,
            validatedProduct.packageType,
            validatedProduct.totalPackages,
            validatedProduct.minStock,
            validatedProduct.invoice,
            validatedProduct.expirationDate,
            validatedProduct.location,
            validatedProduct.status,
            validatedProduct.locationId,
            parentProductId
        ];

        const response = await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Estoque!A${index + 2}:O${index + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [values] }
        });

        // Atualizar estoque mínimo global
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'GlobalMinStock!A:B',
            valueInputOption: 'RAW',
            resource: { values: [[validatedProduct.productName, validatedProduct.minStock]] }
        });

        // Registrar log
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Logs!A:D',
            valueInputOption: 'RAW',
            resource: {
                values: [[
                    `log_${Date.now()}`,
                    validatedProduct.status === 'esgotado' ? 'Esgotar Produto' : 'Editar Produto',
                    `${validatedProduct.productName} (Lote: ${validatedProduct.batch})`,
                    new Date().toISOString()
                ]]
            }
        });

        console.log(`[API] Produto atualizado: ${validatedProduct.productName} (Lote: ${validatedProduct.batch})`);
        res.json({ success: true, data: { ...validatedProduct, id: validatedProduct.id, parentProductId } });
    } catch (error) {
        console.error('[API] Erro ao atualizar produto:', error);
        res.status(error.isJoi ? 400 : 500).json({ success: false, error: error.message });
    }
});

// Rota para usar produto
app.patch('/api/stock/:id/use', async (req, res) => {
    try {
        const id = req.params.id;
        const index = parseInt(req.query.index);
        const { quantityUsed } = req.body;

        if (isNaN(index)) {
            return res.status(400).json({ success: false, error: 'Índice da linha inválido' });
        }
        if (!quantityUsed || isNaN(quantityUsed) || quantityUsed <= 0) {
            return res.status(400).json({ success: false, error: 'Quantidade inválida' });
        }

        const stockResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `Estoque!A${index + 2}:O${index + 2}`
        });

        if (!stockResponse.data.values || stockResponse.data.values.length === 0) {
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }

        const row = stockResponse.data.values[0];
        const product = {
            id: row[0],
            productName: row[1],
            manufacturer: row[2],
            batch: row[3],
            quantity: parseFloat(row[4]) || 0,
            unit: row[5],
            packageType: row[6],
            totalPackages: parseInt(row[7]) || 1,
            minStock: parseFloat(row[8]) || 0,
            invoice: row[9],
            expirationDate: row[10],
            location: row[11],
            status: row[12],
            locationId: row[13],
            parentProductId: row[14]
        };

        if (product.quantity < quantityUsed) {
            return res.status(400).json({ success: false, error: `Quantidade insuficiente! Disponível: ${product.quantity}` });
        }

        product.quantity -= quantityUsed;
        if (product.quantity <= 0) {
            product.quantity = 0;
            product.status = 'esgotado';
        }

        const values = [
            product.id,
            product.productName,
            product.manufacturer,
            product.batch,
            product.quantity,
            product.unit,
            product.packageType,
            product.totalPackages,
            product.minStock,
            product.invoice,
            product.expirationDate,
            product.location,
            product.status,
            product.locationId,
            product.parentProductId
        ];

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Estoque!A${index + 2}:O${index + 2}`,
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
                    'Usar Produto',
                    `${product.productName} (Lote: ${product.batch}, Quantidade: ${quantityUsed})`,
                    new Date().toISOString()
                ]]
            }
        });

        console.log(`[API] Produto usado: ${product.productName} (Lote: ${product.batch}, Quantidade: ${quantityUsed})`);
        res.json({ success: true, data: product });
    } catch (error) {
        console.error('[API] Erro ao usar produto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para excluir produto
app.delete('/api/stock/:id', async (req, res) => {
    try {
        const index = parseInt(req.query.index);
        if (isNaN(index)) {
            return res.status(400).json({ success: false, error: 'Índice da linha inválido' });
        }

        const stockResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `Estoque!A${index + 2}:O${index + 2}`
        });
        const product = stockResponse.data.values ? {
            productName: stockResponse.data.values[0][1] || '',
            batch: stockResponse.data.values[0][3] || ''
        } : { productName: 'Desconhecido', batch: 'Desconhecido' };

        await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: `Estoque!A${index + 2}:O${index + 2}`
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
                    `${product.productName} (Lote: ${product.batch})`,
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

// Rota para adicionar localidade
app.post('/api/locations', async (req, res) => {
    try {
        const location = req.body;
        const validatedLocation = await locationSchema.validateAsync(location);
        validatedLocation.id = validatedLocation.id || `loc_${Date.now()}`;

        const values = [validatedLocation.id, validatedLocation.room, validatedLocation.cabinet];

        await sheets.spreadsheets.values.append({
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
                    `${validatedLocation.room} - ${validatedLocation.cabinet || 'Sem armário'}`,
                    new Date().toISOString()
                ]]
            }
        });

        console.log(`[API] Localidade adicionada: ${validatedLocation.room} - ${validatedLocation.cabinet}`);
        res.json({ success: true, data: validatedLocation });
    } catch (error) {
        console.error('[API] Erro ao adicionar localidade:', error);
        res.status(error.isJoi ? 400 : 500).json({ success: false, error: error.message });
    }
});

// Rota para atualizar localidade
app.put('/api/locations/:id', async (req, res) => {
    try {
        const index = parseInt(req.query.index);
        if (isNaN(index)) {
            return res.status(400).json({ success: false, error: 'Índice da linha inválido' });
        }

        const location = req.body;
        const validatedLocation = await locationSchema.validateAsync(location);
        const values = [validatedLocation.id, validatedLocation.room, validatedLocation.cabinet];

        await sheets.spreadsheets.values.update({
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
                    `${validatedLocation.room} - ${validatedLocation.cabinet || 'Sem armário'}`,
                    new Date().toISOString()
                ]]
            }
        });

        console.log(`[API] Localidade atualizada: ${validatedLocation.room} - ${validatedLocation.cabinet}`);
        res.json({ success: true, data: validatedLocation });
    } catch (error) {
        console.error('[API] Erro ao atualizar localidade:', error);
        res.status(error.isJoi ? 400 : 500).json({ success: false, error: error.message });
    }
});

// Rota para excluir localidade
app.delete('/api/locations/:id', async (req, res) => {
    try {
        const index = parseInt(req.query.index);
        if (isNaN(index)) {
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
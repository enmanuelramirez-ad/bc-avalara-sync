const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const config = require('../config');
const { createCsvWriterUtil, ensureOutputDir, log, sleep } = require('../utils');

async function readCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

async function getExistingCustomFields(bcClient, productId) {
  try {
    const response = await bcClient.get(`/v3/catalog/products/${productId}/custom-fields`);
    return response.data.data || [];
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return [];
    }
    throw error;
  }
}

async function addCustomField(bcClient, productId, fieldName, fieldValue) {
  try {
    const response = await bcClient.post(`/v3/catalog/products/${productId}/custom-fields`, {
      name: fieldName,
      value: fieldValue
    });
    return response.data.data;
  } catch (error) {
    throw error;
  }
}

async function updateProducts() {
  const outputDir = ensureOutputDir();
  const productsToUpdateFile = `${outputDir}/products-to-update.csv`;
  const logFile = `${outputDir}/product-sync-log.csv`;
  
  log('Starting product update process...');
  
  // Check if input file exists
  if (!fs.existsSync(productsToUpdateFile)) {
    throw new Error(`Products to update file not found: ${productsToUpdateFile}. Please run reconcile-products.js first.`);
  }
  
  try {
    // Read products to update
    log('Reading products to update...');
    const productsToUpdate = await readCSVFile(productsToUpdateFile);
    
    // Filter products that need updating
    const productsNeedingUpdate = productsToUpdate.filter(product => 
      product.exists_in_avalara === 'no' || product.is_missing_data === 'yes'
    );
    
    log(`Found ${productsNeedingUpdate.length} products that need updating`);
    
    if (productsNeedingUpdate.length === 0) {
      log('No products need updating. All products are already in sync with Avalara.');
      return { updated: 0, errors: 0, skipped: 0 };
    }
    
    // Create BigCommerce client
    const bcClient = axios.create({
      baseURL: config.bigcommerce.baseUrl,
      headers: config.bigcommerce.headers,
      timeout: 30000
    });
    
    // Create CSV writer for sync log
    const csvWriter = createCsvWriterUtil(logFile, [
      'product_id',
      'sku',
      'exists_in_avalara',
      'is_missing_data',
      'status',
      'timestamp',
      'error_message',
      'custom_field_added'
    ]);
    
    const syncLog = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    // Process each product
    for (let i = 0; i < productsNeedingUpdate.length; i++) {
      const product = productsNeedingUpdate[i];
      const timestamp = new Date().toISOString();
      
      log(`Processing product ${i + 1}/${productsNeedingUpdate.length}: ${product.sku} (${product.name})`);
      
      try {
        // Check existing custom fields
        const existingFields = await getExistingCustomFields(bcClient, product.product_id);
        
        // Check if sync field already exists
        const existingSyncField = existingFields.find(field => 
          field.name === config.sync.fieldName
        );
        
        if (existingSyncField) {
          log(`  Skipping: ${config.sync.fieldName} custom field already exists`);
          syncLog.push({
            product_id: product.product_id,
            sku: product.sku,
            exists_in_avalara: product.exists_in_avalara,
            is_missing_data: product.is_missing_data,
            status: 'skipped',
            timestamp,
            error_message: 'Custom field already exists',
            custom_field_added: 'no'
          });
          skippedCount++;
          continue;
        }
        
        // Check if we're at the custom field limit (50 max)
        if (existingFields.length >= 50) {
          log(`  Error: Product has maximum number of custom fields (50)`);
          syncLog.push({
            product_id: product.product_id,
            sku: product.sku,
            exists_in_avalara: product.exists_in_avalara,
            is_missing_data: product.is_missing_data,
            status: 'error',
            timestamp,
            error_message: 'Maximum custom fields limit reached (50)',
            custom_field_added: 'no'
          });
          errorCount++;
          continue;
        }
        
        // Add custom field to trigger sync
        await addCustomField(bcClient, product.product_id, config.sync.fieldName, '1');
        
        log(`  Success: Added ${config.sync.fieldName} custom field`);
        
        syncLog.push({
          product_id: product.product_id,
          sku: product.sku,
          exists_in_avalara: product.exists_in_avalara,
          is_missing_data: product.is_missing_data,
          status: 'success',
          timestamp,
          error_message: '',
          custom_field_added: 'yes'
        });
        
        successCount++;
        
        // Rate limiting - wait 100ms between requests
        await sleep(100);
        
      } catch (error) {
        const errorMessage = error.response 
          ? `${error.response.status}: ${error.response.data?.message || error.message}`
          : error.message;
        
        log(`  Error: ${errorMessage}`, 'error');
        
        syncLog.push({
          product_id: product.product_id,
          sku: product.sku,
          exists_in_avalara: product.exists_in_avalara,
          is_missing_data: product.is_missing_data,
          status: 'error',
          timestamp,
          error_message: errorMessage,
          custom_field_added: 'no'
        });
        
        errorCount++;
      }
    }
    
    // Write sync log to CSV
    await csvWriter.writeRecords(syncLog);
    
    log(`Product update process completed`);
    log(`Results written to: ${logFile}`);
    log(`Summary:`);
    log(`  - Successfully updated: ${successCount}`);
    log(`  - Errors: ${errorCount}`);
    log(`  - Skipped: ${skippedCount}`);
    log(`  - Total processed: ${productsNeedingUpdate.length}`);
    
    // Create summary report
    const summaryFile = `${outputDir}/update-summary.txt`;
    const summary = `
Product Update Summary
=====================

Date: ${new Date().toISOString()}
Total Products Processed: ${productsNeedingUpdate.length}

Results:
- Successfully updated: ${successCount}
- Errors: ${errorCount}
- Skipped: ${skippedCount}

Error Breakdown:
${syncLog
  .filter(log => log.status === 'error')
  .reduce((acc, log) => {
    const errorType = log.error_message.split(':')[0] || 'Unknown';
    acc[errorType] = (acc[errorType] || 0) + 1;
    return acc;
  }, {})
  .map(([errorType, count]) => `  - ${errorType}: ${count} products`)
  .join('\n')}

Next Steps:
1. Monitor BigCommerce webhook logs for product/updated events
2. Verify products appear in Avalara within 24-48 hours
3. Run reconciliation again to confirm sync completion
4. Consider removing custom fields after successful sync

Note: Custom fields trigger the store/product/updated webhook which sends
product data to Avalara for registration and classification.
`;
    
    fs.writeFileSync(summaryFile, summary);
    log(`Summary report written to: ${summaryFile}`);
    
    return {
      total: productsNeedingUpdate.length,
      success: successCount,
      errors: errorCount,
      skipped: skippedCount
    };
    
  } catch (error) {
    log(`Error during product update: ${error.message}`, 'error');
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  updateProducts()
    .then((summary) => {
      log('Product update process completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      log(`Product update process failed: ${error.message}`, 'error');
      process.exit(1);
    });
}

module.exports = { updateProducts }; 
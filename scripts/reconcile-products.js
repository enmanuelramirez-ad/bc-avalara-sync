const fs = require('fs');
const csv = require('csv-parser');
const config = require('../config');
const { createCsvWriterUtil, ensureOutputDir, log } = require('../utils');

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

async function reconcileProducts() {
  const outputDir = ensureOutputDir();
  const avalaraFile = `${outputDir}/avalara-items.csv`;
  const bcFile = `${outputDir}/bc-products.csv`;
  const outputFile = `${outputDir}/products-to-update.csv`;
  
  log('Starting product reconciliation...');
  
  // Check if input files exist
  if (!fs.existsSync(avalaraFile)) {
    throw new Error(`Avalara items file not found: ${avalaraFile}. Please run fetch-avalara-items.js first.`);
  }
  
  if (!fs.existsSync(bcFile)) {
    throw new Error(`BigCommerce products file not found: ${bcFile}. Please run fetch-bc-products.js first.`);
  }
  
  try {
    // Read CSV files
    log('Reading Avalara items...');
    const avalaraItems = await readCSVFile(avalaraFile);
    
    log('Reading BigCommerce products...');
    const bcProducts = await readCSVFile(bcFile);
    
    log(`Loaded ${avalaraItems.length} Avalara items and ${bcProducts.length} BigCommerce products`);
    
    // Create lookup map for Avalara items by itemCode (SKU)
    const avalaraMap = new Map();
    avalaraItems.forEach(item => {
      if (item.itemCode && item.itemCode.trim()) {
        avalaraMap.set(item.itemCode.trim().toLowerCase(), item);
      }
    });
    
    log(`Created lookup map with ${avalaraMap.size} Avalara items`);
    
    // Create CSV writer for products to update
    const csvWriter = createCsvWriterUtil(outputFile, [
      'product_id',
      'sku',
      'name',
      'exists_in_avalara',
      'is_missing_data',
      'missing_fields',
      'avalara_item_group',
      'avalara_category',
      'reason'
    ]);
    
    const productsToUpdate = [];
    let missingInAvalara = 0;
    let missingData = 0;
    let complete = 0;
    
    // Compare each BigCommerce product with Avalara
    bcProducts.forEach(product => {
      const sku = product.sku.trim().toLowerCase();
      const avalaraItem = avalaraMap.get(sku);
      
      const result = {
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        exists_in_avalara: avalaraItem ? 'yes' : 'no',
        is_missing_data: 'no',
        missing_fields: '',
        avalara_item_group: avalaraItem ? avalaraItem.itemGroup : '',
        avalara_category: avalaraItem ? avalaraItem.category : '',
        reason: ''
      };
      
      if (!avalaraItem) {
        // Product not found in Avalara
        result.reason = 'Product not registered in Avalara';
        missingInAvalara++;
        productsToUpdate.push(result);
      } else {
        // Product exists in Avalara, check for missing data
        const missingFields = [];
        
        if (!avalaraItem.itemGroup || avalaraItem.itemGroup.trim() === '') {
          missingFields.push('itemGroup');
        }
        
        if (!avalaraItem.category || avalaraItem.category.trim() === '') {
          missingFields.push('category');
        }
        
        if (missingFields.length > 0) {
          result.is_missing_data = 'yes';
          result.missing_fields = missingFields.join(', ');
          result.reason = `Missing required fields: ${missingFields.join(', ')}`;
          missingData++;
          productsToUpdate.push(result);
        } else {
          complete++;
        }
      }
    });
    
    // Write results to CSV
    await csvWriter.writeRecords(productsToUpdate);
    
    log(`Reconciliation completed successfully`);
    log(`Results written to: ${outputFile}`);
    log(`Summary:`);
    log(`  - Products missing from Avalara: ${missingInAvalara}`);
    log(`  - Products with missing data: ${missingData}`);
    log(`  - Products complete in Avalara: ${complete}`);
    log(`  - Total products to update: ${productsToUpdate.length}`);
    
    // Create summary report
    const summaryFile = `${outputDir}/reconciliation-summary.txt`;
    const summary = `
Reconciliation Summary
=====================

Date: ${new Date().toISOString()}
Total BigCommerce Products: ${bcProducts.length}
Total Avalara Items: ${avalaraItems.length}

Results:
- Products missing from Avalara: ${missingInAvalara}
- Products with missing data: ${missingData}
- Products complete in Avalara: ${complete}
- Total products to update: ${productsToUpdate.length}

Missing Data Breakdown:
${Object.entries(productsToUpdate
  .filter(p => p.is_missing_data === 'yes')
  .reduce((acc, p) => {
    const fields = p.missing_fields.split(', ');
    fields.forEach(field => {
      acc[field] = (acc[field] || 0) + 1;
    });
    return acc;
  }, {}))
  .map(([field, count]) => `  - ${field}: ${count} products`)
  .join('\n')}

Next Steps:
1. Review products-to-update.csv for accuracy
2. Run update-products.js to trigger sync for flagged products
3. Monitor webhook logs for sync completion
`;
    
    fs.writeFileSync(summaryFile, summary);
    log(`Summary report written to: ${summaryFile}`);
    
    return {
      totalProducts: bcProducts.length,
      totalAvalaraItems: avalaraItems.length,
      missingInAvalara,
      missingData,
      complete,
      productsToUpdate: productsToUpdate.length
    };
    
  } catch (error) {
    log(`Error during reconciliation: ${error.message}`, 'error');
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  reconcileProducts()
    .then((summary) => {
      log('Product reconciliation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      log(`Product reconciliation failed: ${error.message}`, 'error');
      process.exit(1);
    });
}

module.exports = { reconcileProducts }; 
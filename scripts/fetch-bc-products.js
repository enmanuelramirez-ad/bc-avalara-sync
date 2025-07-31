const axios = require('axios');
const config = require('../config');
const { createCsvWriterUtil, ensureOutputDir, paginateBigCommerce, log, isValidSKU } = require('../utils');

async function fetchBigCommerceProducts() {
  const outputDir = ensureOutputDir();
  const outputFile = `${outputDir}/bc-products.csv`;
  
  log('Starting BigCommerce products fetch...');
  
  // Create CSV writer
  const csvWriter = createCsvWriterUtil(outputFile, [
    'id',
    'sku',
    'name'
  ]);
  
  try {
    // Create axios instance for BigCommerce
    const bcClient = axios.create({
      baseURL: config.bigcommerce.baseUrl,
      headers: config.bigcommerce.headers,
      timeout: 30000
    });
    
    // Fetch all active products from BigCommerce
    log('Fetching active products from BigCommerce...');
    const products = await paginateBigCommerce(
      bcClient,
      '/v3/catalog/products',
      {
        is_visible: true
      }
    );
    
    log(`Retrieved ${products.length} products from BigCommerce`);
    
    // Process and format products
    const processedProducts = products.map(product => ({
      id: product.id || '',
      sku: product.sku || '',
      name: product.name || ''
    }));
    
    // Filter out products without valid SKUs
    const validProducts = processedProducts.filter(product => isValidSKU(product.sku));
    const invalidProducts = processedProducts.filter(product => !isValidSKU(product.sku));
    
    if (invalidProducts.length > 0) {
      log(`Warning: ${invalidProducts.length} products found without valid SKUs`, 'error');
      invalidProducts.forEach(product => {
        log(`Product ID ${product.id} (${product.name}) has invalid SKU: "${product.sku}"`, 'error');
      });
    }
    
    // Write to CSV
    await csvWriter.writeRecords(validProducts);
    
    log(`Successfully wrote ${validProducts.length} valid products to ${outputFile}`);
    
    // Summary statistics
    log(`Summary: ${validProducts.length} valid products with SKUs`);
    
    return validProducts;
    
  } catch (error) {
    log(`Error fetching BigCommerce products: ${error.message}`, 'error');
    
    if (error.response) {
      log(`Response status: ${error.response.status}`, 'error');
      log(`Response data: ${JSON.stringify(error.response.data)}`, 'error');
    }
    
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  fetchBigCommerceProducts()
    .then(() => {
      log('BigCommerce products fetch completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      log(`BigCommerce products fetch failed: ${error.message}`, 'error');
      process.exit(1);
    });
}

module.exports = { fetchBigCommerceProducts }; 
const axios = require('axios');
const config = require('../config');
const { createCsvWriterUtil, ensureOutputDir, paginateAvalara, log, extractHSCode } = require('../utils');

async function fetchAvalaraItems() {
  const outputDir = ensureOutputDir();
  const outputFile = `${outputDir}/avalara-items.csv`;
  
  log('Starting Avalara items fetch...');
  
  // Create CSV writer
  const csvWriter = createCsvWriterUtil(outputFile, [
    'itemCode',
    'itemGroup',
    'category'
  ]);
  
  try {
    // Create axios instance for Avalara
    const avalaraClient = axios.create({
      baseURL: config.avalara.baseUrl,
      headers: config.avalara.headers,
      timeout: 30000
    });
    
    // Fetch all items from Avalara
    log('Fetching all items from Avalara...');
    const items = await paginateAvalara(
      avalaraClient,
      `/api/v2/companies/${config.avalara.companyId}/items`
    );
    
    log(`Retrieved ${items.length} items from Avalara`);
    
    // Process items
    log('Processing items...');
    const processedItems = items.map(item => ({
      itemCode: item.itemCode || '',
      itemGroup: item.itemGroup || '',
      category: item.category || ''
    }));
    
    // Write to CSV
    await csvWriter.writeRecords(processedItems);
    
    log(`Successfully wrote ${processedItems.length} items to ${outputFile}`);
    
    // Summary statistics
    const itemsWithGroup = processedItems.filter(item => item.itemGroup).length;
    const itemsWithCategory = processedItems.filter(item => item.category).length;
    
    log(`Summary: ${itemsWithGroup} items have item groups, ${itemsWithCategory} have categories`);
    
    return processedItems;
    
  } catch (error) {
    log(`Error fetching Avalara items: ${error.message}`, 'error');
    
    if (error.response) {
      log(`Response status: ${error.response.status}`, 'error');
      log(`Response data: ${JSON.stringify(error.response.data)}`, 'error');
    }
    
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  fetchAvalaraItems()
    .then(() => {
      log('Avalara items fetch completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      log(`Avalara items fetch failed: ${error.message}`, 'error');
      process.exit(1);
    });
}

module.exports = { fetchAvalaraItems }; 
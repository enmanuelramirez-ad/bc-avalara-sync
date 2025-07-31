const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// CSV Writer utility
function createCsvWriterUtil(filename, headers) {
  return createCsvWriter({
    path: filename,
    header: headers.map(header => ({
      id: header,
      title: header
    }))
  });
}

// Ensure output directory exists
function ensureOutputDir() {
  const outputDir = './output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

// Pagination helper for BigCommerce API
async function paginateBigCommerce(axiosInstance, endpoint, params = {}) {
  const allResults = [];
  let page = 1;
  const limit = 250; // BigCommerce max limit
  
  while (true) {
    try {
      const response = await axiosInstance.get(endpoint, {
        params: {
          ...params,
          page,
          limit
        }
      });
      
      const data = response.data.data || response.data;
      allResults.push(...data);
      
      // Check if we've reached the end
      if (data.length < limit) {
        break;
      }
      
      page++;
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      break;
    }
  }
  
  return allResults;
}

// Pagination helper for Avalara API
async function paginateAvalara(axiosInstance, endpoint, params = {}) {
  const allResults = [];
  let skip = 0;
  const top = 100; // Avalara recommended page size
  
  while (true) {
    try {
      const response = await axiosInstance.get(endpoint, {
        params: {
          ...params,
          $skip: skip,
          $top: top
        }
      });
      
      const data = response.data.value || response.data;
      allResults.push(...data);
      
      // Check if we've reached the end
      if (data.length < top) {
        break;
      }
      
      skip += top;
    } catch (error) {
      console.error(`Error fetching skip ${skip}:`, error.message);
      break;
    }
  }
  
  return allResults;
}

// Log utility
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  
  if (type === 'error') {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }
  
  return logMessage;
}

// Sleep utility for rate limiting
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}



// Validate SKU format
function isValidSKU(sku) {
  return sku && typeof sku === 'string' && sku.trim().length > 0;
}

module.exports = {
  createCsvWriterUtil,
  ensureOutputDir,
  paginateBigCommerce,
  paginateAvalara,
  log,
  sleep,
  isValidSKU
}; 
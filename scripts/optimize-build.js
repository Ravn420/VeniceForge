#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

async function optimizeBuild() {
  console.log('Optimizing build output...');
  
  // Define packages to optimize
  const packages = ['contracts', 'classifier', 'runner'];
  
  for (const pkg of packages) {
    const distPath = path.join('packages', pkg, 'dist');
    
    // Check if dist directory exists
    if (!fs.existsSync(distPath)) {
      console.log(`Skipping ${pkg}: dist directory not found`);
      continue;
    }
    
    // Get all .js files in dist directory
    const jsFiles = fs.readdirSync(distPath)
      .filter(file => file.endsWith('.js') && !file.endsWith('.map.js'));
    
    console.log(`Optimizing ${jsFiles.length} files in ${pkg}`);
    
    for (const file of jsFiles) {
      const filePath = path.join(distPath, file);
      const originalCode = fs.readFileSync(filePath, 'utf8');
      
      try {
        const result = await minify(originalCode, {
          compress: {
            drop_console: false, // Keep console logs for debugging
            drop_debugger: true,
            ecma: 2022,
            module: true,
            toplevel: true,
            unsafe_arrows: true,
            unsafe_methods: true,
            unsafe_proto: true
          },
          mangle: {
            properties: {
              regex: /^[_$][a-zA-Z]/,
            }
          },
          output: {
            comments: false,
          },
          sourceMap: {
            content: fs.existsSync(filePath + '.map') ? 
              fs.readFileSync(filePath + '.map', 'utf8') : null,
            url: file + '.map'
          },
          ecma: 2022,
          module: true,
          toplevel: true,
          safari10: false
        });
        
        fs.writeFileSync(filePath, result.code);
        if (result.map) {
          fs.writeFileSync(filePath + '.map', result.map);
        }
        
        const originalSize = originalCode.length;
        const newSize = result.code.length;
        const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);
        
        console.log(`  Optimized ${file}: ${originalSize} -> ${newSize} bytes (${reduction}% reduction)`);
      } catch (error) {
        console.error(`  Failed to optimize ${file}:`, error.message);
      }
    }
  }
  
  console.log('Build optimization complete!');
}

optimizeBuild().catch(console.error);
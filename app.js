// Wait for FFmpeg to be available
document.addEventListener('DOMContentLoaded', async () => {
    const { createFFmpeg, fetchFile } = FFmpeg;
    const ffmpeg = createFFmpeg({
        log: true,
        logger: ({ message }) => console.log('FFmpeg Log:', message),
        progress: (p) => console.log('FFmpeg Progress:', p)
    });

    // DOM Elements
    const progressBar = document.querySelector('progress');
    const progressDiv = document.getElementById('progress');
    const previewContainer = document.getElementById('previewContainer');
    const statusSpan = document.getElementById('status');
    const statusDiv = document.getElementById('statusDiv');
    const bgColor = document.getElementById('bgColor');
    const bgColorHex = document.getElementById('bgColorHex');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const downloadAllContainer = document.getElementById('downloadAllContainer');
    const shopifyUrl = document.getElementById('shopifyUrl');
    const processShopifyBtn = document.getElementById('processShopifyBtn');
    const variantSelector = document.getElementById('variantSelector');
    const variantSelect = document.getElementById('variantSelect');
    const processSelectedBtn = document.getElementById('processSelectedBtn');
    const cancelVariantBtn = document.getElementById('cancelVariantBtn');

    let processedImages = [];
    let shopifyVariants = [];
    let shopifyAllImages = [];

    // Color picker synchronization
    bgColor.addEventListener('input', (e) => {
        bgColorHex.value = e.target.value.toUpperCase();
    });

    bgColorHex.addEventListener('input', (e) => {
        const value = e.target.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            bgColor.value = value;
            bgColorHex.classList.remove('border-red-500');
        } else {
            bgColorHex.classList.add('border-red-500');
        }
    });

    // Show status message with progress
    function showStatus(message, type = 'error', progress = null) {
        if (progress !== null) {
            // Show progress in the progress bar area
            statusSpan.textContent = `${Math.round(progress)}%`;
            statusSpan.classList.remove('hidden');
        } else {
            statusSpan.classList.add('hidden');
        }
        
        // Show message in status div
        statusDiv.innerHTML = `<div class="status-message ${type}">${message}${progress !== null ? ` (${Math.round(progress)}%)` : ''}</div>`;
        statusDiv.classList.remove('hidden');
    }

    // Hide status message
    function hideStatus() {
        statusDiv.classList.add('hidden');
        statusSpan.classList.add('hidden');
    }

    // Initialize FFmpeg
    try {
        console.log('Starting FFmpeg load...');
        await ffmpeg.load();
        console.log('FFmpeg loaded successfully!');
        processShopifyBtn.disabled = false;
        showStatus('Ready to convert Shopify images', 'success');
    } catch (error) {
        console.error('FFmpeg loading error:', error);
        showStatus('Error loading FFmpeg. Please try using Chrome or Firefox.');
        processShopifyBtn.disabled = true;
        return;
    }

    // Extract product data from JSON and HTML (using data-variant attributes)
    function extractProductDataFromJsonAndHTML(product, html) {
        const variants = [];
        const allImages = [];
        
        // Get all product images from JSON
        const productImages = product.images || [];
        productImages.forEach(img => {
            const imageUrl = typeof img === 'string' ? img : img.src || img.url;
            if (imageUrl) {
                allImages.push(imageUrl);
            }
        });
        
        // Extract images from HTML using data-variant attributes
        const imagesByVariantName = {};
        
        // First, find all data-variant attributes and their positions
        // Try multiple patterns to catch different HTML formats
        const variantPositions = [];
        
        // Pattern 1: Standard data-variant="value"
        const variantAttrPattern1 = /data-variant\s*=\s*["']([^"']+)["']/gi;
        let variantAttrMatch;
        while ((variantAttrMatch = variantAttrPattern1.exec(html)) !== null) {
            variantPositions.push({
                name: variantAttrMatch[1],
                index: variantAttrMatch.index
            });
        }
        
        // Pattern 2: data-variant='value' (single quotes)
        const variantAttrPattern2 = /data-variant\s*=\s*[']([^']+)[']/gi;
        while ((variantAttrMatch = variantAttrPattern2.exec(html)) !== null) {
            variantPositions.push({
                name: variantAttrMatch[1],
                index: variantAttrMatch.index
            });
        }
        
        // Pattern 3: data-variant=value (no quotes)
        const variantAttrPattern3 = /data-variant\s*=\s*([^\s>]+)/gi;
        while ((variantAttrMatch = variantAttrPattern3.exec(html)) !== null) {
            variantPositions.push({
                name: variantAttrMatch[1],
                index: variantAttrMatch.index
            });
        }
        
        // Remove duplicates
        const uniqueVariants = {};
        variantPositions.forEach(({ name, index }) => {
            if (!uniqueVariants[name]) {
                uniqueVariants[name] = index;
            }
        });
        const uniqueVariantPositions = Object.entries(uniqueVariants).map(([name, index]) => ({ name, index }));
        
        console.log(`Found ${uniqueVariantPositions.length} unique data-variant attributes in HTML`);
        
        // Debug: Check if HTML contains variant-related content
        if (uniqueVariantPositions.length === 0) {
            // Try to find any mention of variant names in the HTML
            const variantNamesFromJson = product.variants?.map(v => v.title || v.option1).filter(Boolean) || [];
            console.log('Looking for variant names in HTML:', variantNamesFromJson);
            
            // Check if HTML contains these variant names near image elements
            variantNamesFromJson.forEach(variantName => {
                const nameIndex = html.indexOf(variantName);
                if (nameIndex !== -1) {
                    const context = html.substring(Math.max(0, nameIndex - 200), Math.min(html.length, nameIndex + 500));
                    console.log(`Found "${variantName}" in HTML at position ${nameIndex}, context:`, context.substring(0, 300));
                }
            });
        }
        
        // For each data-variant, find nearby images
        uniqueVariantPositions.forEach(({ name, index }) => {
            // Look backwards and forwards from the data-variant attribute
            const searchStart = Math.max(0, index - 500);
            const searchEnd = Math.min(html.length, index + 2000);
            const contextHtml = html.substring(searchStart, searchEnd);
            
            // Find all image URLs in this context
            const imagePatterns = [
                /(?:src|data-src|data-image|data-zoom-src|data-product-image)=["']([^"']+\.(?:jpg|jpeg|png|gif|webp|JPG|JPEG|PNG|GIF|WEBP))[^"']*["']/gi,
                /url\(["']?([^"')]+\.(?:jpg|jpeg|png|gif|webp|JPG|JPEG|PNG|GIF|WEBP))[^"')]*["']?\)/gi,
                /href=["']([^"']+\.(?:jpg|jpeg|png|gif|webp|JPG|JPEG|PNG|GIF|WEBP))[^"']*["']/gi
            ];
            
            imagePatterns.forEach(pattern => {
                let imgMatch;
                while ((imgMatch = pattern.exec(contextHtml)) !== null) {
                    let imageUrl = imgMatch[1];
                    
                    // Normalize URL
                    if (!imageUrl.startsWith('http')) {
                        imageUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : 
                                  imageUrl.startsWith('/') ? `https://halfdaytravel.com${imageUrl}` : imageUrl;
                    }
                    
                    // Only add if it's a valid Shopify CDN URL or product image
                    if (imageUrl.includes('shopify') || imageUrl.includes('cdn.shopify.com') || imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
                        if (!imagesByVariantName[name]) {
                            imagesByVariantName[name] = new Set();
                        }
                        imagesByVariantName[name].add(imageUrl);
                        allImages.push(imageUrl);
                    }
                }
            });
        });
        
        // Also try to find images within elements that have data-variant
        // Look for closing tags and extract content between opening and closing tag
        const variantElementPattern = /<[^>]*data-variant=["']([^"']+)["'][^>]*>([\s\S]{0,3000}?)<\/[^>]+>/gi;
        let elementMatch;
        while ((elementMatch = variantElementPattern.exec(html)) !== null) {
            const variantName = elementMatch[1];
            const elementContent = elementMatch[2];
            
            // Find all image URLs in this element's content
            const contentImagePattern = /(?:src|data-src|data-image|data-zoom-src|data-product-image|href)=["']([^"']+\.(?:jpg|jpeg|png|gif|webp|JPG|JPEG|PNG|GIF|WEBP))[^"']*["']/gi;
            let contentMatch;
            while ((contentMatch = contentImagePattern.exec(elementContent)) !== null) {
                let imageUrl = contentMatch[1];
                if (!imageUrl.startsWith('http')) {
                    imageUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : 
                              imageUrl.startsWith('/') ? `https://halfdaytravel.com${imageUrl}` : imageUrl;
                }
                
                if (imageUrl.includes('shopify') || imageUrl.includes('cdn.shopify.com') || imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
                    if (!imagesByVariantName[variantName]) {
                        imagesByVariantName[variantName] = new Set();
                    }
                    imagesByVariantName[variantName].add(imageUrl);
                    allImages.push(imageUrl);
                }
            }
        }
        
        // Pattern: Find images that appear after data-variant in the same section/container
        // This handles cases where data-variant is on a parent and images are children/siblings
        uniqueVariantPositions.forEach(({ name, index }) => {
            // Look forward from data-variant to find the next few images
            const forwardHtml = html.substring(index, Math.min(html.length, index + 5000));
            
            // Find all image URLs that appear after this data-variant
            const forwardImagePattern = /(?:src|data-src|data-image|data-zoom-src|data-product-image|href)=["']([^"']+\.(?:jpg|jpeg|png|gif|webp|JPG|JPEG|PNG|GIF|WEBP))[^"']*["']/gi;
            let forwardMatch;
            let imageCount = 0;
            while ((forwardMatch = forwardImagePattern.exec(forwardHtml)) !== null && imageCount < 50) {
                // Stop if we hit another data-variant (different variant section)
                const matchIndex = index + forwardMatch.index;
                const nextVariant = html.substring(matchIndex, Math.min(html.length, matchIndex + 100)).match(/data-variant=["']([^"']+)["']/);
                if (nextVariant && nextVariant[1] !== name) {
                    break; // Hit a different variant, stop
                }
                
                let imageUrl = forwardMatch[1];
                if (!imageUrl.startsWith('http')) {
                    imageUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : 
                              imageUrl.startsWith('/') ? `https://halfdaytravel.com${imageUrl}` : imageUrl;
                }
                
                if (imageUrl.includes('shopify') || imageUrl.includes('cdn.shopify.com') || imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
                    if (!imagesByVariantName[name]) {
                        imagesByVariantName[name] = new Set();
                    }
                    imagesByVariantName[name].add(imageUrl);
                    allImages.push(imageUrl);
                    imageCount++;
                }
            }
        });
        
        // Debug: Log found variant images
        console.log('Images found by variant name from HTML:', Object.keys(imagesByVariantName).reduce((acc, key) => {
            acc[key] = Array.from(imagesByVariantName[key]).length;
            return acc;
        }, {}));
        
        // Process each variant from JSON
        if (product.variants && Array.isArray(product.variants)) {
            product.variants.forEach((variant, index) => {
                const variantName = variant.title || variant.option1 || `Variant ${index + 1}`;
                const variantNameLower = variantName.toLowerCase();
                console.log(`Processing variant: "${variantName}" (ID: ${variant.id})`);
                const variantImagesSet = new Set();
                
                // PRIMARY METHOD: Get all images that have this variant's ID in their variant_ids array
                productImages.forEach(img => {
                    const variantIds = img.variant_ids || [];
                    if (variantIds.includes(variant.id)) {
                        const imageUrl = typeof img === 'string' ? img : img.src || img.url;
                        if (imageUrl) {
                            variantImagesSet.add(imageUrl);
                            console.log(`  - Found image via variant_ids: ${imageUrl.substring(0, 80)}...`);
                        }
                    }
                });
                
                // SECONDARY METHOD: Match images by filename pattern (e.g., "jet-premium", "pacific-premium")
                // This catches images that aren't properly tagged with variant_ids
                productImages.forEach(img => {
                    const imageUrl = typeof img === 'string' ? img : img.src || img.url;
                    if (imageUrl) {
                        // Extract filename from URL (remove query parameters)
                        const urlWithoutParams = imageUrl.split('?')[0];
                        const urlParts = urlWithoutParams.split('/');
                        const filename = urlParts[urlParts.length - 1].toLowerCase();
                        
                        // Check if filename contains variant name
                        // Patterns like: "halfday-garment-duffel-jet-premium_047.png"
                        // Look for variant name surrounded by dashes or underscores
                        const matchesVariant = 
                            filename.includes(`-${variantNameLower}-`) ||  // e.g., "-jet-"
                            filename.includes(`-${variantNameLower}_`) ||  // e.g., "-jet_"
                            filename.includes(`_${variantNameLower}_`) ||  // e.g., "_jet_"
                            filename.includes(`_${variantNameLower}-`) ||  // e.g., "_jet-"
                            filename.includes(`-${variantNameLower}.`) ||  // e.g., "-jet.png"
                            filename.includes(`_${variantNameLower}.`);   // e.g., "_jet.png"
                        
                        if (matchesVariant) {
                            variantImagesSet.add(imageUrl);
                            console.log(`  - Found image via filename pattern: ${imageUrl.substring(0, 80)}...`);
                        }
                    }
                });
                
                // SECONDARY: Get images from HTML using data-variant attribute (if HTML parsing worked)
                if (imagesByVariantName[variantName]) {
                    imagesByVariantName[variantName].forEach(img => {
                        variantImagesSet.add(img);
                        console.log(`  - Found image via HTML data-variant: ${img.substring(0, 80)}...`);
                    });
                }
                
                // Try case-insensitive match for HTML data-variant
                for (const [key, images] of Object.entries(imagesByVariantName)) {
                    if (key.toLowerCase() === variantNameLower && key !== variantName) {
                        images.forEach(img => {
                            variantImagesSet.add(img);
                            console.log(`  - Found image via HTML data-variant (case-insensitive): ${img.substring(0, 80)}...`);
                        });
                    }
                }
                
                // TERTIARY: Get the primary image from JSON (variant.image_id) - this is the featured image
                if (variant.image_id) {
                    const primaryImage = productImages.find(img => img.id === variant.image_id);
                    if (primaryImage) {
                        const imageUrl = typeof primaryImage === 'string' ? primaryImage : primaryImage.src || primaryImage.url;
                        if (imageUrl) {
                            variantImagesSet.add(imageUrl);
                            console.log(`  - Found primary image via image_id: ${imageUrl.substring(0, 80)}...`);
                        }
                    }
                }
                
                // If no variant-specific images found, use shared images or all images as fallback
                const variantImages = variantImagesSet.size > 0 
                    ? Array.from(variantImagesSet) 
                    : allImages;
                
                console.log(`Variant "${variantName}": Found ${variantImages.length} images total`);
                
                variants.push({
                    id: variant.id || index,
                    name: variantName,
                    images: variantImages.filter(Boolean)
                });
            });
        }
        
        return {
            allImages: [...new Set(allImages)],
            variants: variants
        };
    }
    
    // Extract product data from JSON endpoint
    function extractProductDataFromJson(product) {
        const variants = [];
        const allImages = [];
        
        // Get all product images
        const productImages = product.images || [];
        productImages.forEach(img => {
            const imageUrl = typeof img === 'string' ? img : img.src || img.url;
            if (imageUrl) {
                allImages.push(imageUrl);
            }
        });
        
        // Map images by variant_ids for quick lookup
        const imagesByVariantId = {};
        productImages.forEach(img => {
            const variantIds = img.variant_ids || [];
            const imageUrl = typeof img === 'string' ? img : img.src || img.url;
            if (imageUrl && variantIds.length > 0) {
                variantIds.forEach(variantId => {
                    if (!imagesByVariantId[variantId]) {
                        imagesByVariantId[variantId] = [];
                    }
                    imagesByVariantId[variantId].push(imageUrl);
                });
            }
        });
        
        // Get shared images (images with no variant_ids or empty variant_ids)
        const sharedImages = productImages
            .filter(img => !img.variant_ids || img.variant_ids.length === 0)
            .map(img => typeof img === 'string' ? img : img.src || img.url)
            .filter(Boolean);
        
        // Process each variant
        if (product.variants && Array.isArray(product.variants)) {
            product.variants.forEach((variant, index) => {
                const variantName = variant.title || variant.option1 || `Variant ${index + 1}`;
                const variantImagesSet = new Set();
                
                // Find all images that are specifically associated with this variant
                productImages.forEach(img => {
                    const variantIds = img.variant_ids || [];
                    // Include image if it has this variant's ID in its variant_ids array
                    if (variantIds.includes(variant.id)) {
                        const imageUrl = typeof img === 'string' ? img : img.src || img.url;
                        if (imageUrl) {
                            variantImagesSet.add(imageUrl);
                        }
                    }
                });
                
                // Also get the primary image for this variant (from variant.image_id)
                // This ensures we get at least one image even if variant_ids mapping is incomplete
                if (variant.image_id) {
                    const primaryImage = productImages.find(img => img.id === variant.image_id);
                    if (primaryImage) {
                        const imageUrl = typeof primaryImage === 'string' ? primaryImage : primaryImage.src || primaryImage.url;
                        if (imageUrl) {
                            variantImagesSet.add(imageUrl);
                        }
                    }
                }
                
                // If no variant-specific images found, use shared images or all images as fallback
                let variantImages;
                if (variantImagesSet.size === 0) {
                    variantImages = sharedImages.length > 0 ? sharedImages : allImages;
                } else {
                    // Use only variant-specific images
                    variantImages = Array.from(variantImagesSet);
                }
                
                variants.push({
                    id: variant.id || index,
                    name: variantName,
                    images: variantImages.filter(Boolean)
                });
            });
        }
        
        return {
            allImages: allImages,
            variants: variants
        };
    }
    
    // Extract product data and variants from HTML
    function extractProductData(html) {
        const allImages = new Set();
        const variants = [];
        
        // Extract all images using multiple patterns
        // Pattern 1: Standard Shopify CDN URLs
        const cdnPattern = /https:\/\/cdn\.shopify\.com\/s\/files\/[^"'\s<>]+\.(?:jpg|jpeg|png|gif|webp|JPG|JPEG|PNG|GIF|WEBP)(?:\?[^"'\s<>]*)?/gi;
        const cdnMatches = html.match(cdnPattern);
        if (cdnMatches) {
            cdnMatches.forEach(url => allImages.add(url.split('?')[0]));
        }
        
        // Pattern 2: Extract from JSON-LD structured data
        const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis;
        let jsonMatch;
        while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
            try {
                const jsonData = JSON.parse(jsonMatch[1]);
                const extractImages = (obj) => {
                    if (typeof obj === 'string' && obj.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
                        allImages.add(obj.split('?')[0]);
                    } else if (Array.isArray(obj)) {
                        obj.forEach(extractImages);
                    } else if (obj && typeof obj === 'object') {
                        Object.values(obj).forEach(extractImages);
                    }
                };
                extractImages(jsonData);
            } catch (e) {
                // Invalid JSON, skip
            }
        }
        
        // Pattern 3: Extract from img src attributes
        const imgSrcPattern = /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|gif|webp))[^"']*["']/gi;
        let imgMatch;
        while ((imgMatch = imgSrcPattern.exec(html)) !== null) {
            if (imgMatch[1].startsWith('http')) {
                allImages.add(imgMatch[1].split('?')[0]);
            }
        }
        
        // Pattern 4: Extract from data-src (lazy loaded images)
        const dataSrcPattern = /data-src=["']([^"']+\.(?:jpg|jpeg|png|gif|webp))[^"']*["']/gi;
        let dataSrcMatch;
        while ((dataSrcMatch = dataSrcPattern.exec(html)) !== null) {
            if (dataSrcMatch[1].startsWith('http')) {
                allImages.add(dataSrcMatch[1].split('?')[0]);
            }
        }
        
        // Pattern 5: Extract from srcset
        const srcsetPattern = /srcset=["']([^"']+)["']/gi;
        let srcsetMatch;
        while ((srcsetMatch = srcsetPattern.exec(html)) !== null) {
            const srcsetUrls = srcsetMatch[1].split(',').map(item => {
                const url = item.trim().split(/\s+/)[0];
                return url;
            });
            srcsetUrls.forEach(url => {
                if (url.match(/\.(jpg|jpeg|png|gif|webp)/i) && (url.startsWith('http') || url.startsWith('//'))) {
                    const fullUrl = url.startsWith('//') ? `https:${url}` : url;
                    allImages.add(fullUrl.split('?')[0]);
                }
            });
        }
        
        // Pattern 6: Extract from data attributes
        const dataImagePattern = /data-(?:image|product-image|zoom|src)=["']([^"']+\.(?:jpg|jpeg|png|gif|webp))[^"']*["']/gi;
        let dataImageMatch;
        while ((dataImageMatch = dataImagePattern.exec(html)) !== null) {
            if (dataImageMatch[1].startsWith('http') || dataImageMatch[1].startsWith('//')) {
                const fullUrl = dataImageMatch[1].startsWith('//') ? `https:${dataImageMatch[1]}` : dataImageMatch[1];
                allImages.add(fullUrl.split('?')[0]);
            }
        }
        
        // Filter images
        const filteredImages = Array.from(allImages).filter(url => {
            if (url.includes('shopify') || url.includes('cdn.shopify.com')) {
                return true;
            }
            if (url.startsWith('http://') || url.startsWith('https://')) {
                const excludePatterns = ['logo', 'icon', 'favicon', 'sprite', 'placeholder'];
                const lowerUrl = url.toLowerCase();
                return !excludePatterns.some(pattern => lowerUrl.includes(pattern));
            }
            return false;
        });
        
        // Try to extract variant data from product JSON
        const productJsonPattern = /<script[^>]*id=["']product-json["'][^>]*>(.*?)<\/script>/gis;
        let productJsonMatch = productJsonPattern.exec(html);
        if (!productJsonMatch) {
            // Try alternative patterns
            const altPatterns = [
                /window\.__INITIAL_STATE__\s*=\s*({.*?});/gis,
                /Product\.json\s*=\s*({.*?});/gis,
                /"product":\s*({[^}]+"variants"[^}]+})/gis
            ];
            for (const pattern of altPatterns) {
                productJsonMatch = pattern.exec(html);
                if (productJsonMatch) break;
            }
        }
        
        if (productJsonMatch) {
            try {
                const productData = JSON.parse(productJsonMatch[1]);
                const productImages = productData.images || productData.media || [];
                const allProductImageUrls = productImages.map(img => typeof img === 'string' ? img : img.src || img.url || img).filter(Boolean);
                
                if (productData.variants && Array.isArray(productData.variants)) {
                    productData.variants.forEach((variant, index) => {
                        const variantName = variant.title || variant.name || `Variant ${index + 1}`;
                        let variantImages = [];
                        
                        // Try to get variant-specific images
                        if (variant.featured_image) {
                            variantImages.push(typeof variant.featured_image === 'string' ? variant.featured_image : variant.featured_image.src || variant.featured_image.url);
                        } else if (variant.image) {
                            variantImages.push(typeof variant.image === 'string' ? variant.image : variant.image.src || variant.image.url);
                        } else if (variant.image_id && productImages) {
                            // Try to find image by ID
                            const variantImage = productImages.find(img => (typeof img === 'object' ? img.id : null) === variant.image_id);
                            if (variantImage) {
                                variantImages.push(typeof variantImage === 'string' ? variantImage : variantImage.src || variantImage.url);
                            }
                        }
                        
                        // If variant has no specific images, use all product images
                        if (variantImages.length === 0 && allProductImageUrls.length > 0) {
                            variantImages = allProductImageUrls;
                        }
                        
                        variants.push({
                            id: variant.id || index,
                            name: variantName,
                            images: variantImages.filter(Boolean)
                        });
                    });
                }
            } catch (e) {
                console.log('Could not parse product JSON:', e);
            }
        }
        
        // If no variants found but we have images, create a single "All Images" variant
        if (variants.length === 0 && filteredImages.length > 0) {
            variants.push({
                id: 'all',
                name: 'All Product Images',
                images: filteredImages
            });
        }
        
        return {
            allImages: filteredImages,
            variants: variants
        };
    }
    
    // Show variant selector UI
    function showVariantSelector() {
        variantSelect.innerHTML = '<option value="all">All Variants (All Images)</option>';
        
        shopifyVariants.forEach((variant, index) => {
            const option = document.createElement('option');
            option.value = variant.id || index;
            option.textContent = `${variant.name} (${variant.images.length} images)`;
            variantSelect.appendChild(option);
        });
        
        variantSelector.classList.remove('hidden');
        processShopifyBtn.disabled = false;
        processShopifyBtn.textContent = 'Fetch Product';
        showStatus(`Found ${shopifyAllImages.length} total images across ${shopifyVariants.length} variants`, 'success');
    }
    
    // Process Shopify images with FFmpeg
    async function processShopifyImages(imageUrls) {
        if (imageUrls.length === 0) {
            showStatus('No images to process');
            return;
        }
        
        progressDiv.classList.remove('hidden');
        processedImages = [];
        previewContainer.innerHTML = '';
        variantSelector.classList.add('hidden');
        
        showStatus(`Processing ${imageUrls.length} images`, 'success');
        
        for (let i = 0; i < imageUrls.length; i++) {
            const progress = ((i / imageUrls.length) * 100);
            progressBar.value = progress;
            showStatus(`Processing image ${i + 1} of ${imageUrls.length}`, 'success', progress);

            try {
                const imageResponse = await fetch(imageUrls[i]);
                const imageBlob = await imageResponse.blob();
                const imageFile = new File([imageBlob], `shopify_image_${i}.png`, { type: 'image/png' });

                const width = document.getElementById('width').value;
                const height = document.getElementById('height').value;
                const bgColorValue = bgColorHex.value;

                const inputFileName = `input${i}.png`;
                await ffmpeg.FS('writeFile', inputFileName, await fetchFile(imageFile));

                await ffmpeg.run(
                    '-i', inputFileName,
                    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${bgColorValue}`,
                    '-sws_flags', 'lanczos+accurate_rnd+full_chroma_int+full_chroma_inp',
                    '-pix_fmt', 'rgba',
                    '-compression_level', '0',
                    '-quality', '100',
                    '-lossless', '1',
                    '-pred', 'mixed',
                    '-y',
                    `output${i}.png`
                );

                const data = ffmpeg.FS('readFile', `output${i}.png`);
                const blob = new Blob([data.buffer], { type: 'image/png' });
                const url = URL.createObjectURL(blob);
                
                const fileName = `shopify_image_${i}_widescreen.png`;
                processedImages.push({ url, name: fileName });

                ffmpeg.FS('unlink', inputFileName);
                ffmpeg.FS('unlink', `output${i}.png`);

                const div = document.createElement('div');
                div.className = 'preview-item';
                const img = document.createElement('img');
                img.src = url;
                div.appendChild(img);
                previewContainer.appendChild(div);

            } catch (error) {
                console.error(`Error processing image ${i + 1}:`, error);
                showStatus(`Error processing image ${i + 1}: ${error.message}`);
                continue;
            }
        }

        downloadAllContainer.classList.remove('hidden');
        showStatus(`Successfully processed ${processedImages.length} images`, 'success');
    }

    // Process Shopify URL
    processShopifyBtn.addEventListener('click', async () => {
        const url = shopifyUrl.value.trim();
        if (!url) {
            showStatus('Please enter a Shopify product URL');
            return;
        }

        // Basic URL validation
        try {
            new URL(url);
        } catch (e) {
            showStatus('Please enter a valid URL');
            return;
        }

        hideStatus();
        variantSelector.classList.add('hidden');
        processShopifyBtn.disabled = true;
        processShopifyBtn.textContent = 'Fetching...';
        downloadAllContainer.classList.add('hidden');
        processedImages = [];
        previewContainer.innerHTML = '';
        shopifyVariants = [];
        shopifyAllImages = [];

        try {
            // First try to fetch the .json endpoint for better variant data
            // Remove query parameters and trailing slash before adding .json
            const cleanUrl = url.split('?')[0].replace(/\/$/, '');
            const jsonUrl = cleanUrl.endsWith('.json') ? cleanUrl : cleanUrl + '.json';
            let productJson = null;
            
            // Try to fetch JSON endpoint
            const jsonProxyUrls = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(jsonUrl)}`,
                `https://corsproxy.io/?${encodeURIComponent(jsonUrl)}`,
                jsonUrl
            ];
            
            for (const proxyUrl of jsonProxyUrls) {
                try {
                    showStatus('Fetching product data...', 'success');
                    const response = await fetch(proxyUrl, {
                        headers: {
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        productJson = await response.json();
                        break;
                    }
                } catch (error) {
                    console.log(`JSON fetch failed: ${proxyUrl}`, error);
                    continue;
                }
            }
            
            // Fetch HTML page to get data-variant attributes
            const proxyUrls = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                `https://corsproxy.io/?${encodeURIComponent(url)}`,
                url
            ];
            
            let html = '';
            let lastError = null;
            
            for (const proxyUrl of proxyUrls) {
                try {
                    showStatus('Fetching product page...', 'success');
                    const response = await fetch(proxyUrl, {
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    html = await response.text();
                    break;
                } catch (error) {
                    lastError = error;
                    console.log(`Proxy attempt failed: ${proxyUrl}`, error);
                    continue;
                }
            }
            
            if (!html) {
                throw new Error(`Failed to fetch page: ${lastError?.message || 'All proxy attempts failed'}`);
            }
            
            // Extract product data - combine JSON and HTML data
            let productData;
            if (productJson && productJson.product) {
                productData = extractProductDataFromJsonAndHTML(productJson.product, html);
            } else {
                productData = extractProductData(html);
            }
            
            shopifyVariants = productData.variants;
            shopifyAllImages = productData.allImages;
            
            // Show variant selector if variants found, otherwise process all images
            if (shopifyVariants.length > 0) {
                showVariantSelector();
            } else {
                // No variants found, process all images directly
                await processShopifyImages(shopifyAllImages);
            }

        } catch (error) {
            console.error('Error processing Shopify URL:', error);
            showStatus(`Error: ${error.message}`);
            processShopifyBtn.disabled = false;
            processShopifyBtn.textContent = 'Fetch Product';
        }
    });

    // Handle variant selection and processing
    processSelectedBtn.addEventListener('click', async () => {
        const selectedVariantId = variantSelect.value;
        let imagesToProcess = [];

        if (selectedVariantId === 'all') {
            imagesToProcess = shopifyAllImages;
        } else {
            const selectedVariant = shopifyVariants.find(v => (v.id || '').toString() === selectedVariantId.toString());
            if (selectedVariant && selectedVariant.images.length > 0) {
                imagesToProcess = selectedVariant.images;
            } else {
                showStatus('Selected variant has no images', 'error');
                return;
            }
        }

        processSelectedBtn.disabled = true;
        processSelectedBtn.textContent = 'Processing...';
        
        try {
            await processShopifyImages(imagesToProcess);
        } catch (error) {
            console.error('Error processing images:', error);
            showStatus(`Error: ${error.message}`);
        } finally {
            processSelectedBtn.disabled = false;
            processSelectedBtn.textContent = 'Process Selected Variant';
        }
    });

    // Cancel variant selection
    cancelVariantBtn.addEventListener('click', () => {
        variantSelector.classList.add('hidden');
        shopifyVariants = [];
        shopifyAllImages = [];
    });

    // Download all images
    downloadAllBtn.addEventListener('click', () => {
        if (processedImages.length === 0) return;

        const zip = new JSZip();
        const promises = processedImages.map(({ url, name }, index) => {
            return fetch(url)
                .then(response => response.blob())
                .then(blob => {
                    zip.file(name, blob);
                });
        });

        Promise.all(promises).then(() => {
            zip.generateAsync({ type: 'blob' })
                .then(content => {
                    const zipUrl = URL.createObjectURL(content);
                    const link = document.createElement('a');
                    link.href = zipUrl;
                    link.download = 'widescreen_images.zip';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(zipUrl);
                });
        });
    });

}); 
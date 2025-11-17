# Shopify Image Converter

A web-based tool for converting Shopify product images to widescreen format (16:9) with customizable dimensions and background color. This tool runs entirely in the browser using FFmpeg.wasm.

## Features

- Fetch images from Shopify product pages
- Select specific product variants or process all variants
- Automatic image extraction from Shopify product URLs
- Custom output dimensions (default: 1920x1080)
- Custom background color with hex code support
- Batch download as ZIP
- No server-side processing required
- Works entirely in the browser

## Technologies Used

- FFmpeg.wasm for image processing
- Pure CSS for styling
- JSZip for batch downloads
- Pure JavaScript for the frontend

## Development

To run locally:

1. Clone this repository
2. Navigate to the project directory
3. Start a local server with CORS headers:
   - Using the included Python script: `python3 server.py 8000`
   - Or use any HTTP server that supports CORS headers
4. Open `http://localhost:8000` in your browser

**Note:** The CORS headers (`Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy`) are required for FFmpeg.wasm to work properly.

## Deployment

This site can be deployed to Vercel or Netlify. Both platforms are configured with the necessary CORS headers for FFmpeg.wasm.

### Vercel Deployment

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the project directory
3. Follow the prompts to deploy
4. Or connect your GitHub repository to Vercel through the web interface

### Netlify Deployment

1. Install Netlify CLI: `npm i -g netlify-cli`
2. Run `netlify deploy` in the project directory
3. Or connect your GitHub repository to Netlify through the web interface

The `vercel.json` and `netlify.toml` files contain the necessary headers configuration.

## License

MIT License  
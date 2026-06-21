const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

async function generateImage(id, name, rarity) {
    const canvas = createCanvas(512, 512);
    const ctx = canvas.getContext('2d');

    // Background colors by rarity
    const colors = {
        common: '#5e5e5e',
        epic: '#9b59b6',
        secret: '#e74c3c',
        nightmare: '#000000',
        apex: '#00ffff'
    };

    ctx.fillStyle = colors[rarity] || '#222';
    ctx.fillRect(0, 0, 512, 512);

    // Card ID text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(id, 256, 200);

    // Card name text
    ctx.font = 'bold 40px Arial';
    ctx.fillText(name, 256, 300);

    const buffer = canvas.toBuffer('image/png');

    const outputPath = path.join(__dirname, 'images', `${id}.png`);
    fs.writeFileSync(outputPath, buffer);

    console.log(`🖼 Image created: ${id}.png`);
}


module.exports = generateImage;

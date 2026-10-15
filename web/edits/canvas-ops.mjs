const SHARPEN_KERNEL = [0, -1, 0, -1, 5, -1, 0, -1, 0];

export const DEFAULT_BRUSH = { colour: '#d7263d', width: 6 };

export const JPEG = 'image/jpeg';

const ENCODE_QUALITY = 0.92;

export const encode = (canvas, mimeType = JPEG, quality = ENCODE_QUALITY) => canvas.toDataURL(mimeType, quality);

export function canvasOf(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function sameSizeCanvas(image) {
    return canvasOf(image.naturalWidth, image.naturalHeight);
}

function copyOf(image) {
    const canvas = sameSizeCanvas(image);
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas;
}

function filtered(image, filter) {
    const canvas = sameSizeCanvas(image);
    const context = canvas.getContext('2d');
    context.filter = filter;
    context.drawImage(image, 0, 0);
    return canvas;
}

function convolve({ data, width, height }, kernel) {
    const output = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            for (let channel = 0; channel < 3; channel++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    const sy = Math.min(height - 1, Math.max(0, y + ky));
                    for (let kx = -1; kx <= 1; kx++) {
                        const sx = Math.min(width - 1, Math.max(0, x + kx));
                        sum += data[(sy * width + sx) * 4 + channel] * kernel[(ky + 1) * 3 + kx + 1];
                    }
                }
                output[offset + channel] = sum;
            }
            output[offset + 3] = data[offset + 3];
        }
    }
    return new ImageData(output, width, height);
}

function* ringPoints({ height, width, x, y }) {
    for (let dx = -1; dx <= width; dx++) {
        yield [x + dx, y - 1];
        yield [x + dx, y + height];
    }
    for (let dy = 0; dy < height; dy++) {
        yield [x - 1, y + dy];
        yield [x + width, y + dy];
    }
}

function meanRingColour({ data, height, width }, rect) {
    const sum = [0, 0, 0];
    let count = 0;
    for (const [x, y] of ringPoints(rect)) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const offset = (y * width + x) * 4;
        sum[0] += data[offset];
        sum[1] += data[offset + 1];
        sum[2] += data[offset + 2];
        count++;
    }
    return count ? sum.map((channel) => Math.round(channel / count)) : [255, 255, 255];
}

export function boundsOf(strokes) {
    const points = strokes.flat();
    if (!points.length) return null;

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.floor(Math.min(...xs));
    const top = Math.floor(Math.min(...ys));
    const right = Math.ceil(Math.max(...xs));
    const bottom = Math.ceil(Math.max(...ys));

    return { height: Math.max(1, bottom - top), width: Math.max(1, right - left), x: left, y: top };
}

export const grayscale = (image) => filtered(image, 'grayscale(1)');

export const adjustColour = (image, { brightness, contrast, saturation }) =>
    filtered(image, `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`);

export const blur = (image, radius) => filtered(image, `blur(${radius}px)`);

export const sepia = (image) => filtered(image, 'sepia(1)');

export const invert = (image) => filtered(image, 'invert(1)');

export const unchanged = copyOf;

export function sharpen(image) {
    const canvas = copyOf(image);
    const context = canvas.getContext('2d');
    context.putImageData(convolve(context.getImageData(0, 0, canvas.width, canvas.height), SHARPEN_KERNEL), 0, 0);
    return canvas;
}

export function rotate(image, quarterTurns) {
    const { naturalHeight: height, naturalWidth: width } = image;
    const canvas = canvasOf(height, width);
    const context = canvas.getContext('2d');
    context.translate(height / 2, width / 2);
    context.rotate((quarterTurns * Math.PI) / 2);
    context.drawImage(image, -width / 2, -height / 2);
    return canvas;
}

export function flip(image, axis) {
    const horizontal = axis === 'horizontal';
    const canvas = sameSizeCanvas(image);
    const context = canvas.getContext('2d');
    context.translate(horizontal ? canvas.width : 0, horizontal ? 0 : canvas.height);
    context.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
    context.drawImage(image, 0, 0);
    return canvas;
}

export function resize(image, width) {
    const canvas = canvasOf(width, Math.round((width / image.naturalWidth) * image.naturalHeight));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
}

export function crop(image, { height, width, x, y }) {
    const canvas = canvasOf(width, height);
    canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);
    return canvas;
}

export function draw(image, strokes, { colour, width }) {
    const canvas = copyOf(image);
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = width;
    context.strokeStyle = colour;
    for (const stroke of strokes) {
        if (!stroke.length) continue;
        context.beginPath();
        context.moveTo(stroke[0].x, stroke[0].y);
        for (const point of stroke) context.lineTo(point.x, point.y);
        context.stroke();
    }
    return canvas;
}

export function erase(image, rect) {
    const canvas = copyOf(image);
    const context = canvas.getContext('2d');
    const [red, green, blue] = meanRingColour(context.getImageData(0, 0, canvas.width, canvas.height), rect);
    context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    return canvas;
}

export function place(image, overlay, { height, width, x, y }) {
    const canvas = copyOf(image);
    const context = canvas.getContext('2d');
    const scale = Math.max(width / overlay.naturalWidth, height / overlay.naturalHeight);
    const drawnWidth = overlay.naturalWidth * scale;
    const drawnHeight = overlay.naturalHeight * scale;
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.drawImage(overlay, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
    return canvas;
}

export function pad(image, margin) {
    const canvas = canvasOf(image.naturalWidth + margin * 2, image.naturalHeight + margin * 2);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, margin, margin);
    return canvas;
}

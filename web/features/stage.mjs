import { isVideo } from '../dom.mjs';
import { polyline, stageMarkup } from './canvas-markup.mjs';

const MIN_SELECTION = 8;

export const rectangle = (start, end) => ({
    height: Math.abs(end.y - start.y),
    width: Math.abs(end.x - start.x),
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
});

export const isLargeEnough = (rect) => rect.width >= MIN_SELECTION && rect.height >= MIN_SELECTION;

export function mountStage(stage, canCapture) {
    let size = null;
    let selection = null;
    let strokes = [];
    let start = null;
    let brush = false;

    const image = () => stage.querySelector('.preview__image');

    const pointOf = (event) => {
        const bounds = image().getBoundingClientRect();
        const clamp = (value, limit) => Math.round(Math.min(Math.max(value, 0), limit));

        return {
            x: clamp(((event.clientX - bounds.left) / bounds.width) * size.width, size.width),
            y: clamp(((event.clientY - bounds.top) / bounds.height) * size.height, size.height),
        };
    };

    const showSelection = (rect) => {
        const marquee = stage.querySelector('.preview__marquee');
        marquee.setAttribute('visibility', rect ? 'visible' : 'hidden');
        for (const [name, value] of Object.entries(rect ?? {})) marquee.setAttribute(name, value);
    };

    const showStrokes = () => {
        stage.querySelector('.preview__strokes').innerHTML = strokes.map(polyline).join('');
    };

    const isCapturing = (event) => size && canCapture() && event.target.closest('.preview');

    stage.addEventListener('pointerdown', (event) => {
        if (!isCapturing(event)) return;

        start = pointOf(event);
        stage.setPointerCapture(event.pointerId);
        if (brush) {
            strokes.push([start]);
            return;
        }

        selection = null;
        showSelection(null);
    });

    stage.addEventListener('pointermove', (event) => {
        if (!start) return;

        if (brush) {
            strokes.at(-1).push(pointOf(event));
            showStrokes();
        } else showSelection(rectangle(start, pointOf(event)));
    });

    stage.addEventListener('pointerup', (event) => {
        if (!start) return;

        if (!brush) {
            const rect = rectangle(start, pointOf(event));
            selection = isLargeEnough(rect) ? rect : null;
            showSelection(selection);
        }
        start = null;
    });

    return {
        selection: () => selection,
        setBrush(on) {
            brush = on;
            stage.classList.toggle('is-brush', on);
        },
        show(layer, onLoaded) {
            size = null;
            selection = null;
            strokes = [];
            stage.innerHTML = stageMarkup(layer);
            if (isVideo(layer.image)) {
                image().addEventListener('loadedmetadata', ({ target }) =>
                    onLoaded({ height: target.videoHeight, width: target.videoWidth }),
                );
                return;
            }

            image().addEventListener('load', ({ target }) => {
                size = { height: target.naturalHeight, width: target.naturalWidth };
                stage.querySelector('.preview__overlay').setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
                onLoaded(size);
            });
        },
        strokes: () => strokes,
    };
}

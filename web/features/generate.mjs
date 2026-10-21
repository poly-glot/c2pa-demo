import { api } from '../api.mjs';

export const generateMarkup = () => `
    <form class="ai-bar generate" data-generate>
        <input class="ai-bar__input" name="prompt" aria-label="Describe an image to generate" placeholder="Describe an image to generate, e.g. “A glass bottle on a grey backdrop”" />
        <button class="is-primary" type="submit">Generate image</button>
        <p class="hint generate__note" aria-live="polite" data-generate-note></p>
    </form>`;

const generatedTitle = (date) => {
    const [day, time] = date.toISOString().split('T');

    return `AI-Generated_${day.replaceAll('-', '')}-${time.slice(0, 8).replaceAll(':', '')}`;
};

async function generate(form, store) {
    const note = form.querySelector('[data-generate-note]');
    const button = form.querySelector('button');
    const prompt = form.elements.prompt.value.trim();
    if (!prompt) {
        note.textContent = 'Describe the image first.';
        return;
    }

    button.disabled = true;
    note.textContent = 'Generating and signing…';
    try {
        const { image, provenance } = await api.create(prompt, generatedTitle(new Date()));
        store.addSource(image.title, { image: image.image, provenance, title: image.title });
        form.reset();
        note.textContent = '';
    } catch (error) {
        note.textContent = error.message;
    } finally {
        button.disabled = false;
    }
}

export function mountGenerate(root, store) {
    root.addEventListener('submit', (event) => {
        if (!event.target.matches('[data-generate]')) return;

        event.preventDefault();
        generate(event.target, store);
    });
}

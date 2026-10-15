# Lessons

- Chrome never resolves `image.decode()` in a hidden tab, so `loadImage` in `web/dom.mjs` must wait for `onload`; a `decode()` call hangs the tool.
- `c2pa.removed` removes an ingredient and needs one, so Erase records `c2pa.edited` with its region instead.
- Keep the credentialed asset as the ingredient and send the pixels separately: outpaint sends the padded image as model input while the real previous version stays the parent; template ingredients are the chosen layers, and adjusted pixels go only into the render.
- Give parallel agents disjoint file ownership in the plan's module table before they start, and reject edits outside it.
- Test with `node:test` and no DOM by keeping `document` access inside function bodies, as `web/edits/canvas-ops.mjs` does, so modules import under Node.
- Check UI copy against the vocabulary constants: the AI note in `web/features/toolbar.mjs` says `trainedAlgorithmicMedia`, but AI edits record `compositeWithTrainedAlgorithmicMedia`.
- A recorded action must match the pixels produced: template slot adjustments offer Export as PNG or WebP, which is recorded as a conversion, but the render is always JPEG.
- Shared prompt rules must not contradict a tool's own instruction: `EDIT_RULES` says keep the size, while the upscale instruction asks for twice the size.

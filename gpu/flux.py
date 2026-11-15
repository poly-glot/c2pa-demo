import base64
import io

import modal

CACHE = "/cache"
CREATE_MODEL = "black-forest-labs/FLUX.1-schnell"
EDIT_MODEL = "black-forest-labs/FLUX.1-Kontext-dev"

CREATE_SIZE = 1024
CREATE_STEPS = 4
EDIT_GUIDANCE = 2.5
EDIT_STEPS = 28

image = modal.Image.debian_slim(python_version="3.12").uv_pip_install(
    "accelerate==1.10.1",
    "diffusers==0.35.1",
    "fastapi[standard]==0.116.1",
    "hf_xet==1.1.9",
    "pillow==11.3.0",
    "protobuf==6.32.0",
    "sentencepiece==0.2.1",
    "torch==2.8.0",
    "transformers==4.56.1",
)

app = modal.App("c2pa-demo")
weights = modal.Volume.from_name("c2pa-demo-weights", create_if_missing=True)

gpu_function = app.cls(
    env={"HF_HOME": CACHE},
    gpu="H100",
    image=image,
    scaledown_window=300,
    secrets=[modal.Secret.from_name("huggingface")],
    startup_timeout=1200,
    timeout=600,
    volumes={CACHE: weights},
)

with image.imports():
    import torch
    from diffusers import FluxKontextPipeline, FluxPipeline
    from fastapi import HTTPException, Response
    from PIL import Image


def png_response(picture):
    buffer = io.BytesIO()
    picture.save(buffer, format="PNG")

    return Response(content=buffer.getvalue(), media_type="image/png")


def required_prompt(body):
    prompt = body.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise HTTPException(status_code=400, detail="expected a non-empty prompt")

    return prompt


@gpu_function
class Create:
    @modal.enter()
    def load(self):
        self.pipeline = FluxPipeline.from_pretrained(CREATE_MODEL, torch_dtype=torch.bfloat16).to("cuda")

    @modal.fastapi_endpoint(method="POST", label="c2pa-demo-create", requires_proxy_auth=True)
    def generate(self, body: dict):
        picture = self.pipeline(
            prompt=required_prompt(body),
            guidance_scale=0.0,
            height=CREATE_SIZE,
            num_inference_steps=CREATE_STEPS,
            width=CREATE_SIZE,
        ).images[0]

        return png_response(picture)


@gpu_function
class Edit:
    @modal.enter()
    def load(self):
        self.pipeline = FluxKontextPipeline.from_pretrained(EDIT_MODEL, torch_dtype=torch.bfloat16).to("cuda")

    @modal.fastapi_endpoint(method="POST", label="c2pa-demo-edit", requires_proxy_auth=True)
    def edit(self, body: dict):
        prompt = required_prompt(body)

        try:
            source = Image.open(io.BytesIO(base64.b64decode(body["image"]))).convert("RGB")
        except Exception as error:
            raise HTTPException(status_code=400, detail=f"expected a base64 image: {error}") from error

        picture = self.pipeline(
            image=source,
            prompt=prompt,
            guidance_scale=EDIT_GUIDANCE,
            num_inference_steps=EDIT_STEPS,
        ).images[0]

        return png_response(picture)

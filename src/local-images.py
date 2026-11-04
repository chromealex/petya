"""One offline image per process; releasing GPU memory after each request."""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'
import base64
import io
import json
import sys

def main():
    import torch
    from diffusers import AutoPipelineForText2Image
    request = json.loads(sys.stdin.readline())
    prompt = request['prompt']
    if not isinstance(prompt, str) or not 1 <= len(prompt) <= 4000:
        raise ValueError('Invalid image description')
    device = 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'
    pipe = AutoPipelineForText2Image.from_pretrained(sys.argv[1], torch_dtype=torch.float16 if device != 'cpu' else torch.float32, variant='fp16', use_safetensors=True, local_files_only=True).to(device)
    pipe.enable_attention_slicing()
    pipe.set_progress_bar_config(disable=True)
    with torch.inference_mode():
        result = pipe(prompt=prompt, num_inference_steps=2, guidance_scale=0.0, width=512, height=512)
    if result.nsfw_content_detected and any(result.nsfw_content_detected):
        raise ValueError('Модель не вернула изображение для этого описания.')
    image = result.images[0]
    # A black result typically indicates an unsupported precision/device combination.
    if max(channel[1] for channel in image.getextrema()) == 0:
        raise ValueError('Модель вернула пустое изображение.')
    output = io.BytesIO()
    image.save(output, format='PNG')
    print(json.dumps({'image': base64.b64encode(output.getvalue()).decode(), 'device': device}), flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)[:600]}), flush=True)
        sys.exit(1)

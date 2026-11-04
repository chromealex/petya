# Image Generation

The sources include the commands «Нарисуй кота-космонавта» (Draw a cat astronaut), «Сгенерируй изображение: лес на рассвете» (Generate an image: a forest at dawn), «Создай иллюстрацию …» (Create an illustration …). The result is shown in the chat and saved with the «Сохранить PNG» (Save PNG) button through the system dialog. The «Остановить генерацию» (Stop generation) button interrupts the process; cancelling during translation does not start the model.

Local option: SD-Turbo, PNG 512×512, two steps. The Russian description is translated by the selected local Ollama model. The generator runs as a separate process and frees memory after finishing. Weights are read only from disk (`HF_HUB_OFFLINE`, `local_files_only`), and safetensors are used. The first installation requires internet access and at least 6 GB of free space:

```sh
python3.10 scripts/setup-images.py
```

In the interface: **Настройки → Сервисы → Генерация изображений → Установить** (Settings → Services → Image generation → Install). The download starts only when the button is pressed. Installation stages, stopping and retrying after an error are available. Before the download, free space and the presence of Python 3.10–3.12 are checked. If a suitable Python is not found, the card offers to install it. Readiness is marked only after the model load has been verified.

Apple MPS, NVIDIA CUDA or CPU are supported. The button stores the environment and weights in `image-generator/runtime` inside Petya's user directory, shared between companies. They are kept when the app is updated. The CLI uses `runtime/images` and `runtime/models/sd-turbo` next to the sources. Weights are not included in the app installer. Generated images are stored inside the encrypted chat history and deleted together with it according to the existing retention period. PNGs exported by the user remain on disk. Editing attached images is not implemented yet.

Basis of the integration: [the official SD-Turbo model card](https://huggingface.co/stabilityai/sd-turbo). The model is limited in rendering text and fine details; terms of commercial use are stated in the model card.

## Verification on November 4, 2026

Unit tests passed for routing, the process protocol, errors, cancellation, parallel requests and timeout; regression tests passed for the capabilities list and chat history. Real generation has not been tested yet: the initial dependency installation stopped due to insufficient disk space on the Mac. The installer was tested with a mocked process (space, Python, stages, cancellation, retry, errors), as was the real Electron window (card, button, progress, cancellation, hint in the chat). The model was not downloaded during these tests.

At the owner's request, the RUVDS server option 194.87.110.60 was checked: 1 vCPU, 870 MiB RAM, 1 GB swap, 14 GB of free disk, no GPU; petya-auth is running. The generator was not installed on the server: resources are insufficient for the chosen Python/SD-Turbo runtime alongside the running authorization service. A choice is required between increasing resources or a separate server. The network generation client is not connected yet.

The owner chose the local option on the Mac with an optional one-button installation in the connections. The server option is postponed.

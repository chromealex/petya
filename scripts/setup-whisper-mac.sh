#!/bin/bash
# The speech runtime a Mac build ships (scripts/local-mac.py): whisper-server of whisper.cpp 1.9.5 with Metal
# (runtime/whisper-build/bin, shared libraries beside it) and the base model (runtime/models/ggml-base.bin).
# The Release workflow runs it on a clean Mac; on a developer Mac the runtime is usually there already.
set -euo pipefail
cd "$(dirname "$0")/.."
version=1.9.5
model_sha=60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe
if [ ! -x runtime/whisper-build/bin/whisper-server ]; then
  mkdir -p runtime
  [ -d "runtime/whisper.cpp-$version" ] || curl -fsSL "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v$version.tar.gz" | tar -xz -C runtime
  cmake -S "runtime/whisper.cpp-$version" -B runtime/whisper-build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=ON \
    -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_SDL2=OFF
  cmake --build runtime/whisper-build --config Release --target whisper-server -j "$(sysctl -n hw.ncpu)"
fi
mkdir -p runtime/models
model=runtime/models/ggml-base.bin
if [ ! -f "$model" ] || [ "$(shasum -a 256 "$model" | cut -d' ' -f1)" != "$model_sha" ]; then
  curl -fsSL -o "$model.download" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
  test "$(shasum -a 256 "$model.download" | cut -d' ' -f1)" = "$model_sha" || { rm -f "$model.download"; echo 'ggml-base.bin checksum mismatch' >&2; exit 1; }
  mv "$model.download" "$model"
fi
ls runtime/whisper-build/bin
